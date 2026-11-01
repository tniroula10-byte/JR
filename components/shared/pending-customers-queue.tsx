'use client';

/**
 * Pending Customers Approval Queue (`components/shared/pending-customers-queue.tsx`)
 * Visible to BOKA (Boss) and all Employees (GUZ, NOX, BSTURN, ANKY).
 * Approving or rejecting logs the decision and approver in `audit_log` and sends an email notice.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Mail, UserCheck, XCircle } from 'lucide-react';
import { reviewPendingUserAction } from '@/actions';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { Profile } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function PendingCustomersQueueClient({
  pendingCustomers,
  staffLookup = {}
}: {
  pendingCustomers: Profile[];
  staffLookup?: Record<string, string>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleReview(customer: Profile, decision: 'approve' | 'reject') {
    setBusyId(customer.id);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await reviewPendingUserAction({
        targetUserId: customer.id,
        decision
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to review pending customer.');
      } else {
        setFeedback(
          decision === 'approve'
            ? `Approved ${customer.fullName} (${customer.email}). Active account email sent & logged in audit_log.`
            : `Rejected ${customer.fullName} (${customer.email}). Generic notice sent & logged in audit_log.`
        );
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="p-5 space-y-4 border-amber-500/40 bg-midnight-900/90">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <h2 className="text-base font-bold text-white">Pending Customers Queue</h2>
          <Badge tone={pendingCustomers.length > 0 ? 'amber' : 'emerald'}>
            {pendingCustomers.length} Awaiting Approval
          </Badge>
        </div>
        <span className="text-xs text-slate-400">
          BOKA and any active Employee can approve or reject pending customers
        </span>
      </div>

      {feedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200"
        >
          <Mail className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      ) : null}

      {pendingCustomers.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">
          No customers are currently awaiting first-login approval.
        </p>
      ) : (
        <div className="space-y-2.5">
          {pendingCustomers.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-midnight-950/90 p-3.5"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">{c.fullName}</span>
                  <Badge tone="amber">PENDING APPROVAL</Badge>
                </div>
                <p className="text-xs text-slate-300">
                  {c.email} {c.phone ? `• ${c.phone}` : ''}
                </p>
                <p className="text-[11px] text-slate-400">
                  Invited by:{' '}
                  <span className="text-slate-200">
                    {c.invitedBy ? staffLookup[c.invitedBy] ?? c.invitedBy : 'Self / OTP Verified'}
                  </span>{' '}
                  • Registered {formatIST(c.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="emerald"
                  disabled={busyId === c.id}
                  onClick={() => handleReview(c, 'approve')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Approve</span>
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busyId === c.id}
                  onClick={() => handleReview(c, 'reject')}
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reject</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
