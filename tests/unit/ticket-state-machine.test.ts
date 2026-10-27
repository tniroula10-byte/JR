import { describe, expect, it } from 'vitest';
import {
  getAllowedNextStatuses,
  isValidTicketTransition,
  validateTicketTransition
} from '@/lib/tickets/state-machine';

describe('Support Ticket Status Machine (Section 8)', () => {
  it('permits all legal transitions in the specification', () => {
    expect(isValidTicketTransition('open', 'assigned')).toBe(true);
    expect(isValidTicketTransition('assigned', 'in_progress')).toBe(true);
    expect(isValidTicketTransition('in_progress', 'waiting_for_customer')).toBe(true);
    expect(isValidTicketTransition('waiting_for_customer', 'in_progress')).toBe(true);
    expect(isValidTicketTransition('in_progress', 'resolved')).toBe(true);
    expect(isValidTicketTransition('waiting_for_customer', 'resolved')).toBe(true);
    expect(isValidTicketTransition('resolved', 'closed')).toBe(true);
    expect(isValidTicketTransition('resolved', 'in_progress')).toBe(true);
  });

  it('rejects illegal transitions and transitions out of closed', () => {
    expect(isValidTicketTransition('open', 'resolved')).toBe(false);
    expect(isValidTicketTransition('open', 'closed')).toBe(false);
    expect(isValidTicketTransition('assigned', 'closed')).toBe(false);
    expect(isValidTicketTransition('closed', 'in_progress')).toBe(false);
    expect(isValidTicketTransition('closed', 'open')).toBe(false);

    expect(() =>
      validateTicketTransition({
        fromStatus: 'closed',
        toStatus: 'in_progress',
        actorRole: 'boss',
        actorId: 'boss-1',
        ticketCustomerId: 'cust-1',
        assignedEmployeeId: 'emp-1'
      })
    ).toThrow(/INVALID_TICKET_TRANSITION/);
  });

  it('blocks non-assigned employees from transitioning a ticket', () => {
    expect(() =>
      validateTicketTransition({
        fromStatus: 'in_progress',
        toStatus: 'resolved',
        actorRole: 'employee',
        actorId: 'emp-3', // Not the assigned employee
        ticketCustomerId: 'cust-1',
        assignedEmployeeId: 'emp-1'
      })
    ).toThrow(/FORBIDDEN/);
  });

  it('increments reopen_count when transitioning resolved -> in_progress', () => {
    const res = validateTicketTransition({
      fromStatus: 'resolved',
      toStatus: 'in_progress',
      actorRole: 'customer',
      actorId: 'cust-1',
      ticketCustomerId: 'cust-1',
      assignedEmployeeId: 'emp-1'
    });
    expect(res.valid).toBe(true);
    expect(res.incrementsReopenCount).toBe(true);
  });

  it('returns correct allowed next statuses per role', () => {
    expect(getAllowedNextStatuses('in_progress', 'employee', false)).toEqual([]);
    expect(getAllowedNextStatuses('in_progress', 'employee', true)).toEqual([
      'waiting_for_customer',
      'resolved'
    ]);
    expect(getAllowedNextStatuses('resolved', 'customer', false)).toEqual([
      'closed',
      'in_progress'
    ]);
  });
});
