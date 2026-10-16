import type { Expression } from "@arkiv-network/sdk/query"
import { keccak256, toHex, type Hex } from "viem"
import type { Reader, Writer } from "@/lib/arkiv/client"

/**
 * An in-memory stand-in for Tiramisu that runs the same Expression trees the SDK sends, keeps
 * `$creator`, honours readonly, expiry, deletes and batches, and answers `atBlock` reads from
 * history. Unit tests use it so the verdict engine is exercised without a funded wallet.
 */
type Typed = { type: string; value: unknown }
type Stored = {
  key: Hex
  creator: Hex
  attributes: Record<string, Typed>
  payload: Uint8Array
  createdAt: bigint
  expiresAt: bigint
  deletedAt?: bigint
  flags: { readonly?: boolean; permissionlessExtension?: boolean }
}

type ExpiryLike = { minLifetime?: bigint; expiresAt?: bigint | Date }

export const BLOCK_SECONDS = 2

export class FakeArkiv {
  block = 1_000_000n
  readonly genesisSeconds = 1_790_000_000
  entities: Stored[] = []
  log: { op: string; detail: unknown }[] = []
  private nonce = 0

  nowSeconds() {
    return this.genesisSeconds + Number(this.block) * BLOCK_SECONDS
  }

  /** Wall-clock "now" on the fake chain. */
  now() {
    return new Date(this.nowSeconds() * 1000)
  }

  /** A date some days after the fake chain's "now". */
  inDays(days: number) {
    return new Date((this.nowSeconds() + days * 86_400) * 1000)
  }

  /** Moves time forward. */
  advanceDays(days: number) {
    this.block += BigInt(Math.round((days * 86_400) / BLOCK_SECONDS))
  }

  private resolveExpiry(e: ExpiryLike): bigint {
    // The SDK's Expiry is opaque; read the fields it carries.
    const raw = e as unknown as Record<string, unknown>
    const at = raw.expiresAt
    if (at instanceof Date) {
      const secs = Math.ceil(at.getTime() / 1000) - this.nowSeconds()
      return this.block + BigInt(Math.max(1, Math.ceil(secs / BLOCK_SECONDS)))
    }
    if (typeof at === "bigint" && at > 0n) return at
    const min = (raw.minLifetime as bigint | undefined) ?? 0n
    return this.block + min
  }

  private alive(e: Stored, at: bigint) {
    return e.createdAt <= at && e.expiresAt > at && (e.deletedAt === undefined || e.deletedAt > at)
  }

  private matches(e: Stored, expr: Expression): boolean {
    switch (expr.kind) {
      case "and":
        return expr.expressions.every((x) => this.matches(e, x))
      case "or":
        return expr.expressions.some((x) => this.matches(e, x))
      case "not":
        return !this.matches(e, expr.expression)
      case "comparison": {
        const actual: Typed | undefined =
          expr.name === "$creator"
            ? { type: "addr", value: e.creator }
            : expr.name === "$key"
              ? { type: "key", value: e.key }
              : e.attributes[expr.name]
        if (!actual || actual.type !== expr.value.type) return false
        const a = actual.value
        const b = expr.value.value
        const norm = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v)
        switch (expr.operator) {
          case "=":
            return norm(a) === norm(b)
          case "<":
            return (a as bigint) < (b as bigint)
          case "<=":
            return (a as bigint) <= (b as bigint)
          case ">":
            return (a as bigint) > (b as bigint)
          case ">=":
            return (a as bigint) >= (b as bigint)
          default:
            return false
        }
      }
      default:
        throw new Error(`fake does not support ${expr.kind}`)
    }
  }

  reader(): Reader {
    return {
      query: (async (expr: Expression | string, opts: { limit?: number; cursor?: string; atBlock?: bigint } = {}) => {
        if (typeof expr === "string") throw new Error("fake only takes Expression")
        const at = opts.atBlock ?? this.block
        const hits = this.entities.filter((e) => this.alive(e, at) && this.matches(e, expr))
        const start = opts.cursor ? Number(opts.cursor) : 0
        const limit = opts.limit ?? 200
        const page = hits.slice(start, start + limit)
        const next = start + limit < hits.length ? String(start + limit) : undefined
        return {
          entities: page.map((e) => ({
            key: e.key,
            creator: e.creator,
            expiresAt: e.expiresAt,
            createdAt: e.createdAt,
            attributes: e.attributes,
            payload: e.payload,
          })),
          cursor: next,
          blockNumber: at,
        }
      }) as unknown as Reader["query"],
      getBlockTiming: (async () => ({
        currentBlock: this.block,
        currentBlockTime: this.nowSeconds(),
        blockDuration: BLOCK_SECONDS,
      })) as Reader["getBlockTiming"],
    }
  }

  private txHash(): Hex {
    return keccak256(toHex(`tx-${this.nonce++}`))
  }

  private create(creator: Hex, p: { attributes?: unknown; payload: Uint8Array; expires: unknown; flags?: unknown }) {
    const key = keccak256(toHex(`entity-${this.nonce++}`))
    const attributes: Record<string, Typed> = {}
    for (const [name, v] of Object.entries((p.attributes ?? {}) as Record<string, unknown>)) {
      attributes[name] = typeof v === "string" ? { type: "str", value: v } : (v as Typed)
    }
    this.entities.push({
      key,
      creator,
      attributes,
      payload: p.payload,
      createdAt: this.block,
      expiresAt: this.resolveExpiry(p.expires as ExpiryLike),
      flags: (p.flags ?? {}) as Stored["flags"],
    })
    return key
  }

  private find(key: Hex) {
    const e = this.entities.find((x) => x.key === key && this.alive(x, this.block))
    if (!e) throw new Error(`no live entity ${key}`)
    return e
  }

  private extend(caller: Hex, key: Hex, expires: unknown) {
    const e = this.find(key)
    if (e.creator.toLowerCase() !== caller.toLowerCase() && !e.flags.permissionlessExtension) {
      throw new Error("only the owner may extend")
    }
    const next = this.resolveExpiry(expires as ExpiryLike)
    if (next <= e.expiresAt) throw new Error("extension must move expiry later")
    e.expiresAt = next
  }

  writer(address: Hex): Writer {
    return {
      account: { address },
      createEntity: (async (p: Parameters<Writer["createEntity"]>[0]) => {
        this.block += 1n
        const entityKey = this.create(address, p)
        this.log.push({ op: "create", detail: entityKey })
        return { entityKey, txHash: this.txHash(), expiresAt: 0n }
      }) as unknown as Writer["createEntity"],
      extendEntity: (async (p: { entityKey: Hex; expires: unknown }) => {
        this.block += 1n
        this.extend(address, p.entityKey, p.expires)
        this.log.push({ op: "extend", detail: p.entityKey })
        return { txHash: this.txHash(), expiresAt: this.find(p.entityKey).expiresAt }
      }) as unknown as Writer["extendEntity"],
      executeBatch: (async (b: {
        creates?: Parameters<Writer["createEntity"]>[0][]
        deletes?: { entityKey: Hex }[]
        extensions?: { entityKey: Hex; expires: unknown }[]
      }) => {
        this.block += 1n
        // Atomic: validate everything first, apply only if all succeed.
        for (const d of b.deletes ?? []) {
          const e = this.find(d.entityKey)
          if (e.creator.toLowerCase() !== address.toLowerCase()) throw new Error("only the owner may delete")
        }
        const snapshot = this.entities.map((e) => ({ ...e }))
        try {
          for (const x of b.extensions ?? []) this.extend(address, x.entityKey, x.expires)
          const created = (b.creates ?? []).map((c) => this.create(address, c))
          for (const d of b.deletes ?? []) this.find(d.entityKey).deletedAt = this.block
          this.log.push({ op: "batch", detail: { created, deletes: b.deletes, extensions: b.extensions } })
          return {
            txHash: this.txHash(),
            createdEntities: created,
            deletedEntities: (b.deletes ?? []).map((d) => d.entityKey),
            extendedEntities: (b.extensions ?? []).map((x) => x.entityKey),
            patchedEntities: [],
            ownershipChanges: [],
          }
        } catch (err) {
          this.entities = snapshot
          throw err
        }
      }) as unknown as Writer["executeBatch"],
    }
  }
}
