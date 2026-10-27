'use client';

/**
 * Boss System Settings (`components/shared/boss-settings-client.tsx`)
 * Decision 5 & Decision 7:
 * - `employee_inbox_scope`: `all` vs `assigned_only`
 * - `customer_can_pick_employee`: `false` vs `true`
 * - `ticket_auto_close_days`: default 7
 * - `offer_sanity_max_paise`: default 100,000,000 (₹10,00,000)
 * - `business_hours_only`: stubbed business hours toggle for performance analytics
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Settings } from 'lucide-react';
import { updateAppSettingsAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { AppSettings, InboxScopeMode } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function BossSettingsClient({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const [employeeInboxScope, setEmployeeInboxScope] = useState<InboxScopeMode>(
    settings.employeeInboxScope
  );
  const [customerCanPickEmployee, setCustomerCanPickEmployee] = useState(
    settings.customerCanPickEmployee
  );
  const [ticketAutoCloseDays, setTicketAutoCloseDays] = useState(
    String(settings.ticketAutoCloseDays)
  );
  const [offerSanityMaxRupees, setOfferSanityMaxRupees] = useState(
    String(Math.round(settings.offerSanityMaxPaise / 100))
  );
  const [businessHoursOnly, setBusinessHoursOnly] = useState(
    settings.businessHoursOnly
  );

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await updateAppSettingsAction({
        employeeInboxScope,
        customerCanPickEmployee,
        ticketAutoCloseDays: Number(ticketAutoCloseDays),
        offerSanityMaxPaise: Math.round(Number(offerSanityMaxRupees) * 100),
        businessHoursOnly
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to save settings.');
      } else {
        setFeedback('System settings updated and recorded in audit_log.');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>System Security & Scope Settings</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Single-row <code>app_settings</code> configuration enforced directly by PostgreSQL RLS helper functions.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {feedback}
        </div>
      ) : null}

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs text-slate-400">
          <span>Singleton Row: <code>public.app_settings</code></span>
          <Badge tone="violet">Last Updated: {formatIST(settings.updatedAt)}</Badge>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="setting-inbox-scope" className="block text-xs font-semibold text-white mb-1">
              Employee Inbox Scope (<code>employee_inbox_scope</code>)
            </label>
            <select
              id="setting-inbox-scope"
              value={employeeInboxScope}
              onChange={(e) => setEmployeeInboxScope(e.target.value as InboxScopeMode)}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              <option value="all">
                all (Default — Every employee can read and reply in every customer conversation)
              </option>
              <option value="assigned_only">
                assigned_only (Strict — Employee sees only conversations & offers assigned to them)
              </option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-800 bg-midnight-950/70 p-3.5 space-y-2">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={customerCanPickEmployee}
                onChange={(e) => setCustomerCanPickEmployee(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-midnight-950"
              />
              <span>
                Allow Customers to Request an Employee on Ticket Creation (<code>customer_can_pick_employee</code>)
              </span>
            </label>
            <p className="text-[11px] text-slate-400 pl-6">
              When enabled, customers see only employees flagged <code>customer_selectable = true</code>, shown strictly by their boss-defined <code>public_alias</code> (never their real name).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="setting-autoclose" className="block text-xs font-semibold text-white mb-1">
                Ticket Auto-Close Days (<code>ticket_auto_close_days</code>)
              </label>
              <Input
                id="setting-autoclose"
                type="number"
                min="1"
                max="90"
                required
                value={ticketAutoCloseDays}
                onChange={(e) => setTicketAutoCloseDays(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="setting-offer-cap" className="block text-xs font-semibold text-white mb-1">
                Offer Sanity Cap in Rupees (₹)
              </label>
              <Input
                id="setting-offer-cap"
                type="number"
                min="100"
                required
                value={offerSanityMaxRupees}
                onChange={(e) => setOfferSanityMaxRupees(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-midnight-950/70 p-3.5">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={businessHoursOnly}
                onChange={(e) => setBusinessHoursOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-midnight-950"
              />
              <span>
                Calculate Response Time in Business Hours (09:00–21:00 IST) Instead of 24/7 Calendar Time
              </span>
            </label>
          </div>

          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? 'Saving Settings...' : 'Save System Settings'}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
