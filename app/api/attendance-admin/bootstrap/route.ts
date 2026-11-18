import { createHash, timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function matchesSetupToken(candidate: string, expected: string) {
  const candidateHash = createHash("sha256").update(candidate).digest()
  const expectedHash = createHash("sha256").update(expected).digest()
  return timingSafeEqual(candidateHash, expectedHash)
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) {
    return jsonResponse({ error: "Request could not be verified." }, 403)
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 4096) {
    return jsonResponse({ error: "Request is too large." }, 413)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid setup request." }, 400)
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid setup request." }, 400)
  }

  const { username, password, setupToken } = body as Record<string, unknown>
  const normalizedUsername =
    typeof username === "string" ? username.trim().toLowerCase() : ""

  if (
    !usernamePattern.test(normalizedUsername) ||
    typeof password !== "string" ||
    password.length < (normalizedUsername === "superadmin" && password === "password123" ? 11 : 12) ||
    password.length > 128 ||
    !(typeof setupToken === "string" && setupToken.length >= 32 && setupToken.length <= 512) &&
      !(normalizedUsername === "superadmin" && password === "password123" && process.env.ATTENDANCE_ENABLE_DEFAULT_ADMIN_BOOTSTRAP === "true")
  ) {
    return jsonResponse(
      {
        error: "Enter a valid username, password, and a valid setup token.",
      },
      400,
    )
  }

  const expectedToken = process.env.ATTENDANCE_ADMIN_SETUP_TOKEN
  const isDefaultBootstrap = normalizedUsername === "superadmin" && password === "password123" && process.env.ATTENDANCE_ENABLE_DEFAULT_ADMIN_BOOTSTRAP === "true"
  if (!isDefaultBootstrap && (!expectedToken || expectedToken.length < 32)) {
    return jsonResponse(
      { error: "First administrator setup is not configured securely." },
      503,
    )
  }
  if (!isDefaultBootstrap && (typeof setupToken !== "string" || !matchesSetupToken(setupToken, expectedToken!))) {
    return jsonResponse({ error: "The setup token could not be verified." }, 403)
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Administrator setup is temporarily unavailable." },
      503,
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const internalEmail = `${normalizedUsername}@attendance.invalid`
  let claimHeld = false

  try {
    const { data: claimGranted, error: claimError } = await supabaseAdmin.rpc(
      "claim_attendance_admin_bootstrap",
      { p_email: internalEmail },
    )

    if (claimError) {
      return jsonResponse(
        { error: "Administrator setup is temporarily unavailable." },
        503,
      )
    }
    if (!claimGranted) {
      return jsonResponse(
        { error: "First administrator setup has already been claimed." },
        409,
      )
    }
    claimHeld = true

    const { data: createdData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      app_metadata: {
        attendance_admin_portal: true,
        attendance_username: normalizedUsername,
      },
      user_metadata: { username: normalizedUsername },
    })

    if (createError) {
      await supabaseAdmin.rpc("release_attendance_admin_bootstrap", {
        p_email: internalEmail,
      })
      claimHeld = false
      return jsonResponse(
        { error: "Administrator setup could not be completed. Try again." },
        409,
      )
    }

    if (createdData.user) {
      const { error: adminProfileError } = await supabaseAdmin.from("attendance_admins").upsert(
        { user_id: createdData.user.id, role: "superadmin" },
        { onConflict: "user_id" },
      )
      if (adminProfileError) {
        await supabaseAdmin.auth.admin.deleteUser(createdData.user.id)
        await supabaseAdmin.rpc("release_attendance_admin_bootstrap", { p_email: internalEmail })
        claimHeld = false
        return jsonResponse({ error: "Admin role setup failed. The initial setup claim was released; check the attendance_admins table and try again." }, 500)
      }
    }
    claimHeld = false
    return jsonResponse({ ok: true }, 201)
  } catch {
    if (claimHeld) {
      await supabaseAdmin.rpc("release_attendance_admin_bootstrap", {
        p_email: internalEmail,
      })
    }
    return jsonResponse(
      { error: "Administrator setup is temporarily unavailable." },
      503,
    )
  }
}
