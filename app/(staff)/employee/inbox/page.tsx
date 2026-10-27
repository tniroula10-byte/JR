import React from 'react';
import { StaffInboxClient } from '@/components/chat/staff-inbox';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeInboxPage({
  searchParams
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const params = await searchParams;
  const repo = getDataRepository();

  const [settings, conversations, employees] = await Promise.all([
    repo.getAppSettings(caller),
    repo.listConversations(caller),
    repo.listEmployeesWithFlags(caller)
  ]);

  const selected =
    conversations.find((c) => c.id === params.conversationId) ??
    conversations[0] ??
    null;

  const messages = selected
    ? await repo.listStaffMessages(caller, selected.id)
    : [];

  return (
    <StaffInboxClient
      basePath="/employee/inbox"
      isBoss={caller.role === 'boss'}
      inboxScope={settings.employeeInboxScope}
      conversations={conversations}
      selectedConversation={selected}
      initialMessages={messages}
      employees={employees}
    />
  );
}
