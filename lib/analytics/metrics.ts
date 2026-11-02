/**
 * Staff Performance Calculation Engine (`lib/analytics/metrics.ts`)
 * Section 9: Computes all employee performance figures from `activity_events`, `ticket_events`,
 * and live ticket states. Reports Average, Median (P50), and 90th Percentile (P90).
 */

import type {
  ActivityEvent,
  EmployeePerformanceMetrics,
  EmployeeWithFlags,
  PerformanceQueryFilter,
  Ticket,
  TicketEvent
} from '@/lib/data/types';

export function computeAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Computes continuous percentile (`PERCENTILE_CONT`) matching PostgreSQL's linear interpolation.
 */
export function computePercentileCont(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] ?? null;

  const pos = percentile * (sorted.length - 1);
  const lowerIdx = Math.floor(pos);
  const upperIdx = Math.ceil(pos);
  const lowerVal = sorted[lowerIdx] ?? 0;
  const upperVal = sorted[upperIdx] ?? lowerVal;

  if (lowerIdx === upperIdx) return Math.round(lowerVal * 10) / 10;
  const weight = pos - lowerIdx;
  return Math.round((lowerVal + weight * (upperVal - lowerVal)) * 10) / 10;
}

export function calculateEmployeeMetrics(params: {
  employees: EmployeeWithFlags[];
  activityEvents: ActivityEvent[];
  ticketEvents: TicketEvent[];
  tickets: Ticket[];
  filter?: PerformanceQueryFilter;
}): EmployeePerformanceMetrics[] {
  const { employees, activityEvents, ticketEvents, tickets, filter } = params;

  const startMs = filter?.startDateIso ? new Date(filter.startDateIso).getTime() : null;
  const endMs = filter?.endDateIso ? new Date(filter.endDateIso).getTime() : null;

  const inRange = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    if (startMs !== null && !Number.isNaN(startMs) && t < startMs) return false;
    if (endMs !== null && !Number.isNaN(endMs) && t > endMs) return false;
    return true;
  };

  const targetEmployees = filter?.employeeId
    ? employees.filter((e) => e.id === filter.employeeId)
    : employees;

  const rangedActivity = activityEvents.filter((ev) => inRange(ev.occurredAt));
  const rangedTicketEvents = ticketEvents.filter((ev) => inRange(ev.createdAt));

  return targetEmployees.map((emp) => {
    const empId = emp.id;
    const empEvents = rangedActivity.filter((ev) => ev.actorId === empId);

    const chatReplies = empEvents.filter((ev) => ev.eventType === 'staff_chat_reply');
    const ticketReplies = empEvents.filter((ev) => ev.eventType === 'staff_ticket_reply');

    const chatFirstResponseSecs = chatReplies
      .filter((ev) => ev.meta.is_first_response === true && typeof ev.meta.first_response_seconds === 'number')
      .map((ev) => Number(ev.meta.first_response_seconds));

    const ticketFirstResponseSecs = ticketReplies
      .filter((ev) => ev.meta.is_first_response === true && typeof ev.meta.first_response_seconds === 'number')
      .map((ev) => Number(ev.meta.first_response_seconds));

    const resolutionEvents = rangedActivity.filter(
      (ev) =>
        ev.eventType === 'ticket_resolved' &&
        (ev.meta.credited_employee_id === empId || ev.actorId === empId)
    );

    const resolutionSecs = resolutionEvents
      .filter((ev) => typeof ev.meta.resolution_seconds === 'number')
      .map((ev) => Number(ev.meta.resolution_seconds));

    const ticketsAssigned = rangedTicketEvents.filter(
      (te) => (te.event === 'assigned' || te.event === 'reassigned') && te.toValue === empId
    ).length;

    const ticketsResolved = resolutionEvents.length;

    const ticketsPending = tickets.filter(
      (t) =>
        t.assignedEmployeeId === empId &&
        ['open', 'assigned', 'in_progress', 'waiting_for_customer'].includes(t.status)
    ).length;

    const ticketsReopened = rangedActivity.filter(
      (ev) => ev.eventType === 'ticket_reopened' && ev.meta.last_resolved_by === empId
    ).length;

    const offerEventsForEmp = empEvents.filter((ev) =>
      ['offer_countered', 'offer_accepted', 'offer_rejected'].includes(ev.eventType)
    );

    const distinctOfferIds = new Set(
      offerEventsForEmp.map((ev) => ev.offerId).filter((id): id is string => Boolean(id))
    );

    const offersCountered = new Set(
      offerEventsForEmp
        .filter((ev) => ev.eventType === 'offer_countered')
        .map((ev) => ev.offerId)
        .filter(Boolean)
    ).size;

    const offersAccepted = new Set(
      offerEventsForEmp
        .filter((ev) => ev.eventType === 'offer_accepted')
        .map((ev) => ev.offerId)
        .filter(Boolean)
    ).size;

    const offersRejected = new Set(
      offerEventsForEmp
        .filter((ev) => ev.eventType === 'offer_rejected')
        .map((ev) => ev.offerId)
        .filter(Boolean)
    ).size;

    const distinctConversationIds = new Set(
      chatReplies.map((ev) => ev.conversationId).filter((id): id is string => Boolean(id))
    );

    return {
      employeeId: empId,
      employeeName: emp.fullName,
      publicAlias: emp.staffProfile.publicAlias,
      chatMessagesSent: chatReplies.length,
      ticketRepliesSent: ticketReplies.length,
      chatFirstResponseAvgSec: computeAverage(chatFirstResponseSecs),
      chatFirstResponseMedianSec: computePercentileCont(chatFirstResponseSecs, 0.5),
      chatFirstResponseP90Sec: computePercentileCont(chatFirstResponseSecs, 0.9),
      ticketFirstResponseAvgSec: computeAverage(ticketFirstResponseSecs),
      ticketFirstResponseMedianSec: computePercentileCont(ticketFirstResponseSecs, 0.5),
      ticketFirstResponseP90Sec: computePercentileCont(ticketFirstResponseSecs, 0.9),
      ticketResolutionAvgSec: computeAverage(resolutionSecs),
      ticketResolutionMedianSec: computePercentileCont(resolutionSecs, 0.5),
      ticketsAssigned,
      ticketsResolved,
      ticketsPending,
      ticketsReopened,
      offersHandledTotal: distinctOfferIds.size,
      offersAccepted,
      offersCountered,
      offersRejected,
      conversationsHandled: distinctConversationIds.size
    };
  });
}

const PERFORMANCE_CSV_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Public Alias',
  'Chat Messages Sent',
  'Ticket Replies Sent',
  'Chat First Response Avg (s)',
  'Chat First Response Median (s)',
  'Chat First Response P90 (s)',
  'Ticket First Response Avg (s)',
  'Ticket First Response Median (s)',
  'Ticket First Response P90 (s)',
  'Ticket Resolution Avg (s)',
  'Ticket Resolution Median (s)',
  'Tickets Assigned',
  'Tickets Resolved',
  'Tickets Pending',
  'Tickets Reopened',
  'Offers Handled Total',
  'Offers Accepted',
  'Offers Countered',
  'Offers Rejected',
  'Conversations Handled'
];

/**
 * Quotes a text cell and neutralises spreadsheet formula injection
 * (cells starting with = + - @ are prefixed with an apostrophe).
 */
export function csvTextCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildPerformanceCsv(rows: EmployeePerformanceMetrics[]): string {
  const lines = [PERFORMANCE_CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.employeeId,
        csvTextCell(r.employeeName),
        csvTextCell(r.publicAlias),
        r.chatMessagesSent,
        r.ticketRepliesSent,
        r.chatFirstResponseAvgSec ?? '',
        r.chatFirstResponseMedianSec ?? '',
        r.chatFirstResponseP90Sec ?? '',
        r.ticketFirstResponseAvgSec ?? '',
        r.ticketFirstResponseMedianSec ?? '',
        r.ticketFirstResponseP90Sec ?? '',
        r.ticketResolutionAvgSec ?? '',
        r.ticketResolutionMedianSec ?? '',
        r.ticketsAssigned,
        r.ticketsResolved,
        r.ticketsPending,
        r.ticketsReopened,
        r.offersHandledTotal,
        r.offersAccepted,
        r.offersCountered,
        r.offersRejected,
        r.conversationsHandled
      ].join(',')
    );
  }
  return lines.join('\n');
}
