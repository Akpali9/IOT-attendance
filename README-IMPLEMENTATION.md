# LAM Attendance – QR card + Android fingerprint build

# Update: fingerprint at registration, no email sign-in, voice announcements

- **Fingerprint is taken when a member is registered.** After **Create member and add fingerprint**, the form moves to a fingerprint step; hand the phone to the member and they place their finger on the sensor. Members added earlier can still be enrolled from their profile (**Register fingerprint**). Re-enroll them once: older passkeys may not be discoverable.
- **No email to sign in.** Fingerprint attendance no longer asks for an email. The phone offers the passkey saved at registration and the server identifies the member from it (discoverable passkeys). Apply `202611200002_passkey_usernameless.sql`.
- **Voice announcements.** QR and fingerprint attendance both speak the result ("Accepted. <name>, checked in." / "Declined. <reason>") using the browser's built-in speech. Each dialog has a Voice on/off toggle.
- Email stays on the member profile as a contact detail only.



**Two attendance methods:** (1) a phone camera scans the QR on the member's ID card, or (2) the member signs with their Android phone fingerprint (WebAuthn passkey, built-in platform authenticator only). The IoT terminal webhook was removed; apply `202611200001_remove_iot_terminal.sql`. Older sections below that mention IoT terminals are historical.

**Limit:** a web page can't force fingerprint specifically; if no fingerprint is enrolled, Android may offer its PIN/pattern.

---

# Original implementation notes

This package builds on the supplied Next.js + Supabase attendance application.

## Included in this update

- Live rear-camera QR scanning for member ID cards. The generated card contains an opaque QR credential; the scanner verifies it through the attendance database transaction.
- Live front-camera member photo capture in the member form, with preview and upload to the configured private Supabase photo bucket.
- Supabase Realtime subscriptions for attendance records and member changes. Signed-in admin dashboards automatically refresh after check-in, check-out, or member edits.
- One-time `superadmin` bootstrap using the requested initial password `password123`, controlled by a server-only environment switch. The bootstrap assigns the `superadmin` role in `attendance_admins`.
- A password-change panel so the initial password can be replaced from **Access & security**.
- Optional IoT terminal user ID field on member profiles.
- An authenticated IoT fingerprint webhook and a Supabase migration that records check-in/check-out from a matched terminal user ID.
- Detailed setup instructions in `docs/DEVICE-INTEGRATION.md`.

## Required deployment steps

1. Copy `.env.example` to `.env.local` for local development and add the corresponding variables in Vercel → Project → Settings → Environment Variables. Keep service-role keys and device secrets server-side; never add a `NEXT_PUBLIC_` prefix to them.
2. Apply all migrations in `supabase/migrations/` in filename order. This includes IoT fingerprint terminal support, Android passkeys, and live dashboard updates.
3. Set `ATTENDANCE_ENABLE_DEFAULT_ADMIN_BOOTSTRAP=true` temporarily for first initialization. In the app choose **Set up the first administrator** and submit `superadmin` / `password123`. After the account is created, immediately set the switch to `false` or remove it.
4. Sign in, open **Access & security**, and change the password to a unique 12+ character password.
5. For fingerprint hardware, configure a vendor terminal or gateway to call `/api/iot/fingerprint` as documented. The device model and vendor SDK determine the bridge configuration.

## Biometric and camera behaviour

A web page cannot read a phone fingerprint sensor or fingerprint template directly. Phone attendance uses WebAuthn/passkeys: the operating system prompts for fingerprint, face unlock, or an allowed device screen-lock method, and the server verifies the signed assertion before attendance is recorded. The app never receives biometric images or templates. The separate IoT endpoint accepts a matched user ID from a compatible physical fingerprint terminal; a vendor-specific bridge and hardware enrollment are still required.

The member form includes a live front-camera capture flow. The ID-card scanner uses the rear camera for QR scanning. Camera access requires HTTPS (or localhost during development) and the user must grant browser camera permission.

## Live dashboard setup

Apply `202611190001_realtime_attendance.sql` to add `attendance_records` and `attendance_members` to the `supabase_realtime` publication. If the publication is not available in your Supabase project, enable Realtime for both tables in Database → Publications. The dashboard subscribes to changes and re-reads the current date's records; a browser refresh is not required.

## Validation

The uploaded project was modified without adding new npm dependencies. A full production build could not be run in this environment because the package manager/dependencies were not installed and registry access was unavailable. Apply the SQL migration and run the project build in your deployment or development environment before going live.

## Android phone fingerprint attendance (WebAuthn)

This build now includes a real WebAuthn/passkey enrollment and authentication flow. On supported Android devices, Chrome invokes the Android passkey provider. Depending on the phone's security settings, the user confirms with fingerprint, face unlock, or the device screen lock/PIN. The browser does not expose biometric data to LAM; only a signed cryptographic assertion is sent to the server.

### Additional setup

1. Install dependencies and regenerate the package lock: `pnpm install` (the source environment could not reach the package registry to refresh `pnpm-lock.yaml`).
2. Apply both SQL migrations in filename order: `202611180001_iot_fingerprint_attendance.sql`, then `202611180002_android_passkey_attendance.sql`.
3. Set server environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBAUTHN_ORIGIN=https://attendance.yourdomain.com` (exact origin, no trailing slash)
   - `WEBAUTHN_RP_ID=attendance.yourdomain.com` (hostname only)
   - `WEBAUTHN_RP_NAME=LAM Attendance`
4. Deploy on HTTPS. Set `WEBAUTHN_ORIGIN` to the exact site origin (for example `https://your-project.vercel.app`, with no trailing slash) and `WEBAUTHN_RP_ID` to its hostname only. WebAuthn does not work on an ordinary insecure HTTP production origin. `localhost` is permitted for local development.
5. Open a member's profile in the administrator workspace. On that member's Android phone, use Chrome and authenticate as an administrator, then choose **Enroll this phone** and complete the Android prompt. The passkey is bound to that member profile.
6. Open **Phone fingerprint** from Overview or Attendance and complete the Android biometric/passkey prompt (no email needed). First successful authentication checks the member in; the next checks them out.

**Operational note:** passkey enrollment currently requires the administrator session to be active on the phone being enrolled. Do not share an administrator password with members; have an authorized administrator supervise enrollment on the member's phone, or ask for a dedicated one-time enrollment invitation workflow before production rollout. A passkey may use the phone PIN/pattern as an OS fallback, so the app can require user verification but cannot force fingerprint-only authentication.

### Security notes

- The server verifies the WebAuthn challenge, origin, RP ID, signature, and user-verification flag.
- Challenges are single-use and stored server-side. Credential public keys and signature counters are stored; biometric templates are not.
- Passkey APIs use the Supabase service role only on the server. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Apply database backups, HTTPS, access logging, and a tested account recovery process before production use.

---

# QR + face verification attendance update

The QR attendance scanner now runs a two-stage flow:

1. Scan the opaque member QR credential with the rear camera.
2. Automatically request the front camera and show a face-positioning frame.
3. The operator/member captures the live face image.
4. The server resolves the QR credential, loads the member's existing private `face_photo_path`, and compares the live capture against that registered photo using the Face++ Compare API.
5. Only when the comparison confidence meets `FACE_MATCH_THRESHOLD` does the server call `record_qr_attendance`. A missing face profile, mismatch, API/configuration error, or unregistered QR never records attendance.

## Facial verification configuration

Set these server-only environment variables in local `.env.local` and the deployment environment:

- `FACEPP_API_KEY`
- `FACEPP_API_SECRET`
- `FACEPP_API_URL` (optional; defaults to the US Compare API endpoint; use the endpoint shown for your Face++ account region)
- `FACE_MATCH_THRESHOLD` (0–100; default 80)

Apply `supabase/migrations/202611200003_qr_face_verification_gate.sql` after the existing migrations. It removes direct browser execution of the QR attendance RPC; only the server service-role route may write QR attendance. Existing registered member photos in the private `attendance-member-photos` bucket are used as the reference profiles. New and updated member photos are normalized to JPEG (maximum 1024 px and 1.7 MB) before upload. Members with older oversized photos must edit their profile and re-upload the face photo.

**Important security limitation:** Face++ Compare verifies similarity, but this integration does not implement active liveness detection. A printed photograph or replayed screen may still be presented to the camera. Do not represent this as spoof-resistant or deploy it for high-assurance attendance until an approved liveness/anti-spoof check is added and tested. Live face images are transmitted to Face++ for comparison; obtain appropriate consent, disclose this processing, and confirm the provider's data-retention and regional requirements before production use.

## QR attendance API

`POST /api/attendance/qr-face` requires an authenticated administrator session and an `attendance_admins` record. It accepts an opaque QR token and a JPEG/PNG data URL, performs the face comparison server-side, and records attendance only after a successful match. The service-role key and Face++ credentials remain server-side.
