-- Fingerprint sign-in without an email address (discoverable passkeys).
-- The phone picks the member's passkey itself, so the server only needs a
-- single-use challenge that is not tied to a member until the fingerprint is verified.

create table if not exists public.attendance_passkey_auth_challenges (
  challenge text primary key,
  created_at timestamptz not null default now()
);

alter table public.attendance_passkey_auth_challenges enable row level security;
revoke all on public.attendance_passkey_auth_challenges from public, anon, authenticated;
grant all on public.attendance_passkey_auth_challenges to service_role;

create index if not exists attendance_passkey_auth_challenges_created_idx
  on public.attendance_passkey_auth_challenges (created_at);
