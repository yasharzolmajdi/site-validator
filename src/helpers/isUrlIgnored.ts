export default function isUrlIgnored(url: string, ignoreList: string[]) {
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