import { XMLParser } from "fast-xml-parser";
import { Config } from "../helpers/getConfig";

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

export default async function getPagesFromSiteMap(
  url: string,
  urls: string[] = [],
  config: Config
) {
  const Url = new URL(url);
  Url.host = new URL(config.url).host;

  const request = await fetch(Url.toString());
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
        otherUrls = await getPagesFromSiteMap(element.loc, otherUrls, config);
      }
    } else {
      otherUrls = await getPagesFromSiteMap(
        parsedSitemap.sitemapindex.sitemap.loc,
        otherUrls,
        config
      );
    }
  }

  return otherUrls.map((item) => {
    const itemUrl = new URL(item);
    itemUrl.host = new URL(config.url).host;
    return itemUrl.toString();
  });
}
