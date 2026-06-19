/**
 * Structural shape of agent-integrations' `RelayChannel` (we don't import it, to
 * stay dependency-free). The host wires the returned channel into
 * `attachRelay(server, channel)` and forwards received frames to
 * `transport.deliverFromRemote` via {@link RelayChannelOptions.onFrame}.
 */
export interface RelayChannel {
  /** Send a server→remote frame (the transport calls this). Posts to the relay. */
  sendToRemote: (frame: unknown) => void;
  /** Optional: the host's hook for when the server tears the transport down. */
  onClose?: () => void;
}

export type TransportMode = "sse" | "longpoll";

export interface RelayChannelOptions {
  /** Relay base URL, e.g. `"/agent-relay"` or `"https://host/agent-relay"`. */
  baseUrl: string;
  /** Session id. */
  session: string;
  /** Auth token (sent as `?token=`). */
  token: string;
  /**
   * `"auto"` (default): detect Cloudflare (the `cf-ray` header) and use
   * long-poll there, else SSE with an automatic long-poll fallback if the
   * stream errors before delivering. `"sse"` / `"longpoll"` force one.
   */
  transport?: "auto" | TransportMode;
  /** Which queue this side READS. A browser receives `"inbound"`. Default `"inbound"`. */
  receiveDirection?: "inbound" | "outbound";
  /** Endpoint outgoing frames POST to. A browser sends to `"outbox"`. Default `"outbox"`. */
  sendPath?: "inbox" | "outbox";
  /** Called with each received raw frame string — wire to `transport.deliverFromRemote`. */
  onFrame: (frame: string) => void;
  /** Fired once the receive channel is live, with the mode actually chosen. */
  onOpen?: (mode: TransportMode) => void;
  /** Non-fatal transport errors (a failed poll/post that will be retried). */
  onError?: (err: unknown) => void;
  /** The host's teardown hook, mirrored onto the returned channel. */
  onClose?: () => void;
  /** Long-poll server park-window hint in ms (sent as `?wait=`). Default 20000. */
  pollWaitMs?: number;
  /** Override the URL probed for Cloudflare detection. Default: `location.origin`. */
  detectUrl?: string;
  /** Inject `fetch`/`EventSource` for tests. */
  fetchImpl?: typeof fetch;
  EventSourceImpl?: typeof EventSource;
}

export interface RelayChannelHandle {
  /** Pass to `attachRelay(server, handle.channel)`. */
  channel: RelayChannel;
  /** Open the receive channel (resolves once a transport is chosen + started). */
  start: () => Promise<void>;
  /** Tear down the receive channel + fire `onClose`. */
  stop: () => void;
  /** The transport in use after `start()` (null before, may flip on fallback). */
  readonly mode: TransportMode | null;
}
