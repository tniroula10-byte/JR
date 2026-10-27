# 03 — Permission Matrix & RLS Policies (`docs/03-permission-matrix.md`)

## 1. SQL Security Helper Functions

All RLS policies rely on `STABLE SECURITY DEFINER` functions with `SET search_path = public`:
- `public.is_active()` → `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active')`
- `public.is_boss()` → `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role = 'boss')`
- `public.is_employee()` → `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role = 'employee')`
- `public.is_staff()` → `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role IN ('boss', 'employee'))`
- `public.is_customer()` → `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active' AND role = 'customer')`
- `public.has_staff_flag(flag_name text)` → returns `true` for active `boss`, or active `employee` with that boolean column set in `staff_profiles`.
- `public.can_access_conversation(conv_id uuid)` → returns `true` if:
  - `public.is_boss()`, OR
  - `public.is_customer()` and `conversations.customer_id = auth.uid()`, OR
  - `public.is_employee()` and (`app_settings.employee_inbox_scope = 'all'` OR `conversations.handled_by = auth.uid()`)

---

## 2. Role Permission Matrix

| Resource / Action | Boss (`boss`) | Employee (`employee`) | Customer (`customer`) | Enforcement Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Invite customers** | Yes | Yes | No | Server Action + `invite_user` check + `invitations` RLS |
| **Invite employees** | Yes | No | No | Server Action + `invitations` RLS (`intended_role = 'employee'` requires `is_boss()`) |
| **Suspend / activate users** | Yes | No | No | Server-only Admin module + `audit_log` + session revocation |
| **Edit app settings & staff flags** | Yes | No | No | `app_settings` & `staff_profiles` UPDATE policy (`is_boss()`) |
| **Products: Read** | All (`available`, `sold_out`, `hidden`) | All (`available`, `sold_out`, `hidden`) | `status = 'available'` only | `products` SELECT RLS policy |
| **Products: Write** | Yes | Only if `can_manage_products = true` | No | `products` INSERT/UPDATE RLS (`has_staff_flag('can_manage_products')`) |
| **Customer Conversations: Read** | All | Per `employee_inbox_scope` (`all` or `assigned_only`) | Own conversation only (`customer_id = auth.uid()`) | `conversations` & `messages` SELECT RLS (`can_access_conversation`) |
| **Customer Conversations: Reply** | Yes | Per `employee_inbox_scope` | Own conversation only | `send_staff_message` & `send_customer_message` RPCs |
| **See staff message attribution** | Yes | Yes | **Never** | `message_attribution` & `ticket_message_attribution` SELECT RLS (`is_staff()`) |
| **Offers: Read** | All | Per `employee_inbox_scope` | Own offers only (`customer_id = auth.uid()`) | `offers` & `offer_events` SELECT RLS |
| **Offers: Create** | No | No | Via `submit_offer` RPC only | `submit_offer` checks `is_customer()` |
| **Offers: Counter / Accept / Reject** | Yes | Per `employee_inbox_scope` | Withdraw own `pending` offer only | `respond_to_offer` & `withdraw_offer` RPCs |
| **Tickets: Read** | All | All (read-only unless assigned) | Own tickets only (`customer_id = auth.uid()`) | `tickets` & `ticket_messages` SELECT RLS |
| **Tickets: Reply / Change Status** | Yes | Only if `assigned_employee_id = auth.uid()` | Reply to own; reopen or confirm own `resolved` ticket | `reply_ticket` & `transition_ticket` RPCs |
| **Tickets: Assign / Reassign** | Yes | No | No (can only request at creation if `customer_can_pick_employee` is on) | `assign_ticket` RPC checks `is_boss()` |
| **Boss-Employee Private Threads** | Read & write all threads | Own thread read & write; colleagues' threads **read-only** | No access | `staff_threads` & `staff_thread_messages` RLS |
| **Staff Channel (`staff_announcements`)** | Post announcements, view all acks | Read announcements, acknowledge own (`acknowledge_staff_post`) | No access | `staff_announcements` & `staff_announcement_acks` RLS + RPC |
| **Customer Announcements** | Post & edit | Post/edit only if `can_post_customer_announcements`; always read | Read only | `customer_announcements` RLS |
| **Stories** | Full (`SELECT`, `INSERT`, `UPDATE`) | Full if `can_publish_stories`; read live stories | Read live (`expires_at > now()`) stories only; record own view | `stories` & `story_views` RLS |
| **Performance Data (`activity_events`)** | All employees, all filters, CSV export | Own rows only (`actor_id = auth.uid()`) | No access | `activity_events` SELECT RLS + `security_invoker` views |
| **Audit Log (`audit_log`)** | Read all | No access | No access | `audit_log` SELECT RLS (`is_boss()`) |
| **Notifications (`notifications`)** | Own only | Own only | Own only | `notifications` SELECT/UPDATE (`recipient_id = auth.uid()`) |
| **Suspended User (`status = 'suspended'`)** | Denied all | Denied all | Denied all | Every RLS policy requires `public.is_active() = true` |
