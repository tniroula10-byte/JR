# Operator Action Items (`docs/HUMAN-TODO.md`)

Everything runs locally on the **Mock Data Adapter** (`lib/data/mock/`) with no accounts. To go live you need a domain, **Supabase Pro**, **Resend** and **Vercel**. Do the steps below in order.

Turn on two-step login (2FA) on every account you create. Never paste keys into chats, screenshots, GitHub or `.env.example`.

Already generated for you: `.env.vercel` in the project folder (private, ignored by git) holds the phone-notification keys and `CRON_SECRET`, plus a list of the values you still need to fill in.

---

## Step 1: Domain

1. Buy the domain (Namecheap, Cloudflare or Porkbun). Ideally the client buys it in the business's name.
2. Make sure **WHOIS privacy** is on.

---

## Step 2: Create a fresh Supabase project

Use a **new** project. The old one has tables from an earlier attempt and no real data. Delete it after the new one works, along with the empty `jr-live-db` bucket.

1. Sign in to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**:
   - Name: `john-rambo-prod`
   - Region: **West US (North California)**, closest to the customers
   - Database password: let Supabase generate it, and keep it in your password manager.
2. Upgrade the project to **Pro** (backups, no pausing).
3. **Authentication → Sign In / Providers**:
   - Turn **off** "Allow new users to sign up". Users join by invitation only.
   - Keep the **Email** provider **enabled**. Password login and the 6-digit invite code both use it.
4. **Authentication → Email Templates → Magic Link**:
   - Subject: `Your John Rambo verification code`
   - Body: paste [`supabase/templates/otp-code.html`](../supabase/templates/otp-code.html). It must contain `{{ .Token }}`.
5. **Authentication → URL Configuration**:
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URL: `https://YOUR-DOMAIN/callback`
6. **Project Settings → API**: you will copy the **Project URL**, the **anon public key** and the **service_role key** into Vercel in Step 6.
   - The service_role key is the master key to the database. Never share it.

---

## Step 3: Create the database tables

1. Open [`supabase/apply_all.sql`](../supabase/apply_all.sql). It contains all six migrations (`00001` to `00006`) in order.
2. In Supabase: **SQL Editor → New query**. Paste the whole file and click **Run**.
3. Check **Table Editor**: there should be **35 tables**, each marked RLS enabled.

---

## Step 4: Email (Resend)

1. Sign in to [resend.com](https://resend.com) → **Domains → Add domain**.
   - Add the DNS records it shows at your domain seller and wait for **Verified**.
   - This stops emails landing in spam.
2. **API Keys → Create API key** (`re_...`).
3. In Supabase: **Project Settings → Authentication → SMTP Settings**. Enable **Custom SMTP** and enter:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - Sender email: `support@YOUR-DOMAIN`
   - Sender name: `John Rambo Support`

---

## Step 5: Create the single Boss account

The setup script reads its settings from a temporary file, so the live keys never go into `.env.local`. If they did, your local demo would start using the real database.

1. Create a file called `.env.boss` in the project folder. Git ignores it.
   ```
   NEXT_PUBLIC_SUPABASE_URL=<Project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   BOSS_EMAIL=<boss's email>
   BOSS_PASSWORD=<long, unique password, at least 12 characters>
   BOSS_FULL_NAME=<boss's name>
   BOSS_USERNAME=BOKA10
   BOSS_PUBLIC_ALIAS=BOKA
   ```
   - `BOSS_USERNAME` is optional.
   - `BOSS_PUBLIC_ALIAS` is the name customers see in complaint rooms.
   - You can also add `BOSS_PHONE=+1...` (optional).
2. Run:
   ```bash
   npx tsx --env-file=.env.boss scripts/seed-boss.ts
   ```
   Running it again changes nothing.
3. **Delete `.env.boss`** straight away:
   ```bash
   rm .env.boss
   ```

---

## Step 6: Deploy to Vercel

1. Merge the `feat/launch-docs` pull request into `main` on GitHub. The automatic tests must be green first.
2. Go to [vercel.com/new](https://vercel.com/new) → **Import** the GitHub repository.
   - A business site needs the **Pro** plan. The free Hobby plan is for non-commercial use only.
3. **Settings → Environment Variables** (Production): add every line from `.env.vercel`, filling in the blanks.
   - Do **not** add `JR_FORCE_MOCK`, `JR_ALLOW_DEMO_AUTH`, `SEED_*`, `BOSS_PASSWORD` or `MAILPIT_URL`.
4. Deploy. Then:
   - **Settings → Domains**: add your domain and create the DNS records Vercel shows.
   - Update the Supabase Site URL (Step 2.5) if it changed.
5. The nightly job (`vercel.json` → `/api/cron`, 02:00 UTC every day) runs automatically. It:
   - closes resolved tickets
   - removes expired story files
   - sends any leftover phone notifications

   Vercel sends `CRON_SECRET` with each run; without it, the job refuses to run.

---

## Step 7: Check everything before inviting customers

Use a real phone.

1. Open `https://YOUR-DOMAIN/api/health`. It should report OK.
2. Sign in as the Boss. Turn on phone notifications (**Notifications → Turn on phone notifications**).
   - On iPhone, add the site to the Home Screen first.
3. Invite a test employee and a test customer using email addresses you control:
   - The code email arrives (check spam).
   - The customer sets a password and you approve them.
4. As the test customer, submit a top-up. As the employee, mark it **Loaded**. The customer sees it in chat.
5. Send a chat and raise a ticket. Check that the customer only ever sees "John Rambo Support".
6. Check that the alert inbox receives emails (they come from `EMAIL_FROM_ADDRESS`).
7. Suspend the test accounts.

---

## Step 8: Set up games and payment tags (in the app)

1. Sign in as the Boss and open **Game Top-ups**.
2. **Games** tab: add the games customers can top up (up to 11 at once).
3. **Payment tags** tab: add up to 3 payment methods (e.g. Cash App, Venmo, Zelle) and at least one tag for each.
4. **Tag rule** tab: choose "Rotate after N deposits" or "Same tag per customer".
5. The client should confirm with their payment providers that receiving business payments on these accounts is allowed. Rotating personal accounts can get them frozen.

---

## Step 9: After launch

- Fill in the `[PLACEHOLDERS]` on `/privacy` and `/terms` with the client's details. Have a lawyer check the terms.
- Make the GitHub repository **private**: **Settings → Danger Zone → Change visibility**.
- Delete the old Supabase project.
