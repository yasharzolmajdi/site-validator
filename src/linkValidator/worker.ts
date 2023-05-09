import { workerData, parentPort } from "node:worker_threads";
import { JSDOM } from "jsdom";

import request from "../helpers/request";
import isUrlIgnored from "../helpers/isUrlIgnored";

export default async (logsBroadcastChannels: BroadcastChannel[]) => {
  const { index, pagesToValidate, allPages, config, siteUrl } =
    workerData as WorkerData;

  const broadcastChannel = logsBroadcastChannels[index];
  broadcastChannel.postMessage(["Working on", pagesToValidate.length, "URLs"]);
  let errors: UrlError[] = [];
  let pass = 0;
  const checkedUrls = new Set(allPages);

  async function validate(
    page: string,
    url: string,
    checkPage: boolean = false
  ) {
    if (
      checkedUrls.has(url) ||
      isUrlIgnored(new URL(url).toString(), config.ignoreUrls)
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
    } catch (error: any) {
      broadcastChannel.postMessage(["Exception", url, error]);
      errors.push({ page, url, status: 500, reason: error.message });
      return;
    }
  }

  for (let index = 0; index < pagesToValidate.length; index++) {
    const url = pagesToValidate[index];
    broadcastChannel.postMessage([
      `[${index + 1}/${pagesToValidate.length}]`,
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
};
