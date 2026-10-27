# John Rambo

An invitation-only, mobile-first Progressive Web App (PWA) for virtual game-points catalog browsing, price negotiation (INR offers), real-time customer support chat with structural staff anonymity, tracked support tickets, internal staff communications, stories, announcements, and staff performance analytics.

## Quick Start

```bash
npm install
npm run dev
```

By default, if `.env.local` does not contain live Supabase credentials, the application automatically runs using the **Mock Data Adapter** (`lib/data/mock/`) with realistic pre-seeded data for all 3 roles (`boss`, `employee`, `customer`).

## Key Documentation

- [`AGENTS.md`](./AGENTS.md) — Working rules, locked product decisions, and security invariants
- [`docs/PROGRESS.md`](./docs/PROGRESS.md) — Live phase status, verification results, and resume protocol
- [`docs/HUMAN-TODO.md`](./docs/HUMAN-TODO.md) — Step-by-step instructions for provisioning external keys & going live
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — Architectural and engineering defaults chosen
- [`docs/01-architecture.md`](./docs/01-architecture.md) through [`docs/08-security-and-deployment.md`](./docs/08-security-and-deployment.md) — Complete system design specifications
- [`docs/runbook.md`](./docs/runbook.md) — Operational procedures (boss bootstrap, role transfer, key rotation, user suspension, backup restore)
- [`docs/security-checklist.md`](./docs/security-checklist.md) — Security verification checklist
