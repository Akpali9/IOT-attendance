# Android fingerprint attendance setup

## What the phone does

LAM uses WebAuthn/passkeys, not direct fingerprint sensor access. Android's secure credential provider displays the biometric/device-unlock prompt. Android may permit fingerprint, face unlock, or screen-lock PIN/pattern depending on device configuration. LAM never receives or stores fingerprint images or templates.

## Server configuration

```env
WEBAUTHN_ORIGIN=https://attendance.yourdomain.com
WEBAUTHN_RP_ID=attendance.yourdomain.com
WEBAUTHN_RP_NAME=LAM Attendance
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

`WEBAUTHN_ORIGIN` must exactly match the website origin. `WEBAUTHN_RP_ID` is the hostname only. Use HTTPS in production.

## Supabase

Run these migrations in order:

1. `supabase/migrations/202611180001_iot_fingerprint_attendance.sql` (legacy)
2. `supabase/migrations/202611180002_android_passkey_attendance.sql`

## Enroll a member phone

1. Open LAM on the Android phone in Chrome.
2. Sign in using an authorized administrator account.
3. Open Members, then the member's profile.
4. In **Android phone fingerprint / passkey**, tap **Enroll this phone**.
5. Complete the Android fingerprint/passkey prompt.
6. Confirm the success message.

For each member, enroll their own phone. Avoid enrolling a shared phone to multiple people unless the organization explicitly accepts that shared-device risk.

## Take attendance

1. Open Overview or Attendance.
2. Tap **Phone fingerprint**.
3. No email is needed: tap Scan fingerprint and the phone offers the passkey saved at registration.
4. Complete the Android prompt.
5. The first successful scan of the UTC attendance day checks in; the next checks out. A third scan reports that the day is complete.

## Troubleshooting

- **Passkeys not supported:** use current Chrome on Android and update Google Play Services/Android System components.
- **Not a secure context:** deploy behind HTTPS and ensure the origin and RP ID match exactly.
- **No passkey enrolled:** an administrator must enroll that member's phone first.
- **User verification failed:** confirm screen lock and fingerprint are configured on the phone; try the device PIN if Android offers it.
- **Challenge expired:** restart the flow and complete the prompt promptly.

A passkey verifies possession of the enrolled device and local user verification. It does not prove that a specific biological fingerprint (rather than an allowed device PIN or alternate biometric) was used.
