/**
 * Supabase Realtime Subscription & RLS Filter Simulator (`lib/realtime/index.ts`)
 * Architecture Rule 6: Realtime uses `postgres_changes` with RLS so each client only receives
 * rows it could SELECT.
 */

import type { CallerContext } from '@/lib/data/types';

export type RealtimeTableName =
  | 'messages'
  | 'message_attribution'
  | 'offers'
  | 'tickets'
  | 'ticket_messages'
  | 'ticket_message_attribution'
  | 'staff_threads'
  | 'staff_thread_messages'
  | 'staff_announcements'
  | 'activity_events'
  | 'audit_log'
  | 'notifications';

/**
 * Evaluates whether a caller is permitted to establish a WebSocket / Realtime connection.
 * Pending approval, rejected, invited, and suspended users cannot open a WebSocket connection.
 */
export function canOpenRealtimeConnection(caller: CallerContext): boolean {
  return caller.status === 'active';
}

export function connectRealtimeSocket(caller: CallerContext): { connected: true; userId: string } {
  if (!canOpenRealtimeConnection(caller)) {
    throw new Error(
      `FORBIDDEN_WEBSOCKET: Account with status "${caller.status}" cannot open a WebSocket connection.`
    );
  }
  return { connected: true, userId: caller.userId };
}

/**
 * Evaluates whether a given Realtime `postgres_changes` row would pass PostgreSQL RLS
 * for a connected client socket (`caller`). Used by automated Realtime isolation tests.
 */
export function canReceiveRealtimeRow(
  caller: CallerContext,
  table: RealtimeTableName,
  row: Record<string, unknown>,
  meta?: {
    conversationOwnerId?: string;
    conversationHandlerId?: string | null;
    inboxScope?: 'all' | 'assigned_only';
    ticketOwnerId?: string;
  }
): boolean {
  if (!canOpenRealtimeConnection(caller)) return false;

  // Staff-only tables are NEVER delivered to a customer socket
  const staffOnlyTables: RealtimeTableName[] = [
    'message_attribution',
    'ticket_message_attribution',
    'staff_threads',
    'staff_thread_messages',
    'staff_announcements',
    'activity_events',
    'audit_log'
  ];

  if (caller.role === 'customer' && staffOnlyTables.includes(table)) {
    return false;
  }

  if (table === 'audit_log') {
    return caller.role === 'boss';
  }

  if (table === 'activity_events') {
    if (caller.role === 'boss') return true;
    if (caller.role === 'employee') return row.actor_id === caller.userId;
    return false;
  }

  if (table === 'notifications') {
    return row.recipient_id === caller.userId;
  }

  if (table === 'messages' || table === 'offers') {
    if (caller.role === 'boss') return true;
    if (caller.role === 'customer') {
      const ownerId = meta?.conversationOwnerId ?? (row.customer_id as string | undefined);
      return ownerId === caller.userId;
    }
    if (caller.role === 'employee') {
      if (meta?.inboxScope === 'assigned_only') {
        return meta?.conversationHandlerId === caller.userId;
      }
      return true;
    }
  }

  if (table === 'tickets' || table === 'ticket_messages') {
    if (caller.role === 'boss' || caller.role === 'employee') return true;
    if (caller.role === 'customer') {
      const ownerId = meta?.ticketOwnerId ?? (row.customer_id as string | undefined);
      return ownerId === caller.userId;
    }
  }

  return caller.role === 'boss' || caller.role === 'employee';
}
