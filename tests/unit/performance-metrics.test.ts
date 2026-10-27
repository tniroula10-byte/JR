import { describe, expect, it } from 'vitest';
import {
  calculateEmployeeMetrics,
  computeAverage,
  computePercentileCont
} from '@/lib/analytics/metrics';
import type {
  ActivityEvent,
  EmployeeWithFlags,
  Ticket,
  TicketEvent
} from '@/lib/data/types';

describe('Performance Analytics Engine with Fixed Hand-Calculated Fixtures (Section 9)', () => {
  it('computes exact Average, Median (P50), and P90 values', () => {
    const sample = [100, 200, 300, 400, 1000];
    expect(computeAverage(sample)).toBe(400);
    expect(computePercentileCont(sample, 0.5)).toBe(300);
    // P90 of [100, 200, 300, 400, 1000]: pos = 0.9 * 4 = 3.6 -> 400 + 0.6*(1000-400) = 760
    expect(computePercentileCont(sample, 0.9)).toBe(760);
  });

  it('matches hand-calculated fixture metrics for an employee', () => {
    const employees: EmployeeWithFlags[] = [
      {
        id: 'emp-fixture',
        role: 'employee',
        status: 'active',
        fullName: 'Vikram Fixture',
        email: 'vikram@johnrambo.in',
        phone: '+919800000011',
        avatarPath: null,
        invitedBy: 'boss-1',
        createdAt: '2026-10-01T00:00:00Z',
        lastSeenAt: null,
        staffProfile: {
          userId: 'emp-fixture',
          publicAlias: 'Maverick',
          customerSelectable: true,
          acceptsTickets: true,
          canManageProducts: false,
          canPublishStories: false,
          canPostCustomerAnnouncements: false,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z'
        }
      }
    ];

    const activityEvents: ActivityEvent[] = [
      {
        id: 'ev-1',
        occurredAt: '2026-10-27T10:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'staff_chat_reply',
        customerId: 'cust-1',
        conversationId: 'conv-1',
        ticketId: null,
        offerId: null,
        messageId: 'm-1',
        meta: { is_first_response: true, first_response_seconds: 120 }
      },
      {
        id: 'ev-2',
        occurredAt: '2026-10-27T11:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'staff_chat_reply',
        customerId: 'cust-2',
        conversationId: 'conv-2',
        ticketId: null,
        offerId: null,
        messageId: 'm-2',
        meta: { is_first_response: true, first_response_seconds: 240 }
      },
      {
        id: 'ev-3',
        occurredAt: '2026-10-27T12:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'staff_ticket_reply',
        customerId: 'cust-1',
        conversationId: null,
        ticketId: 't-1',
        offerId: null,
        messageId: 'tm-1',
        meta: { is_first_response: true, first_response_seconds: 600 }
      },
      {
        id: 'ev-4',
        occurredAt: '2026-10-27T13:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'ticket_resolved',
        customerId: 'cust-1',
        conversationId: null,
        ticketId: 't-1',
        offerId: null,
        messageId: null,
        meta: { credited_employee_id: 'emp-fixture', resolution_seconds: 3600 }
      },
      {
        id: 'ev-5',
        occurredAt: '2026-10-27T14:00:00Z',
        actorId: 'cust-1',
        actorRole: 'customer',
        eventType: 'ticket_reopened',
        customerId: 'cust-1',
        conversationId: null,
        ticketId: 't-1',
        offerId: null,
        messageId: null,
        meta: { last_resolved_by: 'emp-fixture' }
      },
      {
        id: 'ev-6',
        occurredAt: '2026-10-27T15:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'offer_accepted',
        customerId: 'cust-1',
        conversationId: 'conv-1',
        ticketId: null,
        offerId: 'o-1',
        messageId: null,
        meta: {}
      },
      {
        id: 'ev-7',
        occurredAt: '2026-10-27T16:00:00Z',
        actorId: 'emp-fixture',
        actorRole: 'employee',
        eventType: 'offer_countered',
        customerId: 'cust-2',
        conversationId: 'conv-2',
        ticketId: null,
        offerId: 'o-2',
        messageId: null,
        meta: {}
      }
    ];

    const ticketEvents: TicketEvent[] = [
      {
        id: 'te-1',
        ticketId: 't-1',
        actorId: 'boss-1',
        actorDisplayName: 'Boss',
        event: 'assigned',
        fromValue: null,
        toValue: 'emp-fixture',
        createdAt: '2026-10-27T11:50:00Z'
      }
    ];

    const tickets: Ticket[] = [
      {
        id: 't-1',
        ticketNo: 1001,
        customerId: 'cust-1',
        subject: 'Fixture ticket',
        description: 'Fixture description',
        category: 'general',
        priority: 'normal',
        status: 'in_progress',
        assignedEmployeeId: 'emp-fixture',
        requestedEmployeeId: null,
        reopenCount: 1,
        createdAt: '2026-10-27T11:50:00Z',
        firstResponseAt: '2026-10-27T12:00:00Z',
        resolvedAt: null,
        closedAt: null
      }
    ];

    const [result] = calculateEmployeeMetrics({
      employees,
      activityEvents,
      ticketEvents,
      tickets
    });

    expect(result).toBeDefined();
    expect(result!.chatMessagesSent).toBe(2);
    expect(result!.ticketRepliesSent).toBe(1);
    expect(result!.chatFirstResponseAvgSec).toBe(180);
    expect(result!.chatFirstResponseMedianSec).toBe(180);
    expect(result!.chatFirstResponseP90Sec).toBe(228);
    expect(result!.ticketFirstResponseAvgSec).toBe(600);
    expect(result!.ticketResolutionAvgSec).toBe(3600);
    expect(result!.ticketsAssigned).toBe(1);
    expect(result!.ticketsResolved).toBe(1);
    expect(result!.ticketsPending).toBe(1);
    expect(result!.ticketsReopened).toBe(1);
    expect(result!.offersHandledTotal).toBe(2);
    expect(result!.offersAccepted).toBe(1);
    expect(result!.offersCountered).toBe(1);
    expect(result!.offersRejected).toBe(0);
    expect(result!.conversationsHandled).toBe(2);
  });
});
