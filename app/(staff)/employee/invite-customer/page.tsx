import React from 'react';
import { InviteUserFormClient } from '@/components/shared/invite-user-form';
import { PendingCustomersQueueClient } from '@/components/shared/pending-customers-queue';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeInviteCustomerPage() {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();
  const [invitations, pendingCustomers] = await Promise.all([
    repo.listInvitations(caller),
    repo.listPendingCustomers(caller)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">
          Customers & Pending Approvals (Employee Desk)
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Approve or reject pending customers before their first login, and invite new customers. Employee approval remains BOKA-only.
        </p>
      </div>
      <PendingCustomersQueueClient pendingCustomers={pendingCustomers} />
      <InviteUserFormClient
        allowEmployeeInvite={false}
        recentInvitations={invitations}
      />
    </div>
  );
}
