import { createHmac, timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeEqualHex(candidate: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(candidate)) return false
  const a = Buffer.from(candidate, "hex")
  const b = Buffer.from(expected, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.IOT_ATTENDANCE_DEVICE_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "IoT attendance endpoint is not configured." }, { status: 503 })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 2048) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 })
  }

  const timestamp = request.headers.get("x-device-timestamp") ?? ""
  const nonce = request.headers.get("x-device-nonce") ?? ""
  const suppliedSignature = request.headers.get("x-device-signature") ?? ""
  const timestampNumber = Number(timestamp)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!/^\d{10}$/.test(timestamp) || !Number.isFinite(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > 60) {
    return NextResponse.json({ error: "Device request timestamp is invalid or expired." }, { status: 401 })
  }
  if (!/^[a-zA-Z0-9-]{16,128}$/.test(nonce)) {
    return NextResponse.json({ error: "A unique device nonce is required." }, { status: 400 })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, "utf8") > 2048) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 })
  }
  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex")
  if (!safeEqualHex(suppliedSignature, expectedSignature)) {
    return NextResponse.json({ error: "Device authentication failed." }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid device payload." }, { status: 400 })
  }

  const deviceUserId = body && typeof body === "object"
    ? (body as Record<string, unknown>).device_user_id
    : null
  if (typeof deviceUserId !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(deviceUserId)) {
    return NextResponse.json({ error: "A valid enrolled device_user_id is required." }, { status: 400 })
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Attendance service is not configured." }, { status: 503 })
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // A nonce is accepted once only, preventing a captured signed scan from being replayed.
  const { error: nonceError } = await supabase.from("iot_device_request_nonces").insert({
    nonce,
    request_timestamp: new Date(timestampNumber * 1000).toISOString(),
  })
  if (nonceError) {
    return NextResponse.json({ error: "Device request was already used or could not be verified." }, { status: 409 })
  }
  await supabase.from("iot_device_request_nonces").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const { data, error } = await supabase.rpc("record_iot_fingerprint_attendance", {
    p_device_user_id: deviceUserId,
  })
  if (error) {
    return NextResponse.json({ error: "Fingerprint attendance could not be recorded." }, { status: 500 })
  }
  return NextResponse.json(data, { status: 200, headers: { "Cache-Control": "no-store" } })
}
