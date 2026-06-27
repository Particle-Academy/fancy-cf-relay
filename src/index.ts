/**
 * @particle-academy/fancy-cf-relay
 *
 * A CDN-safe browser relay channel for agent-integrations' `RelayTransport`.
 * The MCP relay's receive leg is normally a long-lived SSE stream — which a
 * Cloudflare HTTP/3 (QUIC) edge resets (`net::ERR_QUIC_PROTOCOL_ERROR`), killing
 * agent connect-and-drive. This channel keeps SSE where it works and transparently
 * uses **long-poll** (short requests that QUIC is happy with) where it doesn't —
 * auto-detecting Cloudflare via the `cf-ray` header and falling back if SSE errors.
 *
 *   const handle = createRelayChannel({ baseUrl: "/agent-relay", session, token, onFrame });
 *   attachRelay(server, handle.channel);   // agent-integrations
 *   await handle.start();
 *   // …later
 *   handle.stop();
 *
 * Zero runtime deps; uses only `fetch` + `EventSource`.
 */
import type {
  RelayChannel,
  RelayChannelHandle,
  RelayChannelOptions,
  TransportMode,
} from "./types";
import { isBehindCloudflare } from "./detect";

export type {
  RelayChannel,
  RelayChannelHandle,
  RelayChannelOptions,
  TransportMode,
} from "./types";
export { isBehindCloudflare } from "./detect";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const trimRight = (s: string): string => {
  // Linear trailing-slash trim — avoids the polynomial backtracking of /\/+$/.
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* "/" */) end -= 1;
  return s.slice(0, end);
};
const enc = encodeURIComponent;

/** Open the SSE receive leg. Calls `onFail` (once) if it can't deliver. */
function startSse(
  url: string,
  ES: typeof EventSource,
  onFrame: (raw: string) => void,
  onOpen: () => void,
  onFail: () => void,
): () => void {
  const es = new ES(url);
  let gotFrame = false;
  let opened = false;
  let errors = 0;
  let done = false;

  const fail = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try {
      es.close();
    } catch {
      /* ignore */
    }
    onFail();
  };

  // Never connected at all (a Cloudflare/QUIC edge that won't open) → fall back.
  const timer = setTimeout(() => {
    if (!opened && !gotFrame) fail();
  }, 8000);

  es.onopen = (): void => {
    opened = true;
    onOpen();
  };
  es.addEventListener("mcp", (ev: MessageEvent): void => {
    gotFrame = true;
    errors = 0;
    clearTimeout(timer);
    onFrame(String(ev.data));
  });
  es.onerror = (): void => {
    errors += 1;
    // Connected-then-reset loops (the classic CF HTTP/3 SSE symptom) or a worker
    // that gave up: bail to long-poll. A healthy stream that has delivered frames
    // is left alone — EventSource handles its own transient reconnects.
    if (!gotFrame && (errors >= 2 || es.readyState === 2 /* CLOSED */)) fail();
  };

  return (): void => {
    done = true;
    clearTimeout(timer);
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}

/** Open the long-poll receive leg. Resilient: backs off + retries on errors. */
function startLongPoll(
  base: string,
  session: string,
  token: string,
  direction: string,
  waitMs: number,
  fetchImpl: typeof fetch,
  onFrame: (raw: string) => void,
  onOpen: () => void,
  onError: (err: unknown) => void,
): () => void {
  const ctrl = new AbortController();
  let stopped = false;
  let subscriber = "";

  void (async (): Promise<void> => {
    onOpen();
    let backoff = 500;
    while (!stopped) {
      const u =
        `${base}/${enc(session)}/poll?token=${enc(token)}&direction=${enc(direction)}&wait=${waitMs}` +
        (subscriber ? `&subscriber=${enc(subscriber)}` : "");
      try {
        const res = await fetchImpl(u, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) {
          onError(new Error(`relay poll ${res.status}`));
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 5000);
          continue;
        }
        const data = (await res.json()) as { subscriber?: string; frames?: unknown[] };
        if (typeof data.subscriber === "string") subscriber = data.subscriber;
        for (const f of data.frames ?? []) {
          onFrame(typeof f === "string" ? f : JSON.stringify(f));
        }
        backoff = 500; // healthy round-trip → reset the backoff
      } catch (err) {
        if (stopped || ctrl.signal.aborted) break;
        onError(err);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 5000);
      }
    }
  })();

  return (): void => {
    stopped = true;
    ctrl.abort();
  };
}

/**
 * Build a CDN-safe relay channel. Returns a handle whose `.channel` plugs into
 * agent-integrations' `attachRelay(server, channel)`; call `start()` to open the
 * receive leg and `stop()` to tear it down.
 */
export function createRelayChannel(options: RelayChannelOptions): RelayChannelHandle {
  const base = trimRight(options.baseUrl);
  const { session, token } = options;
  const transport = options.transport ?? "auto";
  const receiveDirection = options.receiveDirection ?? "inbound";
  const sendPath = options.sendPath ?? "outbox";
  const waitMs = options.pollWaitMs ?? 20000;
  const fetchImpl =
    options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  const ES = options.EventSourceImpl ?? (typeof EventSource !== "undefined" ? EventSource : undefined);

  let mode: TransportMode | null = null;
  let stopReceive: (() => void) | null = null;

  const sendToRemote = (frame: unknown): void => {
    if (!fetchImpl) return;
    const body = typeof frame === "string" ? frame : JSON.stringify(frame);
    void fetchImpl(`${base}/${enc(session)}/${sendPath}?token=${enc(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch((err) => options.onError?.(err));
  };

  const channel: RelayChannel = { sendToRemote, onClose: options.onClose };

  const beginLongPoll = (): void => {
    if (!fetchImpl) return;
    mode = "longpoll";
    stopReceive = startLongPoll(
      base,
      session,
      token,
      receiveDirection,
      waitMs,
      fetchImpl,
      options.onFrame,
      () => options.onOpen?.("longpoll"),
      (err) => options.onError?.(err),
    );
  };

  const beginSse = (): void => {
    if (!ES) {
      beginLongPoll();
      return;
    }
    mode = "sse";
    const url = `${base}/${enc(session)}/events?token=${enc(token)}&direction=${enc(receiveDirection)}`;
    stopReceive = startSse(
      url,
      ES,
      options.onFrame,
      () => options.onOpen?.("sse"),
      () => beginLongPoll(), // SSE couldn't hold → switch to long-poll
    );
  };

  const start = async (): Promise<void> => {
    if (transport === "longpoll") {
      beginLongPoll();
      return;
    }
    if (transport === "sse") {
      beginSse();
      return;
    }
    // auto: behind Cloudflare → skip the doomed SSE attempt; else SSE w/ fallback.
    const cloudflare = await isBehindCloudflare({ url: options.detectUrl, fetchImpl });
    if (cloudflare || !ES) beginLongPoll();
    else beginSse();
  };

  const stop = (): void => {
    stopReceive?.();
    stopReceive = null;
    channel.onClose?.();
  };

  return {
    channel,
    start,
    stop,
    get mode() {
      return mode;
    },
  };
}
