// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRelayChannel, isBehindCloudflare } from "../index";

/** Minimal Headers stand-in (only `.has`/`.get` are used). */
function headers(map: Record<string, string> = {}) {
  return { has: (k: string) => k.toLowerCase() in map, get: (k: string) => map[k.toLowerCase()] ?? null };
}

afterEach(() => vi.restoreAllMocks());

describe("isBehindCloudflare", () => {
  it("is true when cf-ray is present, false otherwise / on error", async () => {
    const cf = vi.fn().mockResolvedValue({ headers: headers({ "cf-ray": "abc-ORD" }) });
    expect(await isBehindCloudflare({ url: "https://x", fetchImpl: cf as unknown as typeof fetch })).toBe(true);

    const plain = vi.fn().mockResolvedValue({ headers: headers({}) });
    expect(await isBehindCloudflare({ url: "https://x", fetchImpl: plain as unknown as typeof fetch })).toBe(false);

    const boom = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await isBehindCloudflare({ url: "https://x", fetchImpl: boom as unknown as typeof fetch })).toBe(false);
  });
});

describe("createRelayChannel — long-poll", () => {
  it("auto + Cloudflare → long-poll: delivers frames, reuses the subscriber, sends to outbox", async () => {
    const received: string[] = [];
    const posts: Array<{ url: string; body: unknown }> = [];
    let polls = 0;

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "HEAD") return { ok: true, headers: headers({ "cf-ray": "r" }) }; // behind CF
      if (u.includes("/poll")) {
        polls += 1;
        if (polls === 1) {
          return { ok: true, headers: headers({}), json: async () => ({ subscriber: "sub1", frames: ['{"jsonrpc":"2.0","id":1}'] }) };
        }
        return new Promise(() => {}); // park the 2nd poll so the loop idles
      }
      if (init?.method === "POST") {
        posts.push({ url: u, body: init.body });
        return { ok: true, headers: headers({}) };
      }
      return { ok: true, headers: headers({}) };
    });

    const handle = createRelayChannel({
      baseUrl: "/agent-relay",
      session: "s1",
      token: "tok",
      onFrame: (f) => received.push(f),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      EventSourceImpl: undefined,
    });

    await handle.start();
    await vi.waitFor(() => expect(received.length).toBe(1));
    expect(handle.mode).toBe("longpoll");
    expect(received[0]).toContain("jsonrpc");

    // the 2nd poll carries the subscriber the server handed back
    await vi.waitFor(() => expect(polls).toBeGreaterThanOrEqual(2));
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes("subscriber=sub1"))).toBe(true);

    handle.channel.sendToRemote({ jsonrpc: "2.0", method: "ping" });
    await vi.waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0].url).toContain("/agent-relay/s1/outbox");

    handle.stop();
  });
});

describe("createRelayChannel — SSE with fallback", () => {
  it("falls back to long-poll when the SSE stream errors before delivering (the CF/QUIC symptom)", async () => {
    class FakeEventSource {
      onopen: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      readyState = 0;
      private listeners: Record<string, (ev: unknown) => void> = {};
      constructor(public url: string) {
        // Simulate Cloudflare HTTP/3 resetting the stream: error, error, give up.
        setTimeout(() => {
          this.onerror?.({});
          this.onerror?.({});
        }, 0);
      }
      addEventListener(type: string, cb: (ev: unknown) => void) {
        this.listeners[type] = cb;
      }
      close() {
        this.readyState = 2;
      }
    }

    const received: string[] = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/poll")) {
        if (!polled) {
          polled = true;
          return { ok: true, headers: headers({}), json: async () => ({ subscriber: "s", frames: ['{"jsonrpc":"2.0"}'] }) };
        }
        return new Promise(() => {});
      }
      return { ok: true, headers: headers({}) };
    });

    const handle = createRelayChannel({
      baseUrl: "/agent-relay",
      session: "s2",
      token: "tok",
      transport: "sse",
      onFrame: (f) => received.push(f),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
    });

    await handle.start();
    await vi.waitFor(() => expect(handle.mode).toBe("longpoll"));
    await vi.waitFor(() => expect(received.length).toBe(1));
    handle.stop();
  });
});
