import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const PHOTO_BUCKET = "attendance-member-photos"
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Request origin rejected." }, 403)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !anon || !service) return json({ error: "Attendance server is not configured." }, 503)
  const store = await cookies()
  const session = createServerClient(url, anon, { cookies: { getAll: () => store.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => store.set(name, value, options)) } })
  const { data: { user } } = await session.auth.getUser()
  if (!user) return json({ error: "Administrator sign-in required." }, 401)
  const db = createSupabaseClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: admin } = await db.from("attendance_admins").select("role").eq("user_id", user.id).maybeSingle()
  if (!admin) return json({ error: "Administrator access required." }, 403)
  let body: { qrToken?: unknown; faceImage?: unknown }
  try { body = await request.json() } catch { return json({ error: "Invalid request." }, 400) }
  if (typeof body.qrToken !== "string" || body.qrToken.length < 16 || body.qrToken.length > 512 || typeof body.faceImage !== "string") return json({ error: "A valid QR credential and face image are required." }, 400)
  const img = body.faceImage.match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/)
  if (!img || img[1].length > 5_000_000) return json({ error: "Invalid or oversized face image." }, 400)
  const { data: member, error: lookupError } = await db.from("attendance_members").select("id,full_name,department,face_photo_path").eq("qr_token", body.qrToken.trim()).maybeSingle()
  if (lookupError) return json({ error: "Member lookup failed." }, 500)
  if (!member) return json({ status: "not_registered", message: "This ID card is not registered." })
  if (!member.face_photo_path) return json({ status: "face_not_enrolled", message: "No registered face profile exists for this member." })
  const apiKey = process.env.FACEPP_API_KEY, apiSecret = process.env.FACEPP_API_SECRET
  if (!apiKey || !apiSecret) return json({ error: "Facial verification is not configured. Attendance was not recorded." }, 503)
  const { data: signed, error: signedError } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(member.face_photo_path, 90)
  if (signedError || !signed?.signedUrl) return json({ error: "Registered face profile could not be accessed." }, 500)
  const refResponse = await fetch(signed.signedUrl, { cache: "no-store" })
  if (!refResponse.ok) return json({ error: "Registered face image could not be loaded." }, 502)
  const form = new FormData()
  form.set("api_key", apiKey); form.set("api_secret", apiSecret)
  form.set("image_base64_1", Buffer.from(await refResponse.arrayBuffer()).toString("base64"))
  form.set("image_base64_2", img[1])
  try {
    const response = await fetch("https://api-us.faceplusplus.com/facepp/v3/compare", { method: "POST", body: form, cache: "no-store" })
    const result = await response.json() as { confidence?: number; error_message?: string }
    if (!response.ok || typeof result.confidence !== "number") return json({ error: result.error_message ?? "Face verification failed. Attendance was not recorded." }, 502)
    const threshold = Number(process.env.FACE_MATCH_THRESHOLD ?? "80")
    if (result.confidence < threshold) return json({ status: "face_mismatch", message: "Face does not match the registered member. No attendance was recorded." })
    const { data, error } = await db.rpc("record_qr_attendance", { p_qr_token: body.qrToken.trim() })
    if (error) return json({ error: "Verified attendance could not be saved. Please retry." }, 500)
    return json({ ...(data as Record<string, unknown>), face_verified: true, face_confidence: Math.round(result.confidence * 100) / 100 })
  } catch { return json({ error: "Face verification service is unavailable. Attendance was not recorded." }, 502) }
}
