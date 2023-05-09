#!/usr/bin/env node
import { isMainThread } from "node:worker_threads";

import getConfig from "../helpers/getConfig";
import mainWorker from "./mainWorker";
import worker from "./worker";

async function linkValidator() {
  const config = await getConfig();

  const logsBroadcastChannels = new Array(config.workers)
    .fill(null)
    .map((_, index) => new BroadcastChannel(`Worker:${index}`));

  if (isMainThread) {
    mainWorker(config, logsBroadcastChannels, __filename);
  } else {
    await worker(logsBroadcastChannels);
  }
}

linkValidator();
