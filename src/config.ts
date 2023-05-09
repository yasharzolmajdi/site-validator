import fs from "fs/promises";

const ARGS: Record<string, string> = {
  "--url": "url",
  "--workers": "workers",
  "--successStatusCodes": "successStatusCodes",
  "--ignoreUrls": "ignoreUrls",
};

export interface Config {
  url: string;
  workers: number;
  successStatusCodes: string[];
  ignoreUrls: string[];
}

export default async function getConfig() {
  const jumpIndex = process.argv.findIndex((item) => !!ARGS[item]);
  const args = process.argv.slice(jumpIndex);

  let config: Config = {
    url: "",
    workers: 1,
    successStatusCodes: ["2**"],
    ignoreUrls: [],
  };

  try {
    const configData = await fs.readFile("./validationConfig.json", "utf-8");
    config = {
      ...config,
      ...JSON.parse(configData),
    };
  } catch {}

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index] as keyof typeof ARGS;
    const value = args[index + 1];
    if (value) {
      switch (key) {
        case "--url":
          config.url = value;
          break;
        case "--workers":
          config.workers = parseInt(value);
          break;
        case "--successStatusCodes":
          config.successStatusCodes = value.split(",");
          break;
        case "--ignoreUrls":
          config.ignoreUrls = value.split(",");
          break;
      }
    }
  }

  return config;
}
