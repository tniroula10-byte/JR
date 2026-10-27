# 05 — Performance Data Model & Definitions (`docs/05-performance-data-model.md`)

All staff performance metrics are computed dynamically from the append-only `public.activity_events` and `public.ticket_events` tables (plus current ticket statuses for live pending counts) using SQL views/functions with `security_invoker = true` so RLS applies automatically. No cached counters are used.

---

## 1. Metric Definitions (Displayed on Boss & Employee Dashboards)

| Metric | Source Events | Exact Calculation & Credit Rule |
| :--- | :--- | :--- |
| **Chat Messages Sent** | `activity_events` (`event_type = 'staff_chat_reply'`) | Count of customer chat messages sent by `actor_id = employee_id` within `[start_date, end_date]`. |
| **Ticket Replies Sent** | `activity_events` (`event_type = 'staff_ticket_reply'`) | Count of ticket thread replies sent by `actor_id = employee_id` within `[start_date, end_date]`. |
| **First Response Time — Chat (Avg / Median / P90)** | `activity_events` (`event_type = 'staff_chat_reply'` where `meta->>'is_first_response' = 'true'`) | Elapsed seconds from the customer message that flipped `conversations.awaiting_staff = true` to the first staff reply (`(meta->>'first_response_seconds')::numeric`). Credited to the employee who sent that reply. |
| **First Response Time — Ticket (Avg / Median / P90)** | `activity_events` (`event_type = 'staff_ticket_reply'` where `meta->>'is_first_response' = 'true'`) | Elapsed seconds from `tickets.created_at` to the first staff reply (`(meta->>'first_response_seconds')::numeric`). Credited to the replier. |
| **Ticket Resolution Time (Avg / Median)** | `activity_events` (`event_type = 'ticket_resolved'`) | Elapsed seconds from `tickets.created_at` to the most recent resolution (`(meta->>'resolution_seconds')::numeric`). Credited to the employee assigned at the moment of resolution (`actor_id` / `meta->>'credited_employee_id'`). |
| **Tickets Assigned** | `ticket_events` (`event IN ('assigned', 'reassigned')` where `to_value = employee_id::text`) | Count of assignment events to the employee within the date range. |
| **Tickets Resolved** | `activity_events` (`event_type = 'ticket_resolved'`) | Count of resolutions credited to the employee within the date range. |
| **Tickets Pending (Live)** | `tickets` (`assigned_employee_id = employee_id`) | Live count of tickets assigned to the employee in status `open`, `assigned`, `in_progress`, or `waiting_for_customer`. |
| **Tickets Reopened** | `activity_events` (`event_type = 'ticket_reopened'` where `meta->>'last_resolved_by' = employee_id::text`) | Count of reopen events on tickets that were most recently resolved by that employee. |
| **Offers Handled (Total & By Outcome)** | `activity_events` (`event_type IN ('offer_countered', 'offer_accepted', 'offer_rejected')`) | Count of distinct `offer_id`s where `actor_id = employee_id` in the range, broken down by outcome (`countered`, `accepted`, `rejected`). |
| **Conversations Handled** | `activity_events` (`event_type = 'staff_chat_reply'`) | Count of distinct `conversation_id`s where `actor_id = employee_id` sent at least one staff message in the range. |

---

## 2. Statistical Aggregations & Calendar vs. Business Hours

- **Aggregations**: For response and resolution times, SQL queries compute:
  - **Average**: `AVG(seconds)`
  - **Median (P50)**: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)`
  - **90th Percentile (P90)**: `PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY seconds)`
- **Calendar Time Default & Business-Hours Stub**:
  - By default (`app_settings.business_hours_only = false`), elapsed seconds are raw wall-clock seconds (`calendar_seconds`).
  - A helper function `public.calculate_elapsed_seconds(start_ts timestamptz, end_ts timestamptz, use_business_hours boolean)` defaults to calendar time and includes a configurable business-hours calculation (09:00–21:00 IST, Mon–Sat) when `use_business_hours = true`.

---

## 3. Access Control & Export

- **Boss (`is_boss()`)**: Can filter by any employee or all employees, select custom date ranges, compare employees side-by-side, inspect the chronological activity event stream, and export filtered analytics to CSV via `/api/exports/performance` (which writes an `audit_log` entry `action = 'export_performance_csv'`).
- **Employee (`is_employee()`)**: Can only query rows where `actor_id = auth.uid()` (enforced by RLS on `activity_events`). Cannot view other employees' metrics or trigger CSV exports.
