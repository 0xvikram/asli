# Asli: build guide

Asli checks whether a notice forwarded on WhatsApp is real. Institutions publish their
notices on Arkiv (Tiramisu testnet). Anyone pastes the forward, uploads the PDF or a
screenshot, or types the notice code, and gets one of: **real**, **altered** (with the exact
words changed), **revoked**, **expired**, or **unknown**.

Built for the Arkiv Global Tour Stop (deadline 18 Oct 2026, 23:59 London). Rules:
https://github.com/Arkiv-Network/global-tour-stop-pre-devcon

## Rules for working in this repo

- Work on the `dev` branch and push after each phase. Never push to `main`; Vikram merges.
- After every phase run **all** tests (`npm test`), `npm run typecheck` and `npm run lint`.
  Do not start the next phase until all of them pass.
- On-chain tests live in `tests/integration/` and only run with `ARKIV_INTEGRATION=1`
  (they need funded issuer wallets in `.env.local`). Run them once keys are present.
- Secrets live only in `.env.local` (gitignored): issuer private keys and `ARKIV_ACCESS_KEY`.
  Never import them from client components. Never put them in a `NEXT_PUBLIC_` variable.
- Synthetic data only. Fictional issuers ("Demo Board of Secondary Education", "Pune Demo
  University", "Acme Infotech"). No real CBSE/NTA names or logos, no real people.
  Offer letters: only the file hash goes on chain, never a candidate's name.
- Log every Arkiv surprise in `arkiv/friction.md` as it happens: expected, actual, version,
  steps to reproduce, suggested fix. Never invent one.
- Use Arkiv's terms: "Entity Expiration", "Lifetime Extension". Not "TTL".

## Phases

Each phase lists what it delivers and the tests that must pass.

### Phase 1: core logic (no network)
- `src/lib/normalize.ts`: clean notice text (Unicode NFKC, Devanagari digits, emoji,
  punctuation, WhatsApp "Forwarded" prefix, spacing) and hash it (keccak256).
- `src/lib/match.ts`: word-level diff and similarity; classify a pasted text against
  candidate notices as exact / altered / unrelated, and describe what changed.
- `src/lib/schema.ts`: the entity model: attribute names, kinds, lifetimes, and builders
  that turn a notice/issuer/amendment/revocation/offer into SDK create parameters.
- `src/lib/domainProof.ts`: parse and check `/.well-known/asli-issuer.json` and DNS-TXT
  `asli-issuer=<address>` records.
- Tests: `tests/unit/normalize.test.ts`, `match.test.ts`, `schema.test.ts`,
  `domainProof.test.ts`.

### Phase 2: Arkiv data layer
- `src/lib/arkiv/client.ts`: public client (HTTP + WebSocket) and server wallet clients
  (access key sent as an `X-API-KEY` header, server-side only).
- `src/lib/arkiv/read.ts`: queries: by text hash, by code, by file hash, active notices of an
  issuer (`createdBy`, cursor pagination), issuers, amendments, revocations.
- `src/lib/arkiv/write.ts`: register issuer, issue notice (readonly), postpone (atomic batch:
  Lifetime Extension of the notice + an amendment entity), revoke (atomic batch: revocation
  entity + delete the notice), register offer letter.
- `src/lib/verify.ts`: the verdict engine that combines read + match + issuer trust.
- Tests: `tests/unit/write.test.ts` and `verify.test.ts` use a fake client that records
  calls; `tests/integration/*.test.ts` hit Tiramisu.

### Phase 3: server API
- `src/app/api/issuer/[action]/route.ts`: `issue`, `postpone`, `revoke`, `offer`: input
  validation, demo-issuer allowlist, per-IP rate limit, signs with that issuer's own key.
- `src/app/.well-known/asli-issuer.json/route.ts`: domain proof for the demo issuers.
- `src/lib/ratelimit.ts`, `src/lib/issuers.ts` (demo issuer registry).
- Tests: `tests/unit/api.test.ts`, `ratelimit.test.ts`, `wellknown.test.ts`.

### Phase 4: UI
- `/`: Verify (paste text, PDF, screenshot OCR, notice code) with the verdict card and diff.
- `/board`: live notices from all verified issuers (WebSocket entity events, no refresh).
- `/issuer/[address]`: an issuer's page with its domain proof and active notices.
- `/publish`: playground to publish/postpone/revoke as a demo issuer (server signs), plus a
  MetaMask console where the connected wallet signs.
- `/offer`: offer-letter check (PDF hash only).
- `/about`: why Arkiv, what stays off Arkiv, the exact queries.
- Tests: `tests/unit/ui-helpers.test.ts`; `npm run build` must succeed.

### Phase 5: seed, docs, submission
- `scripts/seed.ts`: registers the demo issuers and publishes notices covering every
  verdict (real, altered, postponed, revoked, expired).
- `arkiv/schema.md`, `arkiv/friction.md`, `README.md`, `LICENSE` (MIT).
- Tests: `tests/unit/docs.test.ts` checks the required files exist and that schema.md lists
  every entity kind, lifetime and query defined in `src/lib/schema.ts`.

## Commands
- `npm run dev`: local app
- `npm test`: all unit tests; `ARKIV_INTEGRATION=1 npm test`: also on-chain tests
- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run seed`: publish the demo data (needs funded keys)
