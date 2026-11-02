'use client';

/**
 * Boss Employee Management (`components/shared/boss-employees-client.tsx`)
 * Decision 7 & Decision 10:
 * Configure per-employee `public_alias`, `customer_selectable`, `accepts_tickets`,
 * `can_manage_products`, `can_publish_stories`, `can_post_customer_announcements`,
 * and account activation/suspension.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, UserCheck, Ban, CheckCircle, XCircle } from 'lucide-react';
import { reviewPendingUserAction, setUserStatusAction, updateStaffFlagsAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { EmployeeWithFlags } from '@/lib/data/types';

export function BossEmployeesClient({
  employees
}: {
  employees: EmployeeWithFlags[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        publicAlias: string;
        customerSelectable: boolean;
        acceptsTickets: boolean;
        canManageProducts: boolean;
        canPublishStories: boolean;
        canPostCustomerAnnouncements: boolean;
      }
    >
  >(() => {
    const map: Record<string, {
      publicAlias: string;
      customerSelectable: boolean;
      acceptsTickets: boolean;
      canManageProducts: boolean;
      canPublishStories: boolean;
      canPostCustomerAnnouncements: boolean;
    }> = {};
    for (const emp of employees) {
      map[emp.id] = {
        publicAlias: emp.staffProfile.publicAlias,
        customerSelectable: emp.staffProfile.customerSelectable,
        acceptsTickets: emp.staffProfile.acceptsTickets,
        canManageProducts: emp.staffProfile.canManageProducts,
        canPublishStories: emp.staffProfile.canPublishStories,
        canPostCustomerAnnouncements: emp.staffProfile.canPostCustomerAnnouncements
      };
    }
    return map;
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSaveFlags(empId: string) {
    const d = drafts[empId];
    if (!d) return;
    setBusyId(empId);
    setFeedback(null);
    try {
      const res = await updateStaffFlagsAction({
        employeeId: empId,
        ...d
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to update employee permissions.');
      } else {
        setFeedback(`Updated permissions & alias for ${res.data?.fullName}. Logged in audit_log.`);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleStatus(emp: EmployeeWithFlags) {
    setBusyId(emp.id);
    setFeedback(null);
    const nextStatus = emp.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await setUserStatusAction(emp.id, nextStatus);
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to change employee status.');
      } else {
        setFeedback(`${emp.fullName} status changed to ${nextStatus.toUpperCase()}.`);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleReviewPendingEmployee(
    emp: EmployeeWithFlags,
    decision: 'approve' | 'reject'
  ) {
    setBusyId(emp.id);
    setFeedback(null);
    try {
      const res = await reviewPendingUserAction({
        targetUserId: emp.id,
        decision
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to review pending employee.');
      } else {
        setFeedback(
          decision === 'approve'
            ? `Employee ${emp.fullName} approved by BOKA and set to ACTIVE. Logged in audit_log.`
            : `Employee ${emp.fullName} rejected by BOKA. Logged in audit_log.`
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
          <UserCheck className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          <span>Employee Management & Permission Flags ({employees.length} Staff)</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Configure public aliases (shown to customers only when ticket selection is enabled) and granular permission flags.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map((emp) => {
          const d = drafts[emp.id] ?? emp.staffProfile;
          return (
            <Card key={emp.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">{emp.fullName}</h2>
                    <Badge
                      tone={
                        emp.status === 'active'
                          ? 'emerald'
                          : emp.status === 'pending_approval'
                            ? 'amber'
                            : 'rose'
                      }
                      className="uppercase"
                    >
                      {emp.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{emp.email} • {emp.phone}</p>
                </div>

                {emp.status === 'pending_approval' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="emerald"
                      disabled={busyId === emp.id}
                      onClick={() => handleReviewPendingEmployee(emp, 'approve')}
                    >
                      <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Approve (BOKA)</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === emp.id}
                      onClick={() => handleReviewPendingEmployee(emp, 'reject')}
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reject</span>
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant={emp.status === 'active' ? 'danger' : 'emerald'}
                    disabled={busyId === emp.id}
                    onClick={() => handleToggleStatus(emp)}
                  >
                    {emp.status === 'active' ? (
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
                )}
              </div>

              <div>
                <label
                  htmlFor={`alias-${emp.id}`}
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Boss-Defined Public Alias (Customer Ticket Picker)
                </label>
                <Input
                  id={`alias-${emp.id}`}
                  value={d.publicAlias}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [emp.id]: { ...d, publicAlias: e.target.value }
                    }))
                  }
                />
              </div>

              <div className="space-y-2 text-xs text-slate-200">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.customerSelectable}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [emp.id]: { ...d, customerSelectable: e.target.checked }
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-midnight-950 text-violet-600"
                  />
                  <span>Customer Selectable for Tickets</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.acceptsTickets}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [emp.id]: { ...d, acceptsTickets: e.target.checked }
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-midnight-950 text-violet-600"
                  />
                  <span>Accepts Ticket Assignments</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.canManageProducts}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [emp.id]: { ...d, canManageProducts: e.target.checked }
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-midnight-950 text-violet-600"
                  />
                  <span>Can Manage Products</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.canPublishStories}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [emp.id]: { ...d, canPublishStories: e.target.checked }
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-midnight-950 text-violet-600"
                  />
                  <span>Can Publish 24h Stories</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.canPostCustomerAnnouncements}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [emp.id]: { ...d, canPostCustomerAnnouncements: e.target.checked }
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-midnight-950 text-violet-600"
                  />
                  <span>Can Post Customer Announcements</span>
                </label>
              </div>

              <Button
                size="sm"
                disabled={busyId === emp.id}
                onClick={() => handleSaveFlags(emp.id)}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save Alias & Flags</span>
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
