import debug from "debug";
import { Worker } from "node:worker_threads";

import { Config } from "../helpers/getConfig";
import getPagesFromSiteMap from "./getPagesFromSiteMap";

const log = debug("Main");
const errorLog = debug("Main:error");
errorLog.log = console.error.bind(console);

export default (
  config: Config,
  logsBroadcastChannels: BroadcastChannel[],
  workerFile: string
) => {
  new Promise<PromiseReturn>(async (resolve, reject) => {
    const workerLogs = new Array(config.workers)
      .fill(null)
      .map((_, index) => debug(`Worker:${index}`));

    log("Fetching sitemap from", config.url);

    const urls = await getPagesFromSiteMap(
      new URL("/sitemap.xml", config.url).toString()
    );
    log("Found", urls.length, "Pages to validate");

    let workerDataList = [];
    for (let i = config.workers; i > 0; i--) {
      workerDataList.push(urls.splice(0, Math.ceil(urls.length / i)));
    }

    let done = 0;
    let errors: UrlError[] = [];
    let passed = 0;

    log("Validating....");
    for (let index = 0; index < workerDataList.length; index++) {
      const pagesToValidate = workerDataList[index];
      const otherPages = workerDataList.reduce((acc, current, reduceIndex) => {
        if (reduceIndex === index) {
          return acc;
        }
        return [...acc, ...current];
      }, []);

      const worker = new Worker(workerFile, {
        workerData: {
          index,
          allPages: otherPages,
          pagesToValidate,
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
        errorLog(
          `[${index + 1 + ``}/${data.errors.length}]`,
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
    }

    log(
      "Validated",
      data.passed + data.errors.length,
      ", passed:",
      data.passed,
      ', failed:',
      data.errors.length
    );
    process.exit(data.errors.length > 0 ? 1 : 0);
  });
};
