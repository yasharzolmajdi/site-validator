#!/usr/bin/env node
import debug from "debug";
import validator from "html-validator";

import getConfig from "../helpers/getConfig";
import getPagesFromSiteMap from "../linkValidator/getPagesFromSiteMap";

const log = debug("Main");

async function htmlValidator() {
  const config = await getConfig();

  log("Fetching sitemap from", config.url);

  const urls = await getPagesFromSiteMap(
    new URL("/sitemap.xml", config.url).toString()
  );
  log("Found", urls.length, "Pages to validate");

  const errors: Record<string, validator.ValidationMessageObject[]> = {};
  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    try {
      log(`[${index + 1}/${urls.length}] Checking`, url);
      const result = await validator({
        url,
      });

      const pageErrors = result.messages.filter(
        (message) => message.type === "error"
      );
      log(
        "Done,",
        pageErrors.length,
        pageErrors.length === 1 ? "error found" : "errors found"
      );
      errors[url] = pageErrors;
    } catch (error) {
      console.error(error);
    }
  }

  const errorList = Object.entries(errors);

  log(
    "All pages validated,",
    errorList.length,
    errorList.length === 1 ? "page failed" : "pages failed"
  );

  errorList.forEach(([url, pageErrors], index) => {
    log(
      `[${index + 1}/${errorList.length}]`,
      url,
      pageErrors.length,
      pageErrors.length === 1 ? "error" : "errors"
    );
    for (let index = 0; index < pageErrors.length; index++) {
      const pageError = pageErrors[index];
      log(`(${index + 1}/${pageErrors.length}) Error, %O`, pageError);
    }
  });

  process.exit(errorList.length > 0 ? 1 : 0);
}

htmlValidator();
