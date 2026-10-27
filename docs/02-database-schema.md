# 02 — Database Schema (`docs/02-database-schema.md`)

All tables reside in the `public` schema, use `uuid` primary keys (`gen_random_uuid()`), store timestamps in UTC (`timestamptz`), store money in integer paise (`bigint`), enforce foreign keys and check constraints, index every foreign key and `(parent_id, created_at)` pair, and enable Row Level Security (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`).

---

## 1. Custom Enums

- `user_role`: `'boss' | 'employee' | 'customer'`
- `user_status`: `'invited' | 'active' | 'suspended'`
- `invitation_status`: `'pending' | 'accepted' | 'expired' | 'revoked'`
- `inbox_scope_mode`: `'all' | 'assigned_only'`
- `product_status`: `'available' | 'sold_out' | 'hidden'`
- `sender_kind`: `'customer' | 'staff' | 'system'`
- `message_type`: `'text' | 'offer' | 'system'`
- `offer_status`: `'pending' | 'countered' | 'accepted' | 'rejected' | 'withdrawn'`
- `offer_event_type`: `'submitted' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'withdrawn'`
- `ticket_priority`: `'low' | 'normal' | 'high' | 'urgent'`
- `ticket_status`: `'open' | 'assigned' | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed'`
- `ticket_event_type`: `'created' | 'assigned' | 'reassigned' | 'status_changed' | 'replied' | 'reopened' | 'resolved' | 'closed'`
- `announcement_priority`: `'normal' | 'important' | 'urgent'`
- `story_kind`: `'text' | 'image' | 'video'`

---

## 2. Tables & Key Columns

### 2.1 Identity, Settings & Invitations
1. **`profiles`**:
   - `id uuid PK REFERENCES auth.users(id) ON DELETE RESTRICT`
   - `role user_role NOT NULL`
   - `status user_status NOT NULL DEFAULT 'invited'`
   - `full_name text NOT NULL`
   - `email citext NOT NULL UNIQUE`
   - `phone text UNIQUE CHECK (phone ~ '^\+[1-9]\d{6,14}$')`
   - `avatar_path text`
   - `invited_by uuid REFERENCES public.profiles(id)`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `last_seen_at timestamptz`
   - **Singleton Index**: `CREATE UNIQUE INDEX profiles_single_boss_idx ON public.profiles ((role)) WHERE role = 'boss';`
2. **`staff_profiles`**:
   - `user_id uuid PK REFERENCES public.profiles(id) ON DELETE RESTRICT`
   - `public_alias text NOT NULL UNIQUE`
   - `customer_selectable boolean NOT NULL DEFAULT false`
   - `accepts_tickets boolean NOT NULL DEFAULT true`
   - `can_manage_products boolean NOT NULL DEFAULT false`
   - `can_publish_stories boolean NOT NULL DEFAULT false`
   - `can_post_customer_announcements boolean NOT NULL DEFAULT false`
   - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
3. **`app_settings`** (Single-row table enforced via `id boolean PK DEFAULT true CHECK (id = true)`):
   - `employee_inbox_scope inbox_scope_mode NOT NULL DEFAULT 'all'`
   - `customer_can_pick_employee boolean NOT NULL DEFAULT false`
   - `ticket_auto_close_days integer NOT NULL DEFAULT 7 CHECK (ticket_auto_close_days BETWEEN 1 AND 90)`
   - `offer_sanity_max_paise bigint NOT NULL DEFAULT 100000000` (₹10,00,000)
   - `business_hours_only boolean NOT NULL DEFAULT false`
   - `updated_by uuid REFERENCES public.profiles(id)`, `updated_at timestamptz NOT NULL DEFAULT now()`
4. **`invitations`**:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `email citext NOT NULL`
   - `intended_role user_role NOT NULL CHECK (intended_role IN ('customer', 'employee'))`
   - `full_name text NOT NULL`
   - `phone text`
   - `invited_by uuid NOT NULL REFERENCES public.profiles(id)`
   - `status invitation_status NOT NULL DEFAULT 'pending'`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')`
   - `accepted_at timestamptz`

### 2.2 Catalog (`products`)
5. **`products`**:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `game_name text NOT NULL`
   - `title text NOT NULL`
   - `points_qty bigint NOT NULL CHECK (points_qty > 0)`
   - `description text NOT NULL DEFAULT ''`
   - `image_path text`
   - `price_paise bigint NOT NULL CHECK (price_paise > 0)`
   - `status product_status NOT NULL DEFAULT 'available'`
   - `created_by uuid NOT NULL REFERENCES public.profiles(id)`
   - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`

### 2.3 Conversations, Messages & Staff Attribution
6. **`conversations`**:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `customer_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id)`
   - `handled_by uuid REFERENCES public.profiles(id)`
   - `awaiting_staff boolean NOT NULL DEFAULT false`
   - `last_message_at timestamptz`
   - `last_message_preview text`
   - `customer_last_read_at timestamptz`
   - `staff_last_read_at timestamptz`
   - `customer_unread_count integer NOT NULL DEFAULT 0`
   - `staff_unread_count integer NOT NULL DEFAULT 0`
   - `created_at timestamptz NOT NULL DEFAULT now()`
7. **`messages`**:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `conversation_id uuid NOT NULL REFERENCES public.conversations(id)`
   - `sender_kind sender_kind NOT NULL`
   - `customer_sender_id uuid REFERENCES public.profiles(id)` (NULL for `'staff'` and `'system'`, enforced by CHECK constraint)
   - `type message_type NOT NULL DEFAULT 'text'`
   - `body text NOT NULL`
   - `offer_id uuid` (FK to `offers.id`)
   - `client_msg_id text NOT NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - **Idempotency Constraint**: `UNIQUE (conversation_id, client_msg_id)`
8. **`message_attribution`** (Staff-only read):
   - `message_id uuid PK REFERENCES public.messages(id)`
   - `staff_id uuid NOT NULL REFERENCES public.profiles(id)`
   - `created_at timestamptz NOT NULL DEFAULT now()`

### 2.4 Price Offers & Offer Ledger
9. **`offers`**:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `product_id uuid NOT NULL REFERENCES public.products(id)`
   - `customer_id uuid NOT NULL REFERENCES public.profiles(id)`
   - `conversation_id uuid NOT NULL REFERENCES public.conversations(id)`
   - `offered_price_paise bigint NOT NULL CHECK (offered_price_paise > 0)`
   - `listed_price_paise bigint NOT NULL CHECK (listed_price_paise > 0)`
   - `product_title text NOT NULL`
   - `status offer_status NOT NULL DEFAULT 'pending'`
   - `counter_price_paise bigint CHECK (counter_price_paise IS NULL OR counter_price_paise > 0)`
   - `staff_note text`
   - `handled_by uuid REFERENCES public.profiles(id)`
   - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
10. **`offer_events`** (Append-only):
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `offer_id uuid NOT NULL REFERENCES public.offers(id)`
    - `actor_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `event offer_event_type NOT NULL`
    - `meta jsonb NOT NULL DEFAULT '{}'::jsonb`
    - `created_at timestamptz NOT NULL DEFAULT now()`

### 2.5 Support Tickets & Ticket Ledger
11. **`tickets`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `ticket_no serial UNIQUE` (formatted in UI as `TKT-1001`)
    - `customer_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `subject text NOT NULL`
    - `description text NOT NULL`
    - `category text NOT NULL DEFAULT 'general'`
    - `priority ticket_priority NOT NULL DEFAULT 'normal'`
    - `status ticket_status NOT NULL DEFAULT 'open'`
    - `assigned_employee_id uuid REFERENCES public.profiles(id)`
    - `requested_employee_id uuid REFERENCES public.profiles(id)`
    - `reopen_count integer NOT NULL DEFAULT 0`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - `first_response_at timestamptz`
    - `resolved_at timestamptz`
    - `closed_at timestamptz`
12. **`ticket_messages`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `ticket_id uuid NOT NULL REFERENCES public.tickets(id)`
    - `sender_kind sender_kind NOT NULL`
    - `customer_sender_id uuid REFERENCES public.profiles(id)` (NULL for `'staff'` and `'system'`, enforced by CHECK)
    - `body text NOT NULL`
    - `created_at timestamptz NOT NULL DEFAULT now()`
13. **`ticket_message_attribution`** (Staff-only read):
    - `ticket_message_id uuid PK REFERENCES public.ticket_messages(id)`
    - `staff_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `created_at timestamptz NOT NULL DEFAULT now()`
14. **`ticket_events`** (Append-only):
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `ticket_id uuid NOT NULL REFERENCES public.tickets(id)`
    - `actor_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `event ticket_event_type NOT NULL`
    - `from_value text`
    - `to_value text`
    - `created_at timestamptz NOT NULL DEFAULT now()`

### 2.6 Internal Staff Communication
15. **`staff_threads`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `employee_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id)`
    - `last_message_at timestamptz`
    - `created_at timestamptz NOT NULL DEFAULT now()`
16. **`staff_thread_messages`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `thread_id uuid NOT NULL REFERENCES public.staff_threads(id)`
    - `sender_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `body text NOT NULL`
    - `created_at timestamptz NOT NULL DEFAULT now()`
17. **`staff_announcements`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `author_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `title text NOT NULL`
    - `body text NOT NULL`
    - `priority announcement_priority NOT NULL DEFAULT 'normal'`
    - `created_at timestamptz NOT NULL DEFAULT now()`
18. **`staff_announcement_acks`**:
    - `announcement_id uuid NOT NULL REFERENCES public.staff_announcements(id)`
    - `employee_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `acknowledged_at timestamptz NOT NULL DEFAULT now()`
    - `PRIMARY KEY (announcement_id, employee_id)`

### 2.7 Customer Announcements, Stories & Notifications
19. **`customer_announcements`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `author_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `title text NOT NULL`
    - `body text NOT NULL`
    - `pinned boolean NOT NULL DEFAULT false`
    - `published_at timestamptz NOT NULL DEFAULT now()`
20. **`stories`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `author_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `kind story_kind NOT NULL DEFAULT 'text'`
    - `media_path text`
    - `caption text NOT NULL DEFAULT ''`
    - `bg_style text NOT NULL DEFAULT 'from-violet-900 via-slate-900 to-black'`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - `expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')`
21. **`story_views`**:
    - `story_id uuid NOT NULL REFERENCES public.stories(id)`
    - `customer_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `viewed_at timestamptz NOT NULL DEFAULT now()`
    - `PRIMARY KEY (story_id, customer_id)`
22. **`notifications`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `recipient_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `type text NOT NULL`
    - `title text NOT NULL`
    - `body text NOT NULL`
    - `link text NOT NULL DEFAULT '/'`
    - `payload jsonb NOT NULL DEFAULT '{}'::jsonb`
    - `read_at timestamptz`
    - `created_at timestamptz NOT NULL DEFAULT now()`
23. **`push_subscriptions`**:
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `user_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `endpoint text NOT NULL UNIQUE`
    - `p256dh text NOT NULL`
    - `auth text NOT NULL`
    - `user_agent text`
    - `created_at timestamptz NOT NULL DEFAULT now()`

### 2.8 Append-Only Performance & Security Ledgers
24. **`activity_events`** (Append-only):
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `occurred_at timestamptz NOT NULL DEFAULT now()`
    - `actor_id uuid NOT NULL REFERENCES public.profiles(id)`
    - `actor_role user_role NOT NULL`
    - `event_type text NOT NULL`
    - `customer_id uuid REFERENCES public.profiles(id)`
    - `conversation_id uuid REFERENCES public.conversations(id)`
    - `ticket_id uuid REFERENCES public.tickets(id)`
    - `offer_id uuid REFERENCES public.offers(id)`
    - `message_id uuid`
    - `meta jsonb NOT NULL DEFAULT '{}'::jsonb`
25. **`audit_log`** (Append-only):
    - `id uuid PK DEFAULT gen_random_uuid()`
    - `actor_id uuid REFERENCES public.profiles(id)`
    - `action text NOT NULL`
    - `entity text NOT NULL`
    - `entity_id text NOT NULL`
    - `before_meta jsonb`
    - `after_meta jsonb`
    - `ip text`
    - `created_at timestamptz NOT NULL DEFAULT now()`
