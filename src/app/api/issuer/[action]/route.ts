import { handleIssuerAction } from "@/lib/api"
import { issuerWallet, serverReader } from "@/lib/arkiv/client"
import { issuerKey } from "@/lib/issuers"
import { clientIp, playgroundLimiter } from "@/lib/ratelimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params
  const body = await req.json().catch(() => null)
  const result = await handleIssuerAction(action, body, clientIp(req.headers), {
    reader: serverReader(),
    writerFor: (issuer) => {
      const key = issuerKey(issuer)
      return key ? issuerWallet(key) : undefined
    },
    limiter: playgroundLimiter,
  })
  return Response.json(result.body, { status: result.status })
}
