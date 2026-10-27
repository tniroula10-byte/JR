import React from 'react';
import { StaffTicketsClient } from '@/components/tickets/staff-tickets';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeTicketsPage({
  searchParams
}: {
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const params = await searchParams;
  const repo = getDataRepository();

  const [tickets, employees] = await Promise.all([
    repo.listTickets(caller),
    repo.listEmployeesWithFlags(caller)
  ]);

  const selected =
    tickets.find((t) => t.id === params.ticketId) ??
    tickets.find((t) => t.assignedEmployeeId === caller.userId) ??
    tickets[0] ??
    null;

  const [messages, events] = selected
    ? await Promise.all([
        repo.listStaffTicketMessages(caller, selected.id),
        repo.listTicketEvents(caller, selected.id)
      ])
    : [[], []];

  return (
    <StaffTicketsClient
      basePath="/employee/tickets"
      callerId={caller.userId}
      callerRole={caller.role}
      tickets={tickets}
      selectedTicket={selected}
      messages={messages}
      events={events}
      employees={employees}
    />
  );
}
