'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, CheckCircle, Users } from 'lucide-react';
import { setUserStatusAction } from '@/actions';
import { InviteUserFormClient } from '@/components/shared/invite-user-form';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { Invitation, Profile } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function BossCustomersClient({
  customers,
  invitations,
  staffLookup
}: {
  customers: Profile[];
  invitations: Invitation[];
  staffLookup: Record<string, string>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleStatusToggle(customer: Profile) {
    setBusyId(customer.id);
    setFeedback(null);
    const nextStatus = customer.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await setUserStatusAction(customer.id, nextStatus);
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to change customer status.');
      } else {
        setFeedback(
          `Customer ${customer.fullName} is now ${nextStatus.toUpperCase()}. Recorded in audit_log.`
        );
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Users className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Customer Management ({customers.length} Accounts)</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Invite new customers or employees, inspect who invited each customer, and suspend or reactivate accounts.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-200">
          {feedback}
        </div>
      ) : null}

      <InviteUserFormClient
        allowEmployeeInvite={true}
        recentInvitations={invitations}
      />

      <Card className="p-5 space-y-4">
        <h2 className="text-base font-bold text-white">All Customer Accounts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4">Customer</th>
                <th className="py-2.5 px-3">Email & Phone</th>
                <th className="py-2.5 px-3">Invited By</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Joined</th>
                <th className="py-2.5 pl-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {customers.map((c) => (
                <tr key={c.id} className="text-slate-200">
                  <td className="py-3 pr-4 font-bold text-white">{c.fullName}</td>
                  <td className="py-3 px-3">
                    <div>{c.email}</div>
                    <div className="font-mono text-[11px] text-slate-400">{c.phone ?? '—'}</div>
                  </td>
                  <td className="py-3 px-3 text-violet-300">
                    {c.invitedBy ? staffLookup[c.invitedBy] ?? c.invitedBy : 'Direct Seed'}
                  </td>
                  <td className="py-3 px-3">
                    <Badge
                      tone={c.status === 'active' ? 'emerald' : 'rose'}
                      className="uppercase"
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                    {formatIST(c.createdAt)}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <Button
                      size="sm"
                      variant={c.status === 'active' ? 'danger' : 'emerald'}
                      disabled={busyId === c.id}
                      onClick={() => handleStatusToggle(c)}
                    >
                      {c.status === 'active' ? (
                        <>
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Suspend</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Activate</span>
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
