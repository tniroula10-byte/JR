import React from 'react';
import { InviteUserFormClient } from '@/components/shared/invite-user-form';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeInviteCustomerPage() {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();
  const invitations = await repo.listInvitations(caller);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">
          Invite Customer (Employee Desk)
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Employees can invite new customers only (never employees or a boss). Customers invited by an employee start unassigned and are visible to all staff.
        </p>
      </div>
      <InviteUserFormClient
        allowEmployeeInvite={false}
        recentInvitations={invitations}
      />
    </div>
  );
}
