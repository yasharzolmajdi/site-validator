import delay from "./delay";

export default async function request(
  url: string,
  attempts: number = 1
): Promise<Response> {
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
