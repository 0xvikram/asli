"use client"

import { createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, type Hex } from "viem"
import { CHAIN_ID, EXPLORER, RPC_HTTP } from "@/lib/arkiv/client"

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }

function provider(): Eip1193 {
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum
  if (!eth) throw new Error("No browser wallet found. Install MetaMask (or Rabby) and reload.")
  return eth
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`

/** Connects the browser wallet and makes sure it is on Tiramisu. */
export async function connectWallet(): Promise<Hex> {
  const eth = provider()
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Hex[]
  if (!accounts?.[0]) throw new Error("The wallet did not share an account")
  const current = (await eth.request({ method: "eth_chainId" })) as string
  if (current?.toLowerCase() !== CHAIN_HEX) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] })
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: "Arkiv Tiramisu",
            nativeCurrency: { name: "GLM", symbol: "GLM", decimals: 18 },
            rpcUrls: [RPC_HTTP],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      })
    }
  }
  return accounts[0]
}

/** A wallet client whose every write is signed in the user's own wallet: `$creator` is them. */
export function browserWallet(address: Hex) {
  return createWalletClient({ chain: tiramisu, transport: custom(provider()), account: address })
}
