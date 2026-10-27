import React from 'react';
import { StaffThreadsClient } from '@/components/chat/staff-threads';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeBossChatPage({
  searchParams
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const params = await searchParams;
  const repo = getDataRepository();
  const threads = await repo.listStaffThreads(caller);

  const selected =
    threads.find((t) => t.id === params.threadId) ??
    threads.find((t) => t.employeeId === caller.userId) ??
    threads[0] ??
    null;

  const messages = selected
    ? await repo.listStaffThreadMessages(caller, selected.id)
    : [];

  return (
    <StaffThreadsClient
      basePath="/employee/boss-chat"
      callerId={caller.userId}
      callerRole={caller.role}
      threads={threads}
      selectedThread={selected}
      messages={messages}
    />
  );
}
