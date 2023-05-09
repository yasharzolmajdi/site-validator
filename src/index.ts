#! /usr/bin/env node
import * as dotenv from "dotenv";
dotenv.config();
import debug from "debug";
import {
  Worker,
  isMainThread,
  workerData,
  parentPort,
} from "node:worker_threads";
import { XMLParser } from "fast-xml-parser";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import getConfig, { Config } from "./config";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface WorkerData {
  index: number;
  urls: string[];
  config: Config;
  siteUrl: string;
}

interface UrlError {
  page: string;
  url: string;
  status?: number;
  reason?: string;
}

interface PromiseReturn {
  errors: UrlError[];
  passed: number;
}

interface SitemapData {
  sitemapindex?: {
    sitemap:
      | {
          loc: string;
        }
      | {
          loc: string;
        }[];
  };
  urlset?: {
    url: {
      loc: string;
    }[];
  };
}

async function request(url: string, attempts: number = 1): Promise<Response> {
  try {
    return await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
      },
    });
  } catch (error: any) {
    if (error.message === "fetch failed") {
      if (attempts === 3) {
        throw new Error(error);
      }

      await delay(5000);
      return await request(url, attempts + 1);
    }

    throw new Error(error);
  }
}

async function getSiteMapUrls(url: string, urls: string[] = []) {
  const request = await fetch(url);
  const data = await request.text();
  const parser = new XMLParser();
  const parsedSitemap = parser.parse(data) as SitemapData;

  const currentUrls = parsedSitemap.urlset?.url?.map((urls) => urls.loc);
  let otherUrls: string[] = [...urls, ...(currentUrls ?? [])];

  if (parsedSitemap.sitemapindex) {
    if (Array.isArray(parsedSitemap.sitemapindex.sitemap)) {
      for (
        let index = 0;
        index < parsedSitemap.sitemapindex.sitemap.length;
        index++
      ) {
        const element = parsedSitemap.sitemapindex.sitemap[index];
        otherUrls = await getSiteMapUrls(element.loc, otherUrls);
      }
    } else {
      otherUrls = await getSiteMapUrls(
        parsedSitemap.sitemapindex.sitemap.loc,
        otherUrls
      );
    }
  }

  return otherUrls;
}

function checkIfIgnored(url: string, ignoreList: string[]) {
  for (let index = 0; index < ignoreList.length; index++) {
    const element = ignoreList[index];
    if (
      element[0] === "*" &&
      element[element.length - 1] === "*" &&
      url.includes(element.replace(/\*/g, ""))
    ) {
      return true;
    }

    if (element[0] === "*" && url.endsWith(element.replace(/\*/g, ""))) {
      return true;
    }

    if (
      element[element.length - 1] === "*" &&
      url.startsWith(element.replace(/\*/g, ""))
    ) {
      return true;
    }

    if (element === url) {
      return true;
    }
  }

  return false;
}

(async () => {
  const config = await getConfig();

  const mainLog = debug("Main");
  const mainLogError = debug("Main:error");
  mainLogError.log = console.error.bind(console);

  const workerLogs = new Array(config.workers)
    .fill(null)
    .map((_, index) => debug(`Worker:${index}`));
  const logsBroadcastChannels = new Array(config.workers)
    .fill(null)
    .map((_, index) => new BroadcastChannel(`Worker:${index}`));

  if (isMainThread) {
    new Promise<PromiseReturn>(async (resolve, reject) => {
      mainLog("Fetching sitemap from", config.url);

      const urls = await getSiteMapUrls(
        new URL("/sitemap.xml", config.url).toString()
      );
      mainLog("Found", urls.length, "Pages to validate");

      let workerDataList = [];
      for (let i = config.workers; i > 0; i--) {
        workerDataList.push(urls.splice(0, Math.ceil(urls.length / i)));
      }

      let done = 0;
      let errors: UrlError[] = [];
      let passed = 0;

      mainLog("Validating....");
      for (let index = 0; index < workerDataList.length; index++) {
        const element = workerDataList[index];
        const worker = new Worker(__filename, {
          workerData: {
            index,
            urls: element,
            config,
            siteUrl: config.url,
          },
        });

        worker.on("message", (data: { errors: UrlError[]; pass: number }) => {
          done++;
          errors = [...errors, ...data.errors];
          passed += data.pass;
          if (done === 6) {
            resolve({ errors, passed });
          }
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0)
            reject(new Error(`Worker stopped with exit code ${code}`));
        });

        logsBroadcastChannels[index].onmessage = (event) => {
          workerLogs[index].call(this, "", ...event.data);
        };
      }
    }).then(async (data: PromiseReturn) => {
      if (data.errors.length > 0) {
        const content: string[] = ["url,page"];
        for (let index = 0; index < data.errors.length; index++) {
          const error = data.errors[index];
          mainLogError(
            `[${index + ``}/${data.errors.length}]`,
            "Failed to validate",
            error.url,
            "on page",
            error.page,
            "Status",
            error.status ?? "500",
            error.reason
          );
          content.push(`${error.url},${error.page}`);
        }

        process.exit(1);
      }

      mainLog(
        "Validated",
        data.passed + data.errors.length,
        "urls and all have passed"
      );
      process.exit(0);
    });
  } else {
    (async () => {
      const { index, urls, config, siteUrl } = workerData as WorkerData;

      const broadcastChannel = logsBroadcastChannels[index];
      broadcastChannel.postMessage(["Working on", urls.length, "URLs"]);
      let errors: UrlError[] = [];
      let pass = 0;
      const checkedUrls = new Set();

      async function validate(
        page: string,
        url: string,
        checkPage: boolean = false
      ) {
        if (
          checkedUrls.has(url) ||
          checkIfIgnored(new URL(url).toString(), config.ignoreUrls)
        ) {
          return;
        }

        broadcastChannel.postMessage(["validating", url]);

        checkedUrls.add(url);
        try {
          const requestResult = await request(url);

          if (!requestResult.ok && requestResult.status !== 403) {
            errors.push({
              page,
              url,
              status: requestResult.status,
              reason: requestResult.statusText,
            });
            return;
          }

          pass++;
          if (checkPage) {
            const data = await requestResult.text();
            const dom = new JSDOM(data);
            const links = dom.window.document.querySelectorAll("a");
            for (let index = 0; index < links.length; index++) {
              const link = links[index];
              const href = link.href;
              const regex = /^(https:\/\/)|(http:\/\/)/;
              if (regex.test(href)) {
                await validate(page, link.href);
              } else {
                await validate(page, new URL(link.href, siteUrl).toString());
              }
            }
          }
        } catch (e) {
          broadcastChannel.postMessage(["Exception", url, e]);
          errors.push({ page, url });
          return;
        }
      }

      for (let index = 0; index < urls.length; index++) {
        const url = urls[index];
        broadcastChannel.postMessage([
          `[${index + 1}/${urls.length}]`,
          "Checking",
          url,
        ]);
        await validate(url, url, true);
      }
      broadcastChannel.postMessage([
        "Done, Passed:",
        pass,
        ", Failed:",
        errors.length,
      ]);

      broadcastChannel.close();
      parentPort?.postMessage({ errors, pass });
    })();
  }
})();
