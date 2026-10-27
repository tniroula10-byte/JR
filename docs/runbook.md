# Operational Runbook (`docs/runbook.md`)

This runbook documents standard administrative and emergency procedures for **John Rambo**.

---

## 1. Initial Boss Bootstrap

The single `boss` account cannot be created from the UI. It is bootstrapped via the idempotent CLI script `scripts/seed-boss.ts`.

### Steps
1. Set `BOSS_EMAIL`, `BOSS_FULL_NAME`, `BOSS_PHONE`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
2. Run:
   ```bash
   npm run seed:boss
   ```
3. The script checks if a `boss` already exists:
   - If none exists, it creates the Supabase Auth user (`email_confirm: true`), inserts `public.profiles` (`role = 'boss'`, `status = 'active'`), inserts `public.staff_profiles`, and writes an `audit_log` entry (`action = 'boss_bootstrap'`).
   - If the same `BOSS_EMAIL` already exists as `boss`, it exits cleanly (idempotent).

---

## 2. Manual Boss Role Transfer

Because `CREATE UNIQUE INDEX profiles_single_boss_idx ON public.profiles ((role)) WHERE role = 'boss'` enforces a single boss and triggers prevent client-side role edits, transferring the `boss` role requires running a single atomic transaction in the Supabase SQL Editor as `postgres`:

```sql
BEGIN;

-- Disable profile protection trigger for this maintenance transaction only
SET LOCAL app.bypass_profile_guard = 'on';

-- Demote outgoing boss to employee
UPDATE public.profiles
SET role = 'employee'
WHERE role = 'boss' AND email = 'old-boss@example.com';

-- Promote incoming user to boss
UPDATE public.profiles
SET role = 'boss', status = 'active'
WHERE email = 'new-boss@example.com';

-- Record in immutable audit_log
INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before_meta, after_meta)
VALUES (
  NULL,
  'manual_boss_transfer',
  'profiles',
  'boss_singleton',
  jsonb_build_object('previous_boss', 'old-boss@example.com'),
  jsonb_build_object('new_boss', 'new-boss@example.com')
);

COMMIT;
```

---

## 3. Suspending & Reactivating a User

1. Sign in as the **Boss** and navigate to `/boss/customers` or `/boss/employees`.
2. Click **Suspend Account** on the target user.
3. Behind the scenes, the server action:
   - Sets `profiles.status = 'suspended'`.
   - Calls `supabaseAdmin.auth.admin.signOut(userId, 'global')` to revoke all active refresh/access tokens.
   - Writes an entry to `public.audit_log` (`action = 'user_status_changed'`).
4. Every RLS policy (`public.is_active()`) and `middleware.ts` immediately blocks the suspended user on their very next request.

---

## 4. Rotating Secrets (`SUPABASE_SERVICE_ROLE_KEY` & `CRON_SECRET`)

1. Generate a new `CRON_SECRET` (`openssl rand -hex 32`) or roll the `service_role` key in Supabase Dashboard → **Project Settings → API**.
2. Update the environment variables in **Vercel Project Settings → Environment Variables**.
3. Trigger a redeploy in Vercel so Serverless Functions pick up the new credentials.

---

## 5. Database Backup & Rehearsed Restore

1. **Automated Daily Backups**: Enabled automatically on Supabase Pro (**Database → Backups**).
2. **Logical Snapshot**:
   ```bash
   npx supabase db dump --db-url "$DATABASE_URL" -f backup_$(date +%Y%m%d).sql
   ```
3. **Restore Verification Procedure**:
   - Spin up a temporary staging project or local Supabase instance (`npx supabase start`).
   - Apply schema and data dump: `psql "$STAGING_DB_URL" -f backup_YYYYMMDD.sql`.
   - Run `npm run test:rls` and `npm test` against the restored database to verify all append-only ledgers (`audit_log`, `activity_events`, `offer_events`, `ticket_events`) and RLS policies are intact.
