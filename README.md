# @particle-academy/fancy-cf-relay

A **CDN-safe browser relay channel** for [`agent-integrations`](https://github.com/Particle-Academy/agent-integrations)' `RelayTransport`.

## Why this exists

The MCP relay's receive leg is normally a long-lived **SSE** stream. Behind a
**Cloudflare HTTP/3 (QUIC)** edge, that stream gets reset
(`net::ERR_QUIC_PROTOCOL_ERROR`) and agent connect-and-drive silently dies. The
failure is in the edge, not the app — so no header or flush fixes it.

This channel keeps **SSE where it works** and transparently uses **long-poll**
(short requests QUIC is happy with — only *long-lived* streams break) where it
doesn't. It auto-detects Cloudflare via the `cf-ray` header and falls back if SSE
errors before delivering. No disabling HTTP/3, no config.

> Not Cloudflare-specific under the hood — it survives any CDN/proxy that's
> hostile to long-lived SSE. The name just names the case you'll hit first.

## Install

```bash
npm i @particle-academy/fancy-cf-relay
```

## Use

```ts
import { createRelayChannel } from "@particle-academy/fancy-cf-relay";
import { attachRelay } from "@particle-academy/agent-integrations";

const handle = createRelayChannel({
  baseUrl: "/agent-relay",
  session,
  token,
  transport: "auto",                 // "auto" | "sse" | "longpoll"
  onFrame: (raw) => transport.deliverFromRemote(raw),
});

const transport = attachRelay(server, handle.channel);
await handle.start();   // opens the receive leg (SSE or long-poll)
// …
handle.stop();          // tears it down
```

`transport: "auto"` (default): behind Cloudflare → long-poll immediately;
otherwise SSE, falling back to long-poll if the stream errors early.
`handle.mode` reports the transport actually in use.

## The poll wire-protocol (server side)

Long-poll expects a `poll` endpoint alongside the existing relay routes:

```
GET {baseUrl}/{session}/poll?token=…&direction=inbound&wait=20000&subscriber=…
  → 200 application/json  { "subscriber": "<id>", "frames": ["<raw frame>", …] }
```

The server registers `subscriber` (returning a fresh id when absent), parks up to
`wait` ms draining that subscriber's frame queue, then returns (possibly empty).
The client re-polls immediately, sending the `subscriber` back each time.

> Park length matters by runtime: on **Node** a parked request is ~free (event
> loop); on **PHP-FPM** it holds a worker for the park window, so keep `wait`
> ≤ ~20s and leave FPM headroom. Drop-in endpoints: the Node relay server in
> `agent-integrations`, and the `particle-academy/fancy-cf-relay` Laravel
> companion.

Outgoing frames POST as before — `POST {baseUrl}/{session}/outbox?token=…` —
short requests, unaffected by the edge.

## License

MIT
