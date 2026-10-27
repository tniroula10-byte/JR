# AGENTS.md — Persistent Engineering & Security Rules for John Rambo

This file defines the non-negotiable architectural invariants, working rules (autonomous mode), and locked product decisions for **John Rambo** — an invitation-only, mobile-first Progressive Web App for virtual game-points catalog browsing, price negotiation, customer chat, support tickets, internal staff communications, and staff performance analytics.

Every AI agent or developer working in this repository MUST read and adhere to this file before modifying any code, database migration, or configuration.

---

## 0. WORKING RULES (AUTONOMOUS MODE)

1. **Autonomous Execution**: Run autonomously from start to finish. Never ask for approval, confirmation, or clarification. Write your own implementation plan and task list, then execute them without pausing. When something is undecided, choose the safest option consistent with this brief, record it in `docs/DECISIONS.md`, and continue.
2. **Sequential Phases with Self-Checks**: Work through the phases in Section 12 in order, with no pause between phases. A phase is finished only when its self-check passes, meaning you ran the tests or the browser check yourself and saw them pass. If a self-check fails, fix the cause and rerun it. Never skip a check and never move on with failing tests.
3. **Progress Tracking & Session Resume**: Keep `docs/PROGRESS.md` current after every phase and every major step: what is done, the exact next action, test results, known issues. If you are interrupted or hit a usage limit, this file lets a new session resume exactly where you stopped. At the start of any session, read `AGENTS.md` and `docs/PROGRESS.md` first, then continue with the first unfinished task.
4. **Phase A First**: Create the folders and documents first (Section 14), then start Phase 0 immediately.
5. **External Credentials & Mock-First Continuity**: Never create external accounts or invent credentials. Anything needed from the human operator (Supabase keys, email key, Vercel link) goes into `docs/HUMAN-TODO.md` with exact step-by-step instructions. Read keys from `.env.local` and keep working in the meantime using the mock data adapter (Decision 14) until real keys exist. Never block on a missing key.
6. **Git & Secret Hygiene**: Commit to git after each phase with conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Keep `.env.example` current. Never commit `.env.local` or any secret.
7. **Explicit Non-Goals (Do Not Build)**:
   - Online payments
   - Public sign-up
   - Passwords
   - Customer-to-customer messaging
   - Any social-network features
8. **Continuous Verification**: Test as you go: check every UI change in the browser (desktop and a 390 px mobile viewport) and save screenshots under `docs/screenshots/`; run automated tests for every database or logic change.
9. **Completion**: When the whole brief is done, write `docs/FINAL-REPORT.md` (what was built, how to run it, test results, decisions taken, remaining steps for the operator) and stop.

---

## 1. ROLES & CAPACITY

| Role | Launch Capacity | Target Capacity | Purpose |
| :--- | :--- | :--- | :--- |
| `boss` (Super Admin) | Exactly 1 | Exactly 1 | Full control, oversight of everything, performance review |
| `employee` | 4 | 4 | Handle customer chat, tickets and offers |
| `customer` | 15 | 45–55 | Browse, offer, chat, raise tickets |

**Priorities in order**:
1. Security and privacy
2. Correctness
3. Reliability
4. Maintainability
5. UX polish

---

## 2. DECISIONS ALREADY MADE (Section 3 — Do Not Re-Ask)

1. **Passwordless Authentication Only**:
   - Supabase email magic links, public sign-up disabled, `shouldCreateUser: false` on every sign-in call so an uninvited email can never create an account.
2. **Boss Bootstrap**:
   - A one-time, idempotent seed script (`scripts/seed-boss.ts`) reads `BOSS_EMAIL` from the environment and creates the single boss.
   - A partial unique index (`CREATE UNIQUE INDEX profiles_single_boss_idx ON public.profiles ((role)) WHERE role = 'boss';`) guarantees there is only one boss.
   - There is no UI path that creates or promotes a boss. Transferring the boss role is a documented manual runbook step (`docs/runbook.md`).
3. **Invitations**:
   - The `boss` can invite customers and employees.
   - `employee` users can invite customers only (never employees or a boss).
   - `customer` users cannot invite anyone.
   - Every invite goes through one server-side function that checks the caller's role, records who invited whom (`invited_by`, an `invitations` row, an `audit_log` entry, and an `activity_events` entry), and sends the magic-link email.
   - Customers invited by an employee are visible to all staff and start unassigned.
4. **Shared Customer-Facing Identity**:
   - Customers always see staff messages as **"John Rambo Support"** (shared name and logo).
   - The real employee is stored separately in staff-only tables (`message_attribution` and `ticket_message_attribution`).
   - Customers must never receive a staff user id, name, email, or avatar in any query, Realtime payload, or API response. Enforce this structurally (separate table plus RLS), not by hiding fields in the UI.
5. **Employee Inbox Scope**:
   - A boss setting `employee_inbox_scope` with values `all` (default: every employee can read and reply in every customer conversation) or `assigned_only` (an employee sees only conversations and tickets assigned to them).
   - RLS honours this setting through a SQL helper function.
   - Replying in a customer conversation records the employee as its current handler (`handled_by`), visible to staff, and the boss can reassign it.
6. **Tickets vs. Chat**:
   - Tickets are separate from chat. Chat is the open conversation; a ticket is a tracked case with its own thread, status, and assignee.
7. **Customer Employee Selection for Tickets**:
   - Controlled by a boss setting `customer_can_pick_employee` (default `false`).
   - When `true`, customers see only employees flagged `customer_selectable`, shown by a boss-defined `public_alias` (never the real name). A selection is a request: the ticket is created assigned to that employee.
   - With the setting `false`, tickets are created `Open` in a queue for the boss to assign.
8. **Boss/Employee Private Threads**:
   - One thread per employee (`staff_threads`).
   - The boss and that employee can read and write it.
   - The other employees can read it (`SELECT`) but cannot write (`INSERT`).
   - Customers have no access.
9. **Staff Channel**:
   - Only the boss can post (`staff_announcements`).
   - Employees read it, get notified, and acknowledge each post (recorded with timestamp in `staff_announcement_acks`).
   - No employee replies.
10. **Per-Employee Permission Flags**:
    - Set by the boss on `staff_profiles`: `can_manage_products`, `can_publish_stories`, `can_post_customer_announcements` (all default `false`).
    - Boss always has all of them.
11. **Money & Time**:
    - Money is stored as integer paise (`bigint`) and shown in rupees with Indian digit grouping (for example `₹1,50,000`).
    - Times are stored in UTC (`timestamptz`) and shown in `Asia/Kolkata`.
12. **Zero Hard Deletes & Append-Only Logs**:
    - No hard deletes of messages, tickets, offers, or events. Use soft delete or status.
    - `audit_log`, `activity_events`, `offer_events`, and `ticket_events` are append-only for every role, including the boss.
13. **Notifications**:
    - Out-of-app push notifications (Web Push) come in the PWA phase (Phase 10). In-app notifications come earlier.
14. **Mock-First Data Layer**:
    - The UI never calls Supabase directly.
    - All data access goes through a typed repository interface in `lib/data/` with two adapters: `mock` (realistic in-memory data) and `supabase`.
    - The app uses `supabase` when valid keys exist in `.env.local`, otherwise `mock`.

---

## 3. ARCHITECTURE RULES (Section 5)

1. **Database Security Boundary**: Every table in `public` has RLS enabled with deny-by-default policies. A CI check must fail if any table lacks RLS. The UI is never trusted for authorization.
2. **Service-Role Isolation**: The Supabase service-role key lives only in server-only modules (`invites`, `role changes`, `exports`, `cron endpoints`). Never expose it to the browser or put it in a `NEXT_PUBLIC_` variable.
3. **Atomic RPC Mutations**: Every multi-step business action is a Postgres function (RPC) that runs atomically and validates its inputs:
   - `submit_offer`
   - `send_staff_message`
   - `send_customer_message`
   - `create_ticket`
   - `assign_ticket`
   - `transition_ticket`
   - `acknowledge_staff_post`
   - plus `respond_to_offer`, `withdraw_offer`, `reply_ticket`
   Clients cannot insert into those tables directly.
4. **Role Protection**: Roles are read from `profiles.role`, protected by a trigger and policy so no one can change it from a client. Never trust user-editable metadata. Use `is_boss()`, `is_staff()`, `is_customer()`, and `is_active()` helper functions in policies.
5. **Triple Route Guards**: Admin and staff routes are guarded three times: `middleware.ts`, a server-side role check in the layout, and PostgreSQL RLS.
6. **Realtime Isolation**: Realtime uses `postgres_changes` with RLS so each client only receives rows it could select. Include automated tests proving a customer's socket receives nothing from other customers or from staff-internal tables.
7. **Private Storage & Signed URLs**: Store files in private buckets and serve them through short-lived signed URLs. Validate MIME type and size on the server before issuing an upload URL.
8. **Rate Limiting**: Rate-limit login emails, offer submission, ticket creation, and message sending.
