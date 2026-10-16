import type { Hex } from "viem"
import type { ProofResult } from "@/lib/domainProof"
import { registerIssuer } from "@/lib/arkiv/write"
import type { FakeArkiv } from "./fakeArkiv"

export const BOARD = "0x2043DB00a32bd8C4804227B72b97438af39a7De6" as Hex
export const UNIV = "0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81" as Hex
export const EMPLOYER = "0x51Ad2Cf42bc81C254bcdd078e15c75890532905f" as Hex
export const IMPOSTER = "0x000000000000000000000000000000000000dEaD" as Hex

export const BOARD_DOMAIN = "board.asli.example"

export const EXAM_NOTICE = `DEMO BOARD OF SECONDARY EDUCATION
Notice No. DBSE/EXAM/2026/41
The Class X Mathematics board exam will be held on 12 March 2026 from 10:30 am to 1:30 pm.
Admit cards can be downloaded from the board website from 1 March 2026.`

/** Domain proofs as a lookup table: only the listed wallet passes for each domain. */
export function fakeProver(table: Record<string, Hex>) {
  return async (domain: string, address: string): Promise<ProofResult> => {
    const owner = table[domain]
    return owner && owner.toLowerCase() === address.toLowerCase()
      ? { ok: true, method: "well-known", domain }
      : { ok: false, domain, reason: "wallet is not listed by this domain" }
  }
}

export async function seedBoard(fake: FakeArkiv) {
  const w = fake.writer(BOARD)
  await registerIssuer(w, {
    name: "Demo Board of Secondary Education",
    domain: BOARD_DOMAIN,
    category: "board",
    about: "Fictional exam board for the Asli demo.",
  })
  return w
}
