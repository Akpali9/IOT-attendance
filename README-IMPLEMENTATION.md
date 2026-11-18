# LAM Attendance – implementation update

This package builds on the supplied Next.js + Supabase attendance application.

## Included in this update

- Camera-based member ID card scanning. The generated member card already contains an opaque QR credential; the scanner now requests the rear/environment camera and verifies the credential through the existing database attendance transaction.
- One-time `superadmin` bootstrap using the requested initial password `password123`, controlled by a server-only environment switch. The bootstrap assigns the `superadmin` role in `attendance_admins`.
- A password-change panel so the initial password can be replaced from **Access & security**.
- Optional IoT terminal user ID field on member profiles.
- An authenticated IoT fingerprint webhook and a Supabase migration that records check-in/check-out from a matched terminal user ID.
- Detailed setup instructions in `docs/DEVICE-INTEGRATION.md`.

## Required deployment steps

1. Configure the variables in `.env.example` in the hosting provider and Supabase. Keep service-role keys and device secrets server-side.
2. Apply `supabase/migrations/202611180001_iot_fingerprint_attendance.sql` in Supabase before using the new IoT member field.
3. Set `ATTENDANCE_ENABLE_DEFAULT_ADMIN_BOOTSTRAP=true` temporarily for first initialization. In the app choose **Set up the first administrator** and submit `superadmin` / `password123`. After the account is created, immediately set the switch to `false` or remove it.
4. Sign in, open **Access & security**, and change the password to a unique 12+ character password.
5. For fingerprint hardware, configure a vendor terminal or gateway to call `/api/iot/fingerprint` as documented. The device model and vendor SDK determine the bridge configuration.

## Important biometric limitation

A web page cannot read a phone's fingerprint or biometric template. On phones, the secure supported route is WebAuthn/passkeys, which requires a verified server-side credential registration and assertion flow. This update does not falsely mark phone fingerprint attendance as implemented. The IoT terminal integration is ready at the normalized webhook/database layer, but requires compatible physical hardware and vendor configuration.

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
4. Deploy on HTTPS. WebAuthn does not work on an ordinary insecure HTTP production origin. `localhost` is permitted for local development.
5. Open a member's profile in the administrator workspace. On that member's Android phone, use Chrome and authenticate as an administrator, then choose **Enroll this phone** and complete the Android prompt. The passkey is bound to that member profile.
6. Open **Phone fingerprint** from Overview or Attendance, enter the member email, and complete the Android biometric/passkey prompt. First successful authentication checks the member in; the next checks them out.

**Operational note:** passkey enrollment currently requires the administrator session to be active on the phone being enrolled. Do not share an administrator password with members; have an authorized administrator supervise enrollment on the member's phone, or ask for a dedicated one-time enrollment invitation workflow before production rollout. A passkey may use the phone PIN/pattern as an OS fallback, so the app can require user verification but cannot force fingerprint-only authentication.

### Security notes

- The server verifies the WebAuthn challenge, origin, RP ID, signature, and user-verification flag.
- Challenges are single-use and stored server-side. Credential public keys and signature counters are stored; biometric templates are not.
- Passkey APIs use the Supabase service role only on the server. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Apply database backups, HTTPS, access logging, and a tested account recovery process before production use.
