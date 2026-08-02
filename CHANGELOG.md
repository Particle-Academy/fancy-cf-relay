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
