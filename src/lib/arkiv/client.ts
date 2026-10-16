import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http, webSocket, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export const RPC_HTTP = "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
export const RPC_WS = "wss://rpc.tiramisu.db-chain.testnet.arkiv.network"
export const EXPLORER = "https://tiramisu.explorer.arkiv.network"
export const CHAIN_ID = 7738577

/**
 * Read client with no credentials. This is the client the browser uses: anyone can run the same
 * queries against the public RPC, with or without Asli's site.
 */
export function publicReader() {
  return createPublicClient({ chain: tiramisu, transport: http(RPC_HTTP) })
}

/** Live entity events over a WebSocket, so the board updates without a polling loop. */
export function publicWatcher() {
  return createPublicClient({ chain: tiramisu, transport: webSocket(RPC_WS) })
}

/**
 * Server-only. The access key raises the RPC quota; it is sent as an `X-API-KEY` header and never
 * reaches the browser. It does not pay gas and does not identify the issuer: the signing key does.
 */
function keyedTransport() {
  const accessKey = process.env.ARKIV_ACCESS_KEY
  return http(RPC_HTTP, accessKey ? { fetchOptions: { headers: { "X-API-KEY": accessKey } } } : {})
}

export function serverReader() {
  return createPublicClient({ chain: tiramisu, transport: keyedTransport() })
}

export function issuerWallet(privateKey: Hex) {
  return createWalletClient({
    chain: tiramisu,
    transport: keyedTransport(),
    account: privateKeyToAccount(privateKey),
  })
}

export type Reader = Pick<ReturnType<typeof publicReader>, "query" | "getBlockTiming">
export type Writer = Pick<
  ReturnType<typeof issuerWallet>,
  "createEntity" | "executeBatch" | "extendEntity"
> & { account: { address: Hex } }

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`
