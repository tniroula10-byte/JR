import React from 'react';
import { StaffTicketsClient } from '@/components/tickets/staff-tickets';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossAllTicketsPage({
  searchParams
}: {
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const params = await searchParams;
  const repo = getDataRepository();

  const [tickets, employees] = await Promise.all([
    repo.listTickets(caller),
    repo.listEmployeesWithFlags(caller)
  ]);

  const selected =
    tickets.find((t) => t.id === params.ticketId) ?? tickets[0] ?? null;

  const [messages, events, complaintRoom] = selected
    ? await Promise.all([
        repo.listStaffTicketMessages(caller, selected.id),
        repo.listTicketEvents(caller, selected.id),
        repo.getComplaintChatRoomByTicket(caller, selected.id)
      ])
    : [[], [], null];

  const complaintMessages =
    selected && complaintRoom
      ? await repo.listComplaintChatMessages(caller, selected.id)
      : [];

  return (
    <StaffTicketsClient
      basePath="/boss/tickets"
      callerId={caller.userId}
      callerRole="boss"
      tickets={tickets}
      selectedTicket={selected}
      messages={messages}
      events={events}
      complaintRoom={complaintRoom}
      complaintMessages={complaintMessages}
      employees={employees}
    />
  );
}
