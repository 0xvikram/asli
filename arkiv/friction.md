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

## 3. Negative `atBlock` gives a viem integer error, not an Arkiv one

- **Surface:** SDK `client.query(expr, { atBlock })`, 0.8.1, Tiramisu.
- **Expected:** a clear error such as "atBlock must be ≥ 0 and ≤ head", raised before the
  request.
- **Actual:** `Number "-669540n" is not in safe integer range (above 0n)` with a viem
  version footer. It took a minute to see that my look-back (30 days) was older than the
  chain itself: Tiramisu's head was block 626,460 on 16 Oct 2026, about 14.5 days of 2-second
  blocks.
- **Repro:** `const t = await c.getBlockTiming(); await c.query("$expiresAt > u64(0)", {
  atBlock: t.currentBlock - 1_296_000n })`.
- **Fix:** validate `atBlock` in the SDK and name the parameter in the error. A
  `genesisTime` (or the first block's timestamp) in `getBlockTiming` would also help apps
  that compute look-backs.

## 4. Historical `atBlock` queries with a broad predicate time out

- **Surface:** JSON-RPC `arkiv_query` with `atBlock`, via SDK 0.8.1, public RPC, no access key.
- **Expected:** a broad historical read to be slower than a head read, but to answer, or a
  clear "query too expensive" error.
- **Actual:** `$expiresAt > u64(0)`, `limit: 1`, at head minus 1 day and head minus 7 days:
  both fail with viem's `The request took too long to respond`. The same query at head minus
  13 days (block 65,101) answers at once. At the head it also answers at once.
- **Repro:** the snippet in entry 3 with `days` = 1, 7, 13.
- **Fix:** document the cost model of historical reads (does `limit` stop work early?), and
  return a typed timeout/too-broad error from the node rather than letting the HTTP client
  time out. Asli now only runs historical reads with a narrow equality predicate
  (`text_hash = …`) and a short timeout, and treats a timeout as "unknown", never "fake".

## 5. An unfunded wallet reports "Execution error without revert data"

- **Surface:** SDK `createEntity`, 0.8.1, Tiramisu, fresh EOA with 0 GLM.
- **Expected:** "insufficient funds: 0x2043…7De6 has 0 GLM; get test GLM at
  hub.arkiv.network/faucet".
- **Actual:** `EntityMutationError: Transaction failed: Execution error without revert data`.
  The real cause is only inside the nested viem error: `details: 'out of gas: gas required
  exceeds: 0'` from `eth_estimateGas`, under several screens of hex calldata.
- **Repro:** `generatePrivateKey()`, build a wallet client on `tiramisu`, call `createEntity`
  with any valid parameters before funding the address.
- **Fix:** in `EntityMutationError`, check the sender's balance when estimation fails with
  `gas required exceeds: 0` (or a 0 allowance) and say "no GLM", with the faucet link.
  Asli's integration test now checks `getBalance` first and skips with that message.

## 6. Access keys: what changes, measured (worked, one surprise)

- **Surface:** Hub access key (`ark_live_…`, 41 characters) sent as `X-API-KEY` to the
  Tiramisu HTTP RPC, 16 Oct 2026.
- **Tested:** the same `eth_chainId` call with no key, with the real key, and with a made-up key.
- **Expected:** the key raises limits, and a bad key falls back to the public tier or gets a
  clear error.
- **Actual:**
  - No key: `200`, `ratelimit: limit=600, remaining=599, reset=60` (600 calls a minute).
  - Real key: `200`, `ratelimit: limit=9999, remaining=9998, reset=1`, plus
    `arkiv-quota-used-percent: 0`. The headers make the quota easy to watch. Nice.
  - Made-up key: `401`. A typo in the key turns a working app into a failing one rather than
    falling back to the public tier.
- **Repro:** `curl -s -D - -o /dev/null -X POST https://rpc.tiramisu.db-chain.testnet.arkiv.network
  -H 'content-type: application/json' -H 'X-API-KEY: <key>'
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}'`
- **Fix / docs:** document the two tiers and the 401 behaviour on the Access Keys page, and
  return a JSON-RPC error body with the 401 ("unknown access key") so SDK users see the cause,
  not a generic HTTP error. Asli only sends the key from its server, so the browser path keeps
  working on the public tier whatever happens to the key.

## 7. `expiresAt` comes back as a block number only; apps must convert it to a date

- **Surface:** SDK 0.8.1 `query` / `getEntity` (`Entity.expiresAt: bigint`), plus
  `getBlockTiming()`.
- **Expected:** a way to show "valid till 9 Nov" for an entity: either the expiry as a timestamp
  alongside the block, or an SDK helper `blockToDate(block)`. Creation takes a `Date`
  (`ExpirationTime.atDate`), so reading it back as a date seemed natural.
- **Actual:** only the block height. Asli first displayed the notice's own `valid_until`
  attribute, which was wrong after a postponement: the notice is `readonly`, so the attribute
  cannot change, while `extendEntity` moved the real expiry. The live board showed "valid till
  25 Oct" for a notice extended to 9 Nov. The fix was to convert `expiresAt` with
  `currentBlockTime + (expiresAt − currentBlock) × blockDuration` from `getBlockTiming()`.
- **Repro:** create with `expires: ExpirationTime.atDate(d1)` and `flags: { readonly: true }`,
  then `extendEntity({ expires: ExpirationTime.atDate(d2) })`, then read it back: you get a block
  height and nothing that reads as `d2`.
- **Fix:** add `blockToDate` / `dateToBlock` helpers to the SDK (it already does the reverse
  inside `atDate`), or return an estimated `expiresAtTime` in the RPC projection. Worth a line in
  the docs too: on a readonly entity, the expiry, not an attribute, is the place to keep a
  deadline that may move.
