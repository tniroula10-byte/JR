# Operator Action Items (`docs/HUMAN-TODO.md`)

Everything in the **John Rambo** codebase runs and passes automated verification out-of-the-box using the **Mock Data Adapter** (`lib/data/mock/`). To connect the application to a live **Supabase Pro** project, **Resend** SMTP, and **Vercel** production hosting, follow these exact steps in order:

---

## Step 1: Create Your Supabase Project

1. Sign in to [https://supabase.com/dashboard](https://supabase.com/dashboard) and create two projects (or one Production project first):
   - **Production**: `john-rambo-prod` (Region: `ap-south-1` Mumbai recommended for `Asia/Kolkata` latency)
   - **Staging**: `john-rambo-staging`
2. In your Supabase Dashboard, go to **Authentication → Providers → Email**:
   - **Disable** "Allow new users to sign up" (Public sign-up MUST be disabled; users join by invitation only).
   - **Enable** "Email OTP / Magic Link".
3. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your production domain (or `http://localhost:3000` for local testing).
   - Add Redirect URLs:
     - `http://localhost:3000/callback`
     - `https://<your-vercel-domain>/callback`
4. Go to **Project Settings → API** and copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role secret key** (`SUPABASE_SERVICE_ROLE_KEY`) — *Keep secret; never expose to the browser!*

---

## Step 2: Apply the Database Schema & RLS Migrations

You have two options to apply all migrations (`00001` through `00008`):

### Option A: Via Supabase SQL Editor (Fastest, No CLI Required)
1. Open the file [`supabase/apply_all.sql`](../supabase/apply_all.sql) in this repository.
2. In your Supabase Dashboard, navigate to **SQL Editor → New Query**.
3. Paste the entire contents of `supabase/apply_all.sql` and click **Run**.
4. Verify in **Table Editor** that all 22 tables exist and display **RLS Enabled**.

### Option B: Via Supabase CLI
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

---

## Step 3: Configure Resend Custom SMTP (For Magic-Link Auth Emails)

1. Sign in to [https://resend.com](https://resend.com), add and verify your sending domain.
2. Generate an API Key (`re_...`).
3. In Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**:
   - Enable **Custom SMTP**
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: `<your-resend-api-key>`
   - Sender email: `auth@yourdomain.com`
   - Sender name: `John Rambo Support`

---

## Step 4: Configure `.env.local`

Copy `.env.example` to `.env.local` and fill in your real values:

```bash
cp .env.example .env.local
```

Required keys in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOSS_EMAIL` (your personal email address for the single Boss account)
- `BOSS_FULL_NAME`
- `BOSS_PHONE` (E.164 format, e.g. `+919876543210`)
- `RESEND_API_KEY`
- `CRON_SECRET` (run `openssl rand -hex 32` to generate)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY` (run `npx web-push generate-vapid-keys` to generate)

---

## Step 5: Bootstrap the Single Boss Account

Once `.env.local` is populated and migrations are applied, run the idempotent Boss seed script:

```bash
npm run seed:boss
```

This creates/activates your singleton `boss` profile and sends a magic link (or makes your email ready for magic-link login at `/login`).

---

## Step 6: Deploy to Vercel

1. Push this repository to GitHub/GitLab.
2. Import the project into [https://vercel.com/new](https://vercel.com/new).
3. Add all environment variables from `.env.local` to the Vercel Project Settings (Production & Preview environments).
4. Deploy. Vercel Cron Jobs (`vercel.json`) will automatically schedule:
   - `/api/cron/auto-close-tickets` (runs daily to close tickets in `resolved` status older than `ticket_auto_close_days`)
   - `/api/cron/expire-stories` (runs hourly to clean up expired story media after the 24-hour window)
