# 08 — Security & Deployment Plan (`docs/08-security-and-deployment.md`)

## 1. Defense-in-Depth Security Controls

1. **Row Level Security (RLS) & CI Enforcement**:
   - Every table in `public` has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and `ALTER TABLE ... FORCE ROW LEVEL SECURITY;`.
   - `scripts/verify-rls.ts` (run in CI and `npm test`) scans `supabase/migrations/` and `supabase/apply_all.sql` to guarantee that every `CREATE TABLE public.<name>` statement has matching `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` statements.
2. **HTTP Security Headers & Strict Content Security Policy (CSP)**:
   - Configured in `next.config.mjs` and `middleware.ts`:
     - `Content-Security-Policy`: restricts `default-src 'self'`, `script-src`, `connect-src` (self + Supabase HTTPS/WSS), `img-src 'self' data: blob: https:`, `frame-ancestors 'none'`, `object-src 'none'`.
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. **Zero `dangerouslySetInnerHTML`**:
   - All user-generated text (chat messages, ticket descriptions, offer notes, announcements, stories) is rendered as escaped React text nodes.
4. **Service-Role Key Containment**:
   - `lib/supabase/admin.ts` starts with `import 'server-only'`.
   - Automated tests scan `app/`, `components/`, and `lib/` to ensure `SUPABASE_SERVICE_ROLE_KEY` never appears in client modules or `NEXT_PUBLIC_` variables.
5. **Privacy-Preserving Authentication & Rate Limiting**:
   - Magic-link login always returns a generic message (`"If your email is registered by invitation, a sign-in link has been sent."`) so attackers cannot enumerate invited emails.
   - `shouldCreateUser: false` ensures uninvited emails never create `auth.users` rows.
   - Rate limits protect login emails, offers, tickets, and chat messages.
6. **Private Storage & Upload Validation**:
   - Buckets `product-media`, `story-media`, and `avatars` are private.
   - Upload signer validates allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `video/mp4` for stories) and maximum byte sizes (`5 MB` images, `15 MB` story videos) before issuing a signed upload URL.
7. **Immediate Session Revocation on Suspension**:
   - When the Boss suspends an employee or customer, the server action sets `profiles.status = 'suspended'`, logs to `audit_log`, and invokes `supabaseAdmin.auth.admin.signOut(userId, 'global')`. Both `middleware.ts` and RLS (`public.is_active()`) block any further request immediately.

---

## 2. Deployment Architecture

- **Hosting**: Vercel Pro / Production connected to GitHub repository.
- **Database**: Supabase Pro project (`ap-south-1` Mumbai) + separate Staging Supabase project.
- **Scheduled Cron Jobs (`vercel.json`)**:
  - `GET /api/cron/auto-close-tickets` (`0 2 * * *` daily) — Secured via `Authorization: Bearer ${CRON_SECRET}`. Transitions `resolved` tickets older than `app_settings.ticket_auto_close_days` to `closed`.
  - `GET /api/cron/expire-stories` (`0 * * * *` hourly) — Secured via `Authorization: Bearer ${CRON_SECRET}`. Purges expired story media objects from private storage and logs cleanup.
- **Backups & Monitoring**:
  - Supabase Pro automatic daily backups + Point-in-Time Recovery (PITR).
  - Sentry error boundaries (`app/error.tsx`, `app/global-error.tsx`) and `/api/health` uptime endpoint.
