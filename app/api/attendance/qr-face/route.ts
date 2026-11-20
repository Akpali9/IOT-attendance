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
  if (!img) return json({ error: "Invalid face image. Capture the face again." }, 400)
  const liveImage = Buffer.from(img[1], "base64")
  if (liveImage.length > 1_700_000) return json({ error: "Live face image is too large. Move closer to the camera and capture again." }, 413)
  const { data: member, error: lookupError } = await db.from("attendance_members").select("id,full_name,department,face_photo_path").eq("qr_token", body.qrToken.trim()).maybeSingle()
  if (lookupError) return json({ error: "Member lookup failed." }, 500)
  if (!member) return json({ status: "not_registered", message: "This ID card is not registered." })
  if (!member.face_photo_path) return json({ status: "face_not_enrolled", message: "No registered face profile exists for this member." })
  const apiKey = process.env.FACEPP_API_KEY, apiSecret = process.env.FACEPP_API_SECRET
  if (!apiKey || !apiSecret) return json({ error: "Facial verification is not configured. Attendance was not recorded." }, 503)
  const { data: signed, error: signedError } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(member.face_photo_path, 90)
  if (signedError || !signed?.signedUrl) return json({ error: "Registered face profile could not be accessed." }, 500)
  try {
    const refResponse = await fetch(signed.signedUrl, { cache: "no-store" })
    if (!refResponse.ok) return json({ error: `Registered face image could not be loaded (storage HTTP ${refResponse.status}). Re-upload the member's face photo.` }, 502)
    const referenceImage = Buffer.from(await refResponse.arrayBuffer())
    if (referenceImage.length > 1_700_000) return json({ error: "The registered face photograph is larger than Face++ allows. Edit the member and re-upload their face photo so it can be optimized." }, 413)
    if (referenceImage.length < 100) return json({ error: "The registered face photograph is empty or invalid. Re-upload the member's face photo." }, 422)

    const form = new FormData()
    form.set("api_key", apiKey); form.set("api_secret", apiSecret)
    form.set("image_base64_1", referenceImage.toString("base64"))
    form.set("image_base64_2", liveImage.toString("base64"))

    const endpoint = process.env.FACEPP_API_URL || "https://api-us.faceplusplus.com/facepp/v3/compare"
    const response = await fetch(endpoint, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(25_000) })
    const responseText = await response.text()
    let result: { confidence?: number; error_message?: string; request_id?: string }
    try { result = JSON.parse(responseText) as typeof result }
    catch {
      const detail = response.status === 413
        ? "Face++ rejected the request because its total upload size exceeded the provider limit."
        : `Face++ returned a non-JSON response (HTTP ${response.status}). Check the FACEPP_API_URL region and API access.`
      console.error("[qr-face] Face++ non-JSON response", { status: response.status, bodyPreview: responseText.slice(0, 300) })
      return json({ error: detail }, 502)
    }
    if (!response.ok || typeof result.confidence !== "number") {
      const providerError = result.error_message || `Face++ request failed (HTTP ${response.status}).`
      console.error("[qr-face] Face++ comparison rejected", { status: response.status, providerError, requestId: result.request_id })
      let guidance = "Check the Face++ API credentials, account permissions, API region, and both face photographs."
      if (providerError.includes("AUTHENTICATION_ERROR")) guidance = "The Face++ API Key and Secret do not match, or are legacy credentials. Use the current Cognitive Services credentials."
      else if (providerError.includes("AUTHORIZATION_ERROR")) guidance = "The Face++ account or API key is not authorized for Compare API, or the account has insufficient balance."
      else if (providerError.includes("NO_FACE_FOUND") || providerError.includes("BAD_FACE")) guidance = "Face++ could not detect a clear, frontal face in one of the two photos. Re-enroll the member photo and capture the live face with good lighting."
      else if (providerError.includes("IMAGE_FILE_TOO_LARGE") || providerError.includes("INVALID_IMAGE_SIZE") || response.status === 413) guidance = "One of the images is too large or has unsupported dimensions. Re-upload the member photo and capture again."
      return json({ error: `${providerError} ${guidance}${result.request_id ? ` Reference: ${result.request_id}` : ""}` }, 502)
    }
    const threshold = Number(process.env.FACE_MATCH_THRESHOLD ?? "80")
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) return json({ error: "FACE_MATCH_THRESHOLD must be a number from 0 to 100. Attendance was not recorded." }, 500)
    if (result.confidence < threshold) return json({ status: "face_mismatch", message: "Face does not match the registered member. No attendance was recorded." })
    const { data, error } = await db.rpc("record_qr_attendance", { p_qr_token: body.qrToken.trim() })
    if (error) return json({ error: "Verified attendance could not be saved. Please retry." }, 500)
    return json({ ...(data as Record<string, unknown>), face_verified: true, face_confidence: Math.round(result.confidence * 100) / 100 })
  } catch (error) {
    const detail = error instanceof Error && error.name === "TimeoutError" ? "Face++ comparison timed out. Try again with a stable internet connection." : "Face verification service is unavailable. Check the FACEPP_API_URL and try again."
    console.error("[qr-face] Face++ request failed", error)
    return json({ error: `${detail} Attendance was not recorded.` }, 502)
  }
}
