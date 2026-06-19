/**
 * Is the origin served through Cloudflare? Cloudflare stamps every proxied
 * response with a `cf-ray` header, so a single HEAD reveals it. Used by the
 * `"auto"` transport to skip a doomed SSE attempt and go straight to long-poll
 * when behind Cloudflare (whose HTTP/3/QUIC edge resets long-lived SSE streams).
 *
 * Conservative by design: any error, or no `window`/`fetch`, returns `false`
 * (assume not-Cloudflare → try SSE; the channel still falls back on failure).
 */
export async function isBehindCloudflare(options: {
  url?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<boolean> {
  const f =
    options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  const url =
    options.url ?? (typeof location !== "undefined" ? location.origin : undefined);
  if (!f || !url) return false;
  try {
    const res = await f(url, { method: "HEAD", cache: "no-store" });
    // Header presence is the signal; value (the ray id) doesn't matter.
    return res.headers.has("cf-ray");
  } catch {
    return false;
  }
}
