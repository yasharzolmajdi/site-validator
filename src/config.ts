import fs from "fs/promises";

const ARGS = {
  "--workers": "workers",
  "--successStatusCodes": "successStatusCodes",
  "--ignoreUrls": "ignoreUrls",
};

export interface Config {
  workers: number;
  successStatusCodes: string[];
  ignoreUrls: string[];
}

export default async function getConfig() {
  const args = process.argv.slice(3);

  let config: Config = {
    workers: 6,
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
