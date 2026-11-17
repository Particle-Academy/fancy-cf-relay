# Contributing to @particle-academy/fancy-cf-relay

Notes for anyone, human or agent, working ON this package's code. How to USE the
package is in [AGENTS.md](./AGENTS.md); what it is, is in [README.md](./README.md).
`CLAUDE.md` is a symlink to this file, so Claude Code reads these notes when it
works in this repo.

## Layout

- `src/index.ts` — the package entry (`createRelayChannel`).
- `src/detect.ts` — transport detection.
- `src/types.ts` — the public types.
- `src/__tests__/channel.test.ts` — the suite.

## Build and test

```bash
npm run build   # tsup (ESM + CJS + .d.ts)
npm run dev     # tsup --watch
npm run lint    # tsc --noEmit
npm test        # vitest run
```

Update `CHANGELOG.md` in the same commit as the change.
