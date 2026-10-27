/**
 * Support Ticket Status Machine (`lib/tickets/state-machine.ts`)
 * Section 8: Enforced inside `transition_ticket` — illegal transitions raise an error.
 *
 * Allowed transitions:
 * - open -> assigned (on assignment)
 * - assigned -> in_progress (assignee starts work or replies)
 * - in_progress -> waiting_for_customer (staff asks the customer something)
 * - waiting_for_customer -> in_progress (customer replies)
 * - in_progress -> resolved (assignee or boss)
 * - waiting_for_customer -> resolved (assignee or boss)
 * - resolved -> closed (customer confirms, or automatic after configured days via scheduled job)
 * - resolved -> in_progress (customer replies or staff reopens; increments reopen_count and logs a reopened event)
 * - closed is final. Customers raise a new ticket instead.
 */

import type { TicketStatus, UserRole } from '@/lib/data/types';

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['waiting_for_customer', 'resolved'],
  waiting_for_customer: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: []
};

export function isValidTicketTransition(
  fromStatus: TicketStatus,
  toStatus: TicketStatus
): boolean {
  if (fromStatus === toStatus) return false;
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}

export function validateTicketTransition(params: {
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  actorRole: UserRole | 'system_cron';
  actorId: string;
  ticketCustomerId: string;
  assignedEmployeeId: string | null;
}): { valid: true; incrementsReopenCount: boolean } {
  const { fromStatus, toStatus, actorRole, actorId, ticketCustomerId, assignedEmployeeId } = params;

  if (fromStatus === 'closed') {
    throw new Error('INVALID_TICKET_TRANSITION: Ticket is already closed and final.');
  }

  if (!isValidTicketTransition(fromStatus, toStatus)) {
    throw new Error(
      `INVALID_TICKET_TRANSITION: Cannot transition ticket from "${fromStatus}" to "${toStatus}".`
    );
  }

  if (actorRole === 'customer') {
    if (actorId !== ticketCustomerId) {
      throw new Error('FORBIDDEN: Customers can only transition their own tickets.');
    }
    const customerAllowed =
      (fromStatus === 'waiting_for_customer' && toStatus === 'in_progress') ||
      (fromStatus === 'resolved' && (toStatus === 'closed' || toStatus === 'in_progress'));
    if (!customerAllowed) {
      throw new Error(
        `FORBIDDEN: Customer cannot transition ticket from "${fromStatus}" to "${toStatus}".`
      );
    }
  } else if (actorRole === 'employee') {
    if (!assignedEmployeeId || assignedEmployeeId !== actorId) {
      throw new Error(
        'FORBIDDEN: Only the assigned employee or the Boss can reply or change status on this ticket.'
      );
    }
    if (fromStatus === 'open' && toStatus === 'assigned') {
      throw new Error('FORBIDDEN: Only the Boss can assign an open ticket.');
    }
  } else if (actorRole === 'system_cron') {
    if (!(fromStatus === 'resolved' && toStatus === 'closed')) {
      throw new Error('INVALID_TICKET_TRANSITION: Cron job can only transition resolved -> closed.');
    }
  }

  const incrementsReopenCount = fromStatus === 'resolved' && toStatus === 'in_progress';
  return { valid: true, incrementsReopenCount };
}

export function getAllowedNextStatuses(
  currentStatus: TicketStatus,
  actorRole: UserRole,
  isAssignedEmployee: boolean
): TicketStatus[] {
  const candidates = ALLOWED_TRANSITIONS[currentStatus];
  return candidates.filter((next) => {
    if (actorRole === 'boss') return true;
    if (actorRole === 'employee') {
      if (!isAssignedEmployee) return false;
      if (currentStatus === 'open' && next === 'assigned') return false;
      return true;
    }
    if (actorRole === 'customer') {
      return (
        (currentStatus === 'waiting_for_customer' && next === 'in_progress') ||
        (currentStatus === 'resolved' && (next === 'closed' || next === 'in_progress'))
      );
    }
    return false;
  });
}
