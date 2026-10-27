import React from 'react';
import { StaffThreadsClient } from '@/components/chat/staff-threads';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossInternalThreadsPage({
  searchParams
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const params = await searchParams;
  const repo = getDataRepository();
  const threads = await repo.listStaffThreads(caller);

  const selected =
    threads.find((t) => t.id === params.threadId) ?? threads[0] ?? null;

  const messages = selected
    ? await repo.listStaffThreadMessages(caller, selected.id)
    : [];

  return (
    <StaffThreadsClient
      basePath="/boss/threads"
      callerId={caller.userId}
      callerRole="boss"
      threads={threads}
      selectedThread={selected}
      messages={messages}
    />
  );
}
