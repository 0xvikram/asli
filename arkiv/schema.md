# Asli on Arkiv: schema

Network: Tiramisu testnet (chain 7738577). SDK: `@arkiv-network/sdk` 0.8.1.
Source of truth in code: [`src/lib/schema.ts`](../src/lib/schema.ts) (builders, lifetimes,
queries). A unit test (`tests/unit/docs.test.ts`) fails if this file and the code drift apart.

## Design rules

- Every entity has `app = "asli_v1"` so Asli never reads another project's entities.
- **Who issued something is never an attribute.** It is the entity's `$creator`, which the chain
  sets and nobody can forge. Trust = `$creator` + a domain that lists that wallet
  (`/.well-known/asli-issuer.json` or DNS TXT `_asli.<domain>` → `asli-issuer=0x…`).
- What the app filters on lives in typed attributes (`u64` timestamps for ranges, `bytes32`
  hashes, `key` links). Everything only displayed lives in the JSON payload.
- **Lifetime is product logic.** A notice lives exactly as long as it is valid.

## Entity types

### `issuer`
An institution's claim to a name and domain. Anyone can create one; only a domain that lists the
creator's wallet makes it trusted.

| Attribute | Type | Notes |
|---|---|---|
| `app` | str | `asli_v1` |
| `kind` | str | `issuer` |
| `domain` | str | lowercased hostname; checked against the domain's own proof |
| `category` | str | `board` · `university` · `employer` · `government` |
| `name` | str | display name (≤128 bytes) |

Payload: `{ name, domain, category, about }`.
Lifetime: **365 days, renewed yearly by the issuer (Lifetime Extension)**. An issuer that stops
renewing drops off the verified list instead of vouching forever. Flags: none (the issuer may
patch its own profile).

### `notice`
One published circular, exactly as people will forward it.

| Attribute | Type | Notes |
|---|---|---|
| `app`, `kind` | str | `asli_v1`, `notice` |
| `code` | str | short retypeable code printed on the notice, e.g. `DBSE-26-7K3Q` |
| `text_hash` | bytes32 | keccak256 of the normalized text (see below) |
| `file_hash` | bytes32 | optional: keccak256 of the official PDF |
| `category` | str | `exam` · `result` · `admission` · `holiday` · `recruitment` · `fees` · `general` |
| `lang` | str | `en` · `hi` · `mixed` |
| `issued_at` | u64 | ms since epoch |
| `valid_until` | u64 | ms since epoch, the validity at issue time (range queries) |

Payload: `{ title, body, refNo }`.
Lifetime: **until the notice's own valid-until date (ExpirationTime.atDate)**, built with
`ExpirationTime.atDate(validUntil)`. An
expired circular stops verifying as current. Postponement extends it.
Flags: **`readonly`**. Nobody, not even the issuer, can quietly reword a published notice. It can
only be extended (postponed) or deleted (revoked), and both leave a public record.

Normalization before hashing (`src/lib/normalize.ts`): Unicode NFKC, Devanagari digits → ASCII,
zero-width characters removed, lowercase, every run of non-letter/mark/digit characters → one
space, WhatsApp banners ("Forwarded many times", "please share…") dropped. Hindi matras are kept.

### `amendment`
Why a notice's lifetime was extended.

| Attribute | Type | Notes |
|---|---|---|
| `app`, `kind` | str | `asli_v1`, `amendment` |
| `notice` | key | the notice it explains |
| `new_valid_until` | u64 | ms |
| `issued_at` | u64 | ms |

Payload: `{ reason }`.
Lifetime: **until the new valid-until date + 30 days**, so late forwards still get the
explanation. Flags: `readonly`.
Written in **one atomic batch** with the notice's `extendEntity`: a reader can never see a
notice living longer with no reason, or a reason for an extension that never happened.

### `revocation`
A withdrawn notice.

| Attribute | Type | Notes |
|---|---|---|
| `app`, `kind` | str | `asli_v1`, `revocation` |
| `notice` | key | the deleted notice |
| `text_hash` | bytes32 | so a pasted forward finds the revocation |
| `code` | str | so a typed code finds the revocation |
| `revoked_at` | u64 | ms |

Payload: `{ title, reason }`.
Lifetime: **180 days, permissionless extension**. Anyone (a school, a fact-checker) can keep the
warning alive while the withdrawn notice still circulates; nobody but the issuer can change it.
Flags: `readonly`, `permissionlessExtension`.
Written in **one atomic batch** with the notice's delete.

### `offer`
A job offer letter, by fingerprint only.

| Attribute | Type | Notes |
|---|---|---|
| `app`, `kind` | str | `asli_v1`, `offer` |
| `file_hash` | bytes32 | keccak256 of the PDF |
| `role_code` | str | employer's role reference |
| `issued_at` | u64 | ms |
| `valid_until` | u64 | acceptance deadline, ms |

Payload: `{ roleTitle, location }`. **No candidate data, not even hashed.**
Lifetime: **until the offer's acceptance deadline**. A job offer past its deadline is no longer an
offer, and a scammer cannot reuse it. Flags: `readonly`.

## Queries the app runs

Written in Arkiv's query language; the app builds them with the SDK's `and` / `eq` combinators.

| Name | Query | Used by |
|---|---|---|
| noticeByTextHash | `app = str('asli_v1') AND kind = str('notice') AND text_hash = bytes32(<hash>)` | Verify (paste, screenshot) |
| noticeByCode | `app = str('asli_v1') AND kind = str('notice') AND code = str(<CODE>)` | Verify (code) |
| noticeByFileHash | `app = str('asli_v1') AND kind = str('notice') AND file_hash = bytes32(<hash>)` | Verify (PDF) |
| activeNoticesOfIssuer | `app = str('asli_v1') AND kind = str('notice') AND $creator = addr(<issuer>)` | Fuzzy match, board, issuer page (cursor-paginated, 200/page, ≤5 pages) |
| noticesValidBetween | `app = str('asli_v1') AND kind = str('notice') AND valid_until >= u64(<from>) AND valid_until <= u64(<to>)` | Range filter (documented for reuse) |
| issuers | `app = str('asli_v1') AND kind = str('issuer')` | Trust list (then domain proof per creator) |
| amendmentsOfNotice | `app = str('asli_v1') AND kind = str('amendment') AND notice = key(<noticeKey>)` | "Postponed" on real verdicts |
| revocationByTextHash | `app = str('asli_v1') AND kind = str('revocation') AND text_hash = bytes32(<hash>)` | Revoked verdict |
| revocationByCode | `app = str('asli_v1') AND kind = str('revocation') AND code = str(<CODE>)` | Revoked verdict |
| offerByFileHash | `app = str('asli_v1') AND kind = str('offer') AND file_hash = bytes32(<hash>)` | Offer check |

Also:
- `$key = key(<k>)` combined with `kind = notice`: fetch one notice (API ownership checks, board updates).
- **Historical reads:** `noticeByTextHash` / `noticeByCode` with `atBlock` at 13 look-backs
  (8 points from 6 hours to 7 days, in parallel, 8 s timeout each) to tell "was real, has expired" from
  "never existed".
- **Live:** `watchEntityEvents` over WebSocket (`wss://rpc.tiramisu.db-chain.testnet.arkiv.network`),
  no `fromBlock`. Created / ExpiryExtended / Deleted events whose owner is a trusted issuer update
  the board in place.

## Verdict order (`src/lib/verify.ts`)

1. **revoked**: a revocation by a trusted issuer matches the text hash or code
2. **real**: an exact live notice from a trusted issuer (with amendments, if postponed)
3. **altered**: ≥60% of words shared with a trusted issuer's live notice; the word diff is shown
4. **unverified-issuer**: exact match, but no domain lists the publishing wallet
5. **expired**: found only at an earlier block
6. **unknown**: nothing like it from any trusted issuer

## Wallets that create entities (Tiramisu)

| Wallet | Role |
|---|---|
| `0x2043DB00a32bd8C4804227B72b97438af39a7De6` | Demo Board of Secondary Education (verified via `asli-board.vercel.app`) |
| `0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81` | Pune Demo University (verified via `asli-puneuni.vercel.app`) |
| `0x51Ad2Cf42bc81C254bcdd078e15c75890532905f` | Acme Infotech, offer letters (verified via `asli-acme.vercel.app`) |
| impostor (see `arkiv/seed-output.json`) | Claims the board's name and domain; the domain does not list it |

Playground writes from the public site are signed by the same three issuer wallets. MetaMask
console writes are signed by the visitor's own wallet.

## What stays off Arkiv, on purpose

| Kept off | Why |
|---|---|
| PDFs and images | Only the keccak256 fingerprint goes on chain. Files can be large and are not queried. |
| Student / candidate data | Not even hashed: phone numbers and emails can be brute-forced from hashes. |
| Signing keys, access key | Server env only. The access key is sent as `X-API-KEY` from the server; the browser uses the public RPC with no key. |
| OCR, normalization, diffing | Run in the reader's browser. They are computation, not shared state. |
| Rate limits for the playground | In-memory per server instance; they protect demo GLM, not data. |
