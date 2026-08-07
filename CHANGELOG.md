# Changelog

Notable changes to `@particle-academy/fancy-cf-relay`.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

> Entries below **1.0** were reconstructed from git history when this file was
> introduced, so they summarise commit subjects rather than consumer impact.
> Everything from the next release onward is written by hand, in the same commit
> as the change.

---

## [Unreleased]

## 0.2.0 — 2026-08-07

### Changed

- **BREAKING — Node 22 is now declared as the floor.** `engines.node` is `>=22`, where this package previously declared **nothing at all**.

  Declaring nothing was not the same as supporting old Node: a consumer on 18 installed cleanly and found out at runtime.

  **What you must do:** on Node 22 or newer, nothing. Note npm only *warns* on an `engines` mismatch while **pnpm fails the install**, so this surfaces differently depending on your package manager. Node 18 is end-of-life and 20 is maintenance-only.

### Why

These are the kit 0.5 platform floors, applied across every package at once so a consumer never has to resolve a mix. **No API changed, nothing was removed, nothing was renamed** — only what the package requires.


## 0.1.3 — 2026-07-15

### Fixed

- wait for relay subscriber readiness

## 0.1.2 — 2026-06-27

### Fixed

- **security:** replace polynomial trailing-slash regex with linear trim

## 0.1.1 — 2026-06-19

- Maintenance only (1 internal commit).

## 0.1.0 — 2026-06-19

### Added

- CDN-safe relay channel (adaptive SSE↔long-poll + Cloudflare detection)
