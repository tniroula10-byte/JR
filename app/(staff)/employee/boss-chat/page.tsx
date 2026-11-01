import React from 'react';
import { StaffThreadsClient } from '@/components/chat/staff-threads';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import type { StaffThread } from '@/lib/data/types';

export default async function EmployeeBossChatPage({
  searchParams
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const params = await searchParams;
  const repo = getDataRepository();

  const [threads, groupMessages] = await Promise.all([
    repo.listStaffThreads(caller),
    repo.listStaffThreadMessages(caller, 'sthread-group')
  ]);

  const lastGroupMsg = groupMessages[groupMessages.length - 1];
  const groupThread: StaffThread = {
    id: 'sthread-group',
    employeeId: 'all-staff',
    employeeName: 'JR Family Group Chat',
    employeeAlias: 'BOKA + GUZ + NOX + BSTURN + ANKY',
    lastMessageAt: lastGroupMsg?.createdAt ?? null,
    lastMessagePreview:
      lastGroupMsg?.body ?? 'Group chat between BOKA, GUZ, NOX, BSTURN & ANKY',
    createdAt: threads[0]?.createdAt ?? new Date().toISOString()
  };

  const allThreads = [groupThread, ...threads];

  const selected =
    allThreads.find((t) => t.id === params.threadId) ?? groupThread;

  const messages =
    selected.id === 'sthread-group'
      ? groupMessages
      : await repo.listStaffThreadMessages(caller, selected.id);

  return (
    <StaffThreadsClient
      basePath="/employee/boss-chat"
      callerId={caller.userId}
      callerRole={caller.role}
      threads={allThreads}
      selectedThread={selected}
      messages={messages}
    />
  );
}
