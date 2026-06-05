export function buildTelnyxMediaWebSocketUrl(publicBaseUrl: string) {
  const normalizedBaseUrl = publicBaseUrl.replace(/\/+$/, "");

  if (normalizedBaseUrl.startsWith("https://")) {
    return `${normalizedBaseUrl.replace(/^https:\/\//, "wss://")}/telnyx/media`;
  }

  if (normalizedBaseUrl.startsWith("http://")) {
    return `${normalizedBaseUrl.replace(/^http:\/\//, "ws://")}/telnyx/media`;
  }

  const url = new URL(normalizedBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/telnyx/media";
  url.search = "";
  url.hash = "";
  return url.toString();
}
