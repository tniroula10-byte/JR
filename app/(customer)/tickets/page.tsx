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

  const [tickets, settings, selectableAliases] = await Promise.all([
    repo.listTickets(caller),
    repo.getAppSettings(caller),
    repo.getSelectableStaffAliases(caller)
  ]);

  const activeTicket =
    tickets.find((t) => t.id === params.ticketId) ?? tickets[0] ?? null;

  const [messages, events] = activeTicket
    ? await Promise.all([
        repo.listCustomerTicketMessages(caller, activeTicket.id),
        repo.listTicketEvents(caller, activeTicket.id)
      ])
    : [[], []];

  return (
    <CustomerTicketsClient
      tickets={tickets}
      selectedTicket={activeTicket}
      messages={messages}
      events={events}
      customerCanPickEmployee={settings.customerCanPickEmployee}
      selectableAliases={selectableAliases}
    />
  );
}
