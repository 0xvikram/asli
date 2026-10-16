import { RPC_HTTP } from "@/lib/arkiv/client"
import { clientIp } from "@/lib/ratelimit"
import { handleRelay, relayLimiter } from "@/lib/relay"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const result = await handleRelay(await req.text(), clientIp(req.headers), {
    limiter: relayLimiter,
    forward: async (body) => {
      const key = process.env.ARKIV_ACCESS_KEY
      const res = await fetch(RPC_HTTP, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { "X-API-KEY": key } : {}) },
        body,
      })
      return { status: res.status, text: await res.text() }
    },
  })
  return new Response(result.body, { status: result.status, headers: { "content-type": "application/json" } })
}
