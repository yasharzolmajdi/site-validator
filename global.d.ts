interface WorkerData {
  index: number;
  allPages: string[];
  pagesToValidate: string[];
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