import React from 'react';
import { CustomerTicketsClient } from '@/components/tickets/customer-tickets';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerTicketsPage({
  searchParams
}: {
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const params = await searchParams;
  const repo = getDataRepository();

  const [tickets, selectableAliases] = await Promise.all([
    repo.listTickets(caller),
    repo.listReportableStaffAliases(caller)
  ]);

  const activeTicket =
    tickets.find((t) => t.id === params.ticketId) ?? tickets[0] ?? null;

  const [messages, events, complaintRoom, complaintMessages] = activeTicket
    ? await Promise.all([
        repo.listCustomerTicketMessages(caller, activeTicket.id),
        repo.listTicketEvents(caller, activeTicket.id),
        repo.getComplaintChatRoomByTicket(caller, activeTicket.id),
        repo.listComplaintChatMessages(caller, activeTicket.id)
      ])
    : [[], [], null, []];

  return (
    <CustomerTicketsClient
      tickets={tickets}
      selectedTicket={activeTicket}
      messages={messages}
      events={events}
      complaintRoom={complaintRoom}
      complaintMessages={complaintMessages}
      customerCanPickEmployee={true}
      selectableAliases={selectableAliases}
    />
  );
}
