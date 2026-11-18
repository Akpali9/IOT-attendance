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

  const isDefaultCredentials =
    normalizedUsername === "superadmin" && password === "password123"
  const isDefaultBootstrap =
    isDefaultCredentials &&
    process.env.ATTENDANCE_ENABLE_DEFAULT_ADMIN_BOOTSTRAP === "true"

  // --- Validation ---------------------------------------------------------
  if (!usernamePattern.test(normalizedUsername)) {
    return jsonResponse(
      { error: "Username must be 3–32 chars, start with a letter or digit, and contain only a–z, 0–9, dot, underscore, or hyphen." },
      400,
    )
  }

  if (typeof password !== "string") {
    return jsonResponse({ error: "Password is required." }, 400)
  }

  // The default superadmin/password123 path allows an 11-char password.
  const minPasswordLength = isDefaultBootstrap ? 11 : 12
  if (password.length < minPasswordLength) {
    return jsonResponse(
      { error: `Password must be at least ${minPasswordLength} characters.` },
      400,
    )
  }
  if (password.length > 128) {
    return jsonResponse({ error: "Password must be 128 characters or fewer." }, 400)
  }

  // Non-default path requires a valid setup token.
  if (!isDefaultBootstrap) {
    if (
      typeof setupToken !== "string" ||
      setupToken.length < 32 ||
      setupToken.length > 512
    ) {
      return jsonResponse(
        { error: "A valid setup token (32–512 characters) is required." },
        400,
      )
    }
  }

  // --- Setup-token check for non-default bootstrap -----------------------
  const expectedToken = process.env.ATTENDANCE_ADMIN_SETUP_TOKEN
  if (!isDefaultBootstrap) {
    if (!expectedToken || expectedToken.length < 32) {
      return jsonResponse(
        { error: "First administrator setup is not configured securely (missing ATTENDANCE_ADMIN_SETUP_TOKEN)." },
        503,
      )
    }
    if (
      typeof setupToken !== "string" ||
      !matchesSetupToken(setupToken, expectedToken)
    ) {
      return jsonResponse({ error: "The setup token could not be verified." }, 403)
    }
  }

  // --- Supabase client ---------------------------------------------------
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[bootstrap] missing env:", {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
    })
    return jsonResponse(
      { error: "Administrator setup is temporarily unavailable (server misconfigured)." },
      503,
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const internalEmail = `${normalizedUsername}@attendance.invalid`
  let claimHeld = false

  try {
    // --- Claim the bootstrap --------------------------------------------
    const { data: claimGranted, error: claimError } = await supabaseAdmin.rpc(
      "claim_attendance_admin_bootstrap",
      { p_email: internalEmail },
    )

    if (claimError) {
      console.error("[bootstrap] claim RPC error:", claimError)
      return jsonResponse(
        { error: "Administrator setup is temporarily unavailable." },
        503,
      )
    }

    if (!claimGranted) {
      console.warn("[bootstrap] claim rejected for:", internalEmail)
      return jsonResponse(
        { error: "First administrator setup has already been claimed, or an administrator already exists." },
        409,
      )
    }
    claimHeld = true

    // --- Create the auth user -------------------------------------------
    const { data: createdData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        app_metadata: {
          attendance_admin_portal: true,
          attendance_username: normalizedUsername,
        },
        user_metadata: { username: normalizedUsername },
      })

    if (createError || !createdData?.user) {
      console.error("[bootstrap] createUser failed:", {
        message: createError?.message,
        status: createError?.status,
        name: createError?.name,
        code: (createError as { code?: string } | null)?.code,
      })

      await supabaseAdmin.rpc("release_attendance_admin_bootstrap", {
        p_email: internalEmail,
      })
      claimHeld = false

      const detail = createError?.message ?? "No user returned"
      return jsonResponse(
        { error: `Administrator setup could not be completed: ${detail}` },
        409,
      )
    }

    const userId = createdData.user.id

    // --- Attach the admin role ------------------------------------------
    const { error: adminProfileError } = await supabaseAdmin
      .from("attendance_admins")
      .upsert({ user_id: userId, role: "superadmin" }, { onConflict: "user_id" })

    if (adminProfileError) {
      console.error("[bootstrap] attendance_admins upsert failed:", adminProfileError)

      // Roll back the just-created user and release the claim.
      await supabaseAdmin.auth.admin.deleteUser(userId)
      await supabaseAdmin.rpc("release_attendance_admin_bootstrap", {
        p_email: internalEmail,
      })
      claimHeld = false

      return jsonResponse(
        {
          error: `Admin role setup failed: ${adminProfileError.message}. The user was rolled back; please retry.`,
        },
        500,
      )
    }

    // --- Success ---------------------------------------------------------
    claimHeld = false
    return jsonResponse({ ok: true, email: internalEmail, userId }, 201)
  } catch (err) {
    console.error("[bootstrap] unexpected error:", err)

    if (claimHeld) {
      try {
        await supabaseAdmin.rpc("release_attendance_admin_bootstrap", {
          p_email: internalEmail,
        })
      } catch (releaseErr) {
        console.error("[bootstrap] claim release failed:", releaseErr)
      }
    }

    return jsonResponse(
      { error: "Administrator setup is temporarily unavailable." },
      503,
    )
  }
}
