# Friction report: building Asli on Arkiv

Logged while building, in the order it happened. Each entry: surface, version, expected,
actual, steps to reproduce, suggested fix. Paths that worked are recorded with the same detail.

Environment: macOS 27, Node 24.21.0, `@arkiv-network/sdk` 0.8.1, `viem` 2.57.7, Tiramisu
testnet (chain 7738577), 16–18 Oct 2026.

## 1. Two different names for the lifetime parameter

- **Surface:** docs. `arkiv-ideathon/docs/ideation-guide.md` (linked from the challenge
  material) vs the SDK 0.8.1 README.
- **Expected:** one name for "how long an entity lives".
- **Actual:** the ideation guide says "the SDK's `expiresIn`, in seconds". In 0.8.1 the
  parameter is `expires`, built with `ExpirationTime.fromDays(...)` / `atDate(...)`. Passing
  `expiresIn` is a type error.
- **Repro:** follow the ideation guide's mental model, write
  `createEntity({ ..., expiresIn: 86400 })` against 0.8.1, run `tsc`.
- **Fix:** update the ideation guide (and any other 0.7-era pages) to `expires:
  ExpirationTime.*`.

## 2. `ExpirationTime.atDate` made "lifetime = validity" a one-liner (worked)

- **Surface:** SDK `ExpirationTime.atDate`, 0.8.1.
- **Tested:** a notice whose validity ends on a calendar date.
- **Expected:** having to convert a date to seconds or blocks myself.
- **Actual:** `atDate(date)` rounds up to the next block, so the entity lives at least until
  that instant. This is exactly the product rule. No conversion code in Asli.
