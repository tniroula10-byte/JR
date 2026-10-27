# 01 — Architecture (`docs/01-architecture.md`)

## 1. System Overview

**John Rambo** is an invitation-only, mobile-first Progressive Web App (PWA) for selling virtual game points through product inquiries and price negotiation. It supports 20 accounts at launch (1 `boss`, 4 `employee`s, 15 `customer`s) and scales cleanly to 50–60 accounts (1 `boss`, 4 `employee`s, 45–55 `customer`s).

### Architectural Priorities
1. **Security & Privacy** (PostgreSQL RLS + structural staff anonymity)
2. **Correctness** (Atomic PostgreSQL RPCs + integer paise arithmetic)
3. **Reliability** (Idempotent mutations + append-only event/audit ledgers)
4. **Maintainability** (Strict TypeScript + shared Zod schemas + typed repository interface)
5. **UX Polish** (Midnight Navy / Near-Black dark theme, Violet glow accents, Framer Motion transitions)

---

## 2. Architecture Diagram (Mermaid)

```mermaid
flowchart TD
    subgraph Clients["Client Layer (Mobile PWA & Desktop Browser)"]
        CApp["Customer App<br/>(Bottom Tab Bar / Sidebar)"]
        EApp["Employee App<br/>(Inbox, Tickets, Offers, Boss Chat)"]
        BApp["Boss App<br/>(Master Dashboard, Analytics, Audit, Settings)"]
        SW["Serwist Service Worker<br/>(Static Shell Only; Never Caches Auth API)"]
    end

    subgraph NextJS["Next.js App Router (Vercel Edge & Node Server)"]
        MW["middleware.ts<br/>Guard #1: Session, Suspended Check, Role Prefix"]
        Layouts["Role Layouts<br/>Guard #2: Server-Side Role Verification"]
        SA["Server Actions & API Routes<br/>Zod Validation + Rate Limiter"]
        Repo["Typed Data Repository Interface<br/>(lib/data/index.ts)"]
        MockAdapter["Mock Adapter<br/>(lib/data/mock/)"]
        SupaAdapter["Supabase Adapter<br/>(lib/data/supabase/)"]
        AdminMod["Server-Only Admin Client<br/>(lib/supabase/admin.ts — Service Role)"]
    end

    subgraph Supabase["Supabase Pro (PostgreSQL 15+, Auth, Realtime, Storage)"]
        Auth["Supabase Auth<br/>(Magic Link Only, shouldCreateUser: false)"]
        RLS["Guard #3: Row Level Security (RLS)<br/>Deny-by-Default + Helper Functions"]
        RPCs["Atomic PostgreSQL RPCs<br/>(submit_offer, send_staff_message, transition_ticket, ...)"]
        Tables[("Core & Attribution Tables<br/>(profiles, messages, message_attribution, offers, tickets)")]
        Ledgers[("Append-Only Ledgers<br/>(activity_events, audit_log, offer_events, ticket_events)")]
        RT["Supabase Realtime<br/>(postgres_changes filtered by RLS)"]
        Storage["Private Storage Buckets<br/>(product-media, story-media, avatars)"]
    end

    CApp & EApp & BApp --> MW --> Layouts --> SA --> Repo
    Repo -->|No .env.local keys| MockAdapter
    Repo -->|Live keys present| SupaAdapter
    SupaAdapter --> RLS
    SA -->|Invites / Suspend / Export / Cron| AdminMod
    AdminMod --> Auth & Tables & Ledgers
    RLS --> RPCs --> Tables & Ledgers
    Tables --> RT --> CApp & EApp & BApp
    SA -->|Validated Signed URLs| Storage
```

---

## 3. Core Architectural Invariants

1. **Database as the Security Boundary**: Every table in `public` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with deny-by-default policies.
2. **Mock-First Typed Repository Layer (`lib/data/`)**: UI components and Server Actions never call Supabase directly. All queries and mutations pass through `lib/data/` interfaces (`DataRepository`), backed by `MockDataRepository` (when `.env.local` has no live keys) or `SupabaseDataRepository` (when live keys exist).
3. **Triple Route Guards**:
   - **Layer 1 (`middleware.ts`)**: Verifies active session, blocks `suspended` users immediately, and enforces `/boss/*`, `/employee/*`, and customer route boundaries.
   - **Layer 2 (`app/(customer)/layout.tsx`, `app/(staff)/employee/layout.tsx`, `app/(staff)/boss/layout.tsx`)**: Server-side role verification against `profiles.role` and `profiles.status`.
   - **Layer 3 (PostgreSQL RLS & RPCs)**: Enforces row-level visibility and atomic validation inside PostgreSQL.
4. **Structural Staff Anonymity**:
   - Customers see all staff messages as **"John Rambo Support"**.
   - `public.messages` and `public.ticket_messages` store `customer_sender_id = NULL` when `sender_kind = 'staff'`.
   - The real employee ID is written atomically into `public.message_attribution` or `public.ticket_message_attribution`, which have RLS policies allowing `SELECT` exclusively to `public.is_staff()`.
5. **Service-Role Key Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is imported only inside `lib/supabase/admin.ts` (guarded by `import 'server-only'`) and `scripts/seed-boss.ts`.
6. **Zero Hard Deletes & Immutable Ledgers**: `activity_events`, `audit_log`, `offer_events`, and `ticket_events` have `BEFORE UPDATE OR DELETE` triggers that raise an exception for every role.
