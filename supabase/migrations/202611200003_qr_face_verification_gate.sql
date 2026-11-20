-- QR attendance must only be written by the authenticated server route after
-- successful facial comparison. Browser clients must not call the RPC directly.
revoke all on function public.record_qr_attendance(text) from public, anon, authenticated;
grant execute on function public.record_qr_attendance(text) to service_role;
