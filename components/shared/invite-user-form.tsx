'use client';

/**
 * Shared Invitation Form (`components/shared/invite-user-form.tsx`)
 * Decision 3:
 * - Boss can invite customers and employees.
 * - Employees can invite customers only (never employees or a boss).
 * - Every invite goes through one server-side function (`inviteUserAction`) that checks
 *   caller role, records `invited_by`, `invitations` row, `audit_log` entry, and sends magic link.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { inviteUserAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { Invitation } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function InviteUserFormClient({
  allowEmployeeInvite,
  recentInvitations
}: {
  allowEmployeeInvite: boolean;
  recentInvitations: Invitation[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+919811100099');
  const [intendedRole, setIntendedRole] = useState<'customer' | 'employee'>('customer');
  const [publicAlias, setPublicAlias] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await inviteUserAction({
        email,
        fullName,
        phone,
        intendedRole: allowEmployeeInvite ? intendedRole : 'customer',
        publicAlias: intendedRole === 'employee' ? publicAlias : undefined
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to send invitation.');
      } else {
        setSuccessMsg(
          `Invitation dispatched to ${email} (${
            allowEmployeeInvite ? intendedRole : 'customer'
          }). Recorded in invitations, activity_events, and audit_log.`
        );
        setEmail('');
        setFullName('');
        setPublicAlias('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-violet-400" aria-hidden="true" />
            <span>
              {allowEmployeeInvite
                ? 'Send Magic-Link Invitation (Customer or Employee)'
                : 'Invite New Customer to John Rambo'}
            </span>
          </h2>
          <Badge tone="violet">
            {allowEmployeeInvite ? 'Boss Authority' : 'Customer Invite Only'}
          </Badge>
        </div>

        {errorMsg ? (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="inv-name" className="block text-xs font-medium text-slate-300 mb-1">
              Full Name
            </label>
            <Input
              id="inv-name"
              required
              placeholder="e.g. Rohan Malhotra"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="inv-email" className="block text-xs font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <Input
              id="inv-email"
              type="email"
              required
              placeholder="trader@gamer.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="inv-phone" className="block text-xs font-medium text-slate-300 mb-1">
              Phone (E.164 Format)
            </label>
            <Input
              id="inv-phone"
              placeholder="+919811100099"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {allowEmployeeInvite ? (
            <div>
              <label htmlFor="inv-role" className="block text-xs font-medium text-slate-300 mb-1">
                Intended Role
              </label>
              <select
                id="inv-role"
                value={intendedRole}
                onChange={(e) => setIntendedRole(e.target.value as 'customer' | 'employee')}
                className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
              >
                <option value="customer">Customer</option>
                <option value="employee">Employee (Staff Specialist)</option>
              </select>
            </div>
          ) : null}

          {allowEmployeeInvite && intendedRole === 'employee' ? (
            <div className="sm:col-span-2">
              <label htmlFor="inv-alias" className="block text-xs font-medium text-violet-300 mb-1">
                Staff Public Alias (Shown when customer selection is enabled)
              </label>
              <Input
                id="inv-alias"
                placeholder="e.g. Sentinel"
                value={publicAlias}
                onChange={(e) => setPublicAlias(e.target.value)}
              />
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>{submitting ? 'Dispatching Invite...' : 'Send Magic-Link Invite'}</span>
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">
          Invitation Ledger ({recentInvitations.length})
        </h3>
        <div className="space-y-2">
          {recentInvitations.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-midnight-950/70 p-3 text-xs"
            >
              <div>
                <p className="font-bold text-white">
                  {inv.fullName} ({inv.email})
                </p>
                <p className="text-slate-400">
                  Invited by: {inv.invitedByName ?? inv.invitedBy} • {formatIST(inv.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={inv.intendedRole === 'employee' ? 'cyan' : 'violet'} className="uppercase">
                  {inv.intendedRole}
                </Badge>
                <Badge tone={inv.status === 'accepted' ? 'emerald' : 'amber'} className="uppercase">
                  {inv.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
