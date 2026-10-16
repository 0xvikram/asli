import { issuersForHost } from "@/lib/issuers"

export const dynamic = "force-dynamic"

/**
 * Served at /.well-known/asli-issuer.json (see the rewrite in next.config.ts). Each demo issuer
 * has its own hostname on this deployment, and each host lists only its own wallet, exactly as a
 * real institution would publish the file on its own site. Open CORS so any verifier can read it.
 */
export function wellKnownBody(host: string | null) {
  return {
    asli: 1 as const,
    issuers: issuersForHost(host).map((i) => ({ address: i.address, name: i.name })),
  }
}

export async function GET(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const body = wellKnownBody(host)
  return Response.json(body, {
    status: body.issuers.length > 0 ? 200 : 404,
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
  })
}
