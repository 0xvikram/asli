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
