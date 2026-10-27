# 06 — UI / UX Design Specification (`docs/06-ui-ux-design.md`)

## 1. Visual Identity & Design Tokens

- **Theme**: Dark-only (`v1`), Midnight Navy & Near-Black surfaces with Violet accents and soft glow highlights.
- **Color Palette**:
  - Background Primary: `#070913` (`slate-950` / midnight obsidian)
  - Surface Elevated / Card: `#0F1424` (`rgba(15, 20, 36, 0.88)` with `1px solid rgba(139, 92, 246, 0.18)`)
  - Primary Accent (Violet): `#8B5CF6` (`violet-500`) → Hover `#7C3AED` (`violet-600`) with glow `0 0 20px rgba(139, 92, 246, 0.35)`
  - Secondary Accent (Cyan/Emerald for status & prices): `#10B981` (`emerald-500`), `#F59E0B` (`amber-500`), `#EF4444` (`rose-500`)
  - Text Primary: `#F8FAFC` (`slate-50`), Text Secondary: `#94A3B8` (`slate-400`)
- **Typography**: Clean modern sans-serif (`Inter` / system geometric sans) + tabular monospace (`JetBrains Mono`) for INR prices (`₹1,50,000`), ticket numbers (`TKT-1001`), and timestamps (`IST`).
- **Responsive Layout**:
  - **Mobile (`< 768px`, tested at `360px` & `390px`)**: Sticky top header with role badge + notification bell + persona switcher (in mock mode), full-bleed scrollable viewport, and fixed bottom navigation tab bar (max 5 primary tabs + "More" drawer).
  - **Desktop (`>= 768px`, tested at `768px` & `1280px`)**: Left vertical navigation sidebar (`260px` width) with grouped sections, top status bar, and multi-column workspace.
- **Accessibility**: WCAG AA contrast ratios (`>= 4.5:1`), visible `:focus-visible` violet rings (`ring-2 ring-violet-500`), semantic landmarks (`<nav>`, `<main>`, `<header>`), and ARIA labels on all icon buttons.

---

## 2. Screen Inventory by Role

### 2.1 Auth & Public Shell (`app/(auth)/`)
- `/login`: Passwordless magic-link sign-in form (email input, rate-limit feedback, generic privacy-preserving status message, plus Quick Persona Login buttons when running in Mock Mode).
- `/callback`: PKCE / OTP verification callback route.
- `/welcome`: Invited user onboarding confirmation screen.
- `/offline`: Offline PWA shell fallback page.

### 2.2 Customer App (`app/(customer)/`)
1. `/home`: Active story rings bar, pinned customer announcements banner, featured game points catalog, active offer & ticket summary cards, quick link to "John Rambo Support" chat.
2. `/products`: Filterable/searchable catalog of `available` game-point packages (shows `available` and `sold_out` badge if applicable; `hidden` products are completely excluded at the data layer). Includes product detail modal/view with **Submit Offer in ₹** form.
3. `/offers`: List of customer's submitted offers with status badges (`Pending`, `Countered`, `Accepted`, `Rejected`, `Withdrawn`), counter-offer response actions (`Accept Counter`, `Withdraw`), and event history.
4. `/chat`: Real-time 1-on-1 conversation with **"John Rambo Support"** (shared name and shield logo; zero employee identity leaked). Displays text messages and embedded interactive Offer Cards.
5. `/tickets`: Ticket list, **Create Ticket** dialog (with optional preferred staff alias picker when `customer_can_pick_employee = true`), and Ticket Detail view with conversation thread, status timeline, and `Confirm Resolution` / `Reopen Ticket` buttons when status is `resolved`.
6. `/stories`: Fullscreen story viewer with 24h countdown progress bars, tap-prev/next, press-and-hold pause, and automatic view tracking.
7. `/announcements`: Pinned and chronological announcements for customers.
8. `/notifications`: In-app notification center with unread filter and "Mark all read".
9. `/profile`: Edit own `full_name`, `email`, and `phone` (E.164 format).

### 2.3 Employee App (`app/(staff)/employee/`)
1. `/employee/dashboard`: My open work queue (awaiting chats, assigned tickets, pending offers) and today's personal performance snapshot.
2. `/employee/inbox`: Customer conversations (filtered by `employee_inbox_scope`: `all` or `assigned_only`), showing customer info, current handler badge, unread count, and live chat reply box.
3. `/employee/tickets`: Assigned tickets (full reply & status transition controls) + read-only tab of colleagues' tickets.
4. `/employee/offers`: Customer price offers within scope with `Accept`, `Counter (₹)`, and `Reject` controls.
5. `/employee/boss-chat`: Private thread with the Boss (read & write) + read-only tabs for colleagues' Boss threads.
6. `/employee/announcements`: Staff channel posts from the Boss with priority badge and **Acknowledge** button (plus timestamp once acknowledged).
7. `/employee/performance`: Personal performance metrics (chat/ticket response times, resolution times, offers handled, conversations handled) with metric definitions.
8. `/employee/invite-customer`: Invite a new customer by email, full name, and phone (employees can invite customers only, never employees or a boss).

### 2.4 Boss App (`app/(staff)/boss/`)
1. `/boss/dashboard`: Master command center — live account counts, awaiting chats, pending offers, tickets by status, response time averages/medians/P90, and employee leaderboard.
2. `/boss/customers`: Customer directory, invite new customer, suspend/reactivate customer, view customer's handler and activity.
3. `/boss/employees`: Employee management (4 employees) — invite employee, edit `public_alias`, toggle `customer_selectable`, `accepts_tickets`, `can_manage_products`, `can_publish_stories`, `can_post_customer_announcements`, suspend/reactivate.
4. `/boss/inbox`: Shared Customer Inbox showing the **real employee attribution badge** (`Sent by Vikram (Alias: Maverick)`) on every staff message and allowing handler reassignment.
5. `/boss/tickets`: All tickets queue with instant **Assign / Reassign Employee** selector, status transitions, and full staff attribution on every ticket reply.
6. `/boss/analytics`: Staff Performance Analytics — filter by employee & date range, side-by-side employee comparison table, chronological `activity_events` timeline, metric definitions panel, and **Export CSV** button.
7. `/boss/threads`: Internal 1-on-1 threads with each of the 4 employees (read and write all).
8. `/boss/products`: Full CRUD on game-point packages (`available`, `sold_out`, `hidden`), price in INR/paise, image upload validation.
9. `/boss/stories`: Publish new 24h text/image/video stories, inspect active/expired stories and customer view counts.
10. `/boss/announcements`: Dual-tab publisher for **Staff Channel Announcements** (with live employee acknowledgement matrix `3/4 Acknowledged`) and **Customer Announcements**.
11. `/boss/settings`: Configure `employee_inbox_scope` (`all` vs `assigned_only`), `customer_can_pick_employee` (`on` vs `off`), `ticket_auto_close_days`, `offer_sanity_max_paise`, and `business_hours_only`.
12. `/boss/audit`: Immutable `audit_log` viewer with filters by action, actor, and entity.
