/**
 * One-Off Server-Side State Import Script (`scripts/import-state-to-postgres.ts`)
 * Imports the contents of `state.json` from the `jr-live-db` Supabase Storage bucket
 * (or local fallback state) into the PostgreSQL tables defined in `00001_schema_and_rls.sql`.
 *
 * Usage (after running `00001_schema_and_rls.sql` in Supabase SQL Editor):
 *   npx tsx scripts/import-state-to-postgres.ts
 */

import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createSupabaseAdminClient } from '../lib/supabase/admin';
import { createInitialMockState, type MockDatabaseState } from '../mocks/seed-data';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Deterministically converts a legacy string ID (e.g. `conv-1`, `prod-1`) into a valid UUID
 * so foreign keys remain consistent and repeated runs are idempotent.
 */
function toDeterministicUuid(rawId: string): string {
  if (UUID_REGEX.test(rawId)) return rawId.toLowerCase();
  const hash = crypto.createHash('sha256').update(`jr-id:${rawId}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}

async function loadStateFromBucketOrLocal(): Promise<MockDatabaseState> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from('jr-live-db').download('state.json');
  if (!error && data) {
    const text = await data.text();
    return JSON.parse(text) as MockDatabaseState;
  }

  const localPath = path.join(process.cwd(), 'mocks', '.mock-state.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8')) as MockDatabaseState;
  }

  return createInitialMockState();
}

async function main() {
  const admin = createSupabaseAdminClient();
  const state = await loadStateFromBucketOrLocal();

  // 1. Resolve Auth User UUIDs by email (creating missing auth.users rows if needed)
  const { data: authList, error: authListErr } = await admin.auth.admin.listUsers();
  if (authListErr) {
    throw new Error(`Failed to list auth.users: ${authListErr.message}`);
  }

  const emailToAuthUuid = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    if (u.email) {
      emailToAuthUuid.set(u.email.toLowerCase(), u.id);
    }
  }

  const userIdMap = new Map<string, string>();
  for (const prof of state.profiles) {
    const emailLower = prof.email.trim().toLowerCase();
    let authUuid = emailToAuthUuid.get(emailLower);
    if (!authUuid) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: emailLower,
        email_confirm: true,
        user_metadata: {
          username: prof.username ?? null,
          full_name: prof.fullName,
          role: prof.role
        }
      });
      if (createErr || !created.user) {
        throw new Error(`Could not create auth user for ${emailLower}: ${createErr?.message}`);
      }
      authUuid = created.user.id;
      emailToAuthUuid.set(emailLower, authUuid);
    }
    userIdMap.set(prof.id, authUuid);
  }

  const resolveUserId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return userIdMap.get(id) ?? toDeterministicUuid(id);
  };

  // 2. Upsert profiles (first pass without invited_by/approved_by to avoid self-FK ordering issues, then second pass)
  for (const prof of state.profiles) {
    const uid = resolveUserId(prof.id)!;
    const { error } = await admin.from('profiles').upsert({
      id: uid,
      role: prof.role,
      status: prof.status,
      username: prof.username ?? null,
      full_name: prof.fullName,
      email: prof.email.trim().toLowerCase(),
      phone: prof.phone ?? null,
      avatar_path: prof.avatarPath ?? null,
      invited_by: null,
      approved_by: null,
      approved_at: prof.approvedAt ?? null,
      created_at: prof.createdAt,
      last_seen_at: prof.lastSeenAt ?? null
    });
    if (error) throw new Error(`profiles upsert failed (${prof.email}): ${error.message}`);
  }

  for (const prof of state.profiles) {
    if (prof.invitedBy || prof.approvedBy) {
      const uid = resolveUserId(prof.id)!;
      await admin
        .from('profiles')
        .update({
          invited_by: resolveUserId(prof.invitedBy),
          approved_by: resolveUserId(prof.approvedBy)
        })
        .eq('id', uid);
    }
  }

  // 3. Upsert staff_profiles
  for (const sp of state.staffProfiles) {
    const uid = resolveUserId(sp.userId);
    if (!uid) continue;
    const { error } = await admin.from('staff_profiles').upsert({
      user_id: uid,
      public_alias: sp.publicAlias,
      customer_selectable: sp.customerSelectable,
      accepts_tickets: sp.acceptsTickets,
      can_manage_products: sp.canManageProducts,
      can_publish_stories: sp.canPublishStories,
      can_post_customer_announcements: sp.canPostCustomerAnnouncements,
      created_at: sp.createdAt,
      updated_at: sp.updatedAt
    });
    if (error) throw new Error(`staff_profiles upsert failed: ${error.message}`);
  }

  // 4. Upsert app_settings
  if (state.appSettings) {
    const { error } = await admin.from('app_settings').upsert({
      id: true,
      employee_inbox_scope: state.appSettings.employeeInboxScope,
      customer_can_pick_employee: state.appSettings.customerCanPickEmployee,
      ticket_auto_close_days: state.appSettings.ticketAutoCloseDays,
      offer_sanity_max_paise: state.appSettings.offerSanityMaxPaise,
      business_hours_only: state.appSettings.businessHoursOnly,
      updated_by: resolveUserId(state.appSettings.updatedBy),
      updated_at: state.appSettings.updatedAt
    });
    if (error) throw new Error(`app_settings upsert failed: ${error.message}`);
  }

  // 5. Upsert invitations
  for (const inv of state.invitations ?? []) {
    const { error } = await admin.from('invitations').upsert({
      id: toDeterministicUuid(inv.id),
      email: inv.email.trim().toLowerCase(),
      intended_role: inv.intendedRole,
      full_name: inv.fullName,
      phone: inv.phone ?? null,
      invited_by: resolveUserId(inv.invitedBy)!,
      status: inv.status,
      created_at: inv.createdAt,
      expires_at: inv.expiresAt,
      accepted_at: inv.acceptedAt ?? null
    });
    if (error) throw new Error(`invitations upsert failed: ${error.message}`);
  }

  // 6. Upsert products
  for (const prod of state.products ?? []) {
    const { error } = await admin.from('products').upsert({
      id: toDeterministicUuid(prod.id),
      game_name: prod.gameName,
      title: prod.title,
      points_qty: prod.pointsQty,
      description: prod.description,
      image_path: prod.imagePath ?? null,
      price_paise: prod.pricePaise,
      status: prod.status,
      created_by: resolveUserId(prod.createdBy)!,
      created_at: prod.createdAt,
      updated_at: prod.updatedAt
    });
    if (error) throw new Error(`products upsert failed: ${error.message}`);
  }

  // 7. Upsert conversations
  for (const conv of state.conversations ?? []) {
    const { error } = await admin.from('conversations').upsert({
      id: toDeterministicUuid(conv.id),
      customer_id: resolveUserId(conv.customerId)!,
      handled_by: resolveUserId(conv.handledBy),
      awaiting_staff: conv.awaitingStaff,
      last_message_at: conv.lastMessageAt ?? null,
      last_message_preview: conv.lastMessagePreview ?? null,
      customer_last_read_at: conv.customerLastReadAt ?? null,
      staff_last_read_at: conv.staffLastReadAt ?? null,
      customer_unread_count: conv.customerUnreadCount ?? 0,
      staff_unread_count: conv.staffUnreadCount ?? 0,
      created_at: conv.createdAt
    });
    if (error) throw new Error(`conversations upsert failed: ${error.message}`);
  }

  // 8. Upsert offers & offer_events
  for (const offer of state.offers ?? []) {
    const { error } = await admin.from('offers').upsert({
      id: toDeterministicUuid(offer.id),
      product_id: toDeterministicUuid(offer.productId),
      customer_id: resolveUserId(offer.customerId)!,
      conversation_id: toDeterministicUuid(offer.conversationId),
      offered_price_paise: offer.offeredPricePaise,
      listed_price_paise: offer.listedPricePaise,
      product_title: offer.productTitle,
      status: offer.status,
      counter_price_paise: offer.counterPricePaise ?? null,
      staff_note: offer.staffNote ?? null,
      handled_by: resolveUserId(offer.handledBy),
      created_at: offer.createdAt,
      updated_at: offer.updatedAt
    });
    if (error) throw new Error(`offers upsert failed: ${error.message}`);
  }

  for (const ev of state.offerEvents ?? []) {
    const { error } = await admin.from('offer_events').upsert({
      id: toDeterministicUuid(ev.id),
      offer_id: toDeterministicUuid(ev.offerId),
      actor_id: resolveUserId(ev.actorId)!,
      event: ev.event,
      meta: ev.meta ?? {},
      created_at: ev.createdAt
    });
    if (error) throw new Error(`offer_events upsert failed: ${error.message}`);
  }

  // 9. Upsert messages & message_attribution
  for (const msg of state.messages ?? []) {
    const { error } = await admin.from('messages').upsert({
      id: toDeterministicUuid(msg.id),
      conversation_id: toDeterministicUuid(msg.conversationId),
      sender_kind: msg.senderKind,
      customer_sender_id: msg.senderKind === 'customer' ? resolveUserId(msg.customerSenderId) : null,
      type: msg.type,
      body: msg.body,
      offer_id: msg.offerId ? toDeterministicUuid(msg.offerId) : null,
      client_msg_id: msg.clientMsgId,
      created_at: msg.createdAt
    });
    if (error) throw new Error(`messages upsert failed: ${error.message}`);
  }

  for (const attr of state.messageAttributions ?? []) {
    const { error } = await admin.from('message_attribution').upsert({
      message_id: toDeterministicUuid(attr.messageId),
      staff_id: resolveUserId(attr.staffId)!,
      created_at: attr.createdAt
    });
    if (error) throw new Error(`message_attribution upsert failed: ${error.message}`);
  }

  // 10. Upsert tickets, ticket_messages, ticket_message_attribution, ticket_events
  for (const tkt of state.tickets ?? []) {
    const { error } = await admin.from('tickets').upsert({
      id: toDeterministicUuid(tkt.id),
      ticket_no: tkt.ticketNo,
      customer_id: resolveUserId(tkt.customerId)!,
      subject: tkt.subject,
      description: tkt.description,
      category: tkt.category,
      priority: tkt.priority,
      status: tkt.status,
      assigned_employee_id: resolveUserId(tkt.assignedEmployeeId),
      requested_employee_id: resolveUserId(tkt.requestedEmployeeId),
      reopen_count: tkt.reopenCount ?? 0,
      created_at: tkt.createdAt,
      first_response_at: tkt.firstResponseAt ?? null,
      resolved_at: tkt.resolvedAt ?? null,
      closed_at: tkt.closedAt ?? null
    });
    if (error) throw new Error(`tickets upsert failed: ${error.message}`);
  }

  for (const tm of state.ticketMessages ?? []) {
    const { error } = await admin.from('ticket_messages').upsert({
      id: toDeterministicUuid(tm.id),
      ticket_id: toDeterministicUuid(tm.ticketId),
      sender_kind: tm.senderKind,
      customer_sender_id: tm.senderKind === 'customer' ? resolveUserId(tm.customerSenderId) : null,
      body: tm.body,
      created_at: tm.createdAt
    });
    if (error) throw new Error(`ticket_messages upsert failed: ${error.message}`);
  }

  for (const tma of state.ticketMessageAttributions ?? []) {
    const { error } = await admin.from('ticket_message_attribution').upsert({
      ticket_message_id: toDeterministicUuid(tma.ticketMessageId),
      staff_id: resolveUserId(tma.staffId)!,
      created_at: tma.createdAt
    });
    if (error) throw new Error(`ticket_message_attribution upsert failed: ${error.message}`);
  }

  for (const te of state.ticketEvents ?? []) {
    const { error } = await admin.from('ticket_events').upsert({
      id: toDeterministicUuid(te.id),
      ticket_id: toDeterministicUuid(te.ticketId),
      actor_id: resolveUserId(te.actorId)!,
      event: te.event,
      from_value: te.fromValue ?? null,
      to_value: te.toValue ?? null,
      created_at: te.createdAt
    });
    if (error) throw new Error(`ticket_events upsert failed: ${error.message}`);
  }

  // 11. Upsert complaint_chat_rooms & complaint_chat_messages
  for (const room of state.complaintChatRooms ?? []) {
    const { error } = await admin.from('complaint_chat_rooms').upsert({
      id: toDeterministicUuid(room.id),
      ticket_id: toDeterministicUuid(room.ticketId),
      customer_id: resolveUserId(room.customerId)!,
      employee_id: resolveUserId(room.employeeId)!,
      boss_id: resolveUserId(room.bossId)!,
      created_at: room.createdAt
    });
    if (error) throw new Error(`complaint_chat_rooms upsert failed: ${error.message}`);
  }

  for (const ccm of state.complaintChatMessages ?? []) {
    const { error } = await admin.from('complaint_chat_messages').upsert({
      id: toDeterministicUuid(ccm.id),
      room_id: toDeterministicUuid(ccm.roomId),
      ticket_id: toDeterministicUuid(ccm.ticketId),
      sender_id: resolveUserId(ccm.senderId)!,
      body: ccm.body,
      created_at: ccm.createdAt
    });
    if (error) throw new Error(`complaint_chat_messages upsert failed: ${error.message}`);
  }

  // 12. Upsert staff_threads & staff_thread_messages
  const groupThreadUuid = toDeterministicUuid('sthread-group');
  await admin.from('staff_threads').upsert({
    id: groupThreadUuid,
    employee_id: null,
    is_group: true,
    title: 'JR Family Group Chat',
    last_message_at: null,
    last_message_preview: null
  });

  for (const st of state.staffThreads ?? []) {
    const { error } = await admin.from('staff_threads').upsert({
      id: toDeterministicUuid(st.id),
      employee_id: resolveUserId(st.employeeId),
      is_group: st.id === 'sthread-group',
      title: st.employeeName,
      last_message_at: st.lastMessageAt ?? null,
      last_message_preview: st.lastMessagePreview ?? null,
      created_at: st.createdAt
    });
    if (error) throw new Error(`staff_threads upsert failed: ${error.message}`);
  }

  for (const stm of state.staffThreadMessages ?? []) {
    const { error } = await admin.from('staff_thread_messages').upsert({
      id: toDeterministicUuid(stm.id),
      thread_id: toDeterministicUuid(stm.threadId),
      sender_id: resolveUserId(stm.senderId)!,
      body: stm.body,
      created_at: stm.createdAt
    });
    if (error) throw new Error(`staff_thread_messages upsert failed: ${error.message}`);
  }

  // 13. Upsert staff_announcements & staff_announcement_acks
  for (const sa of state.staffAnnouncements ?? []) {
    const { error } = await admin.from('staff_announcements').upsert({
      id: toDeterministicUuid(sa.id),
      author_id: resolveUserId(sa.authorId)!,
      title: sa.title,
      body: sa.body,
      priority: sa.priority,
      created_at: sa.createdAt
    });
    if (error) throw new Error(`staff_announcements upsert failed: ${error.message}`);

    for (const ack of sa.acks ?? []) {
      const { error: ackErr } = await admin.from('staff_announcement_acks').upsert({
        announcement_id: toDeterministicUuid(sa.id),
        employee_id: resolveUserId(ack.employeeId)!,
        acknowledged_at: ack.acknowledgedAt
      });
      if (ackErr) throw new Error(`staff_announcement_acks upsert failed: ${ackErr.message}`);
    }
  }

  // 14. Upsert customer_announcements
  for (const ca of state.customerAnnouncements ?? []) {
    const { error } = await admin.from('customer_announcements').upsert({
      id: toDeterministicUuid(ca.id),
      author_id: resolveUserId(ca.authorId)!,
      title: ca.title,
      body: ca.body,
      pinned: ca.pinned,
      published_at: ca.publishedAt
    });
    if (error) throw new Error(`customer_announcements upsert failed: ${error.message}`);
  }

  // 15. Upsert stories & story_views
  for (const s of state.stories ?? []) {
    const { error } = await admin.from('stories').upsert({
      id: toDeterministicUuid(s.id),
      author_id: resolveUserId(s.authorId)!,
      kind: s.kind,
      media_path: s.mediaPath ?? null,
      caption: s.caption,
      bg_style: s.bgStyle,
      created_at: s.createdAt,
      expires_at: s.expiresAt
    });
    if (error) throw new Error(`stories upsert failed: ${error.message}`);
  }

  for (const sv of state.storyViews ?? []) {
    const { error } = await admin.from('story_views').upsert({
      story_id: toDeterministicUuid(sv.storyId),
      customer_id: resolveUserId(sv.customerId)!,
      viewed_at: sv.viewedAt
    });
    if (error) throw new Error(`story_views upsert failed: ${error.message}`);
  }

  // 16. Upsert spin_bonuses
  for (const sb of state.spinBonuses ?? []) {
    const { error } = await admin.from('spin_bonuses').upsert({
      id: toDeterministicUuid(sb.id),
      customer_id: resolveUserId(sb.customerId)!,
      date_key_california: sb.dateKeyCalifornia,
      reward_points: sb.rewardPoints,
      reward_label: sb.rewardLabel,
      spun_at: sb.spunAt
    });
    if (error) throw new Error(`spin_bonuses upsert failed: ${error.message}`);
  }

  // 17. Upsert notifications & push_subscriptions
  for (const notif of state.notifications ?? []) {
    const { error } = await admin.from('notifications').upsert({
      id: toDeterministicUuid(notif.id),
      recipient_id: resolveUserId(notif.recipientId)!,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      link: notif.link,
      payload: notif.payload ?? {},
      read_at: notif.readAt ?? null,
      created_at: notif.createdAt
    });
    if (error) throw new Error(`notifications upsert failed: ${error.message}`);
  }

  for (const sub of state.pushSubscriptions ?? []) {
    const { error } = await admin.from('push_subscriptions').upsert({
      id: toDeterministicUuid(sub.id),
      user_id: resolveUserId(sub.userId)!,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
      created_at: sub.createdAt
    });
    if (error) throw new Error(`push_subscriptions upsert failed: ${error.message}`);
  }

  // 18. Upsert activity_events & audit_log
  for (const ae of state.activityEvents ?? []) {
    const { error } = await admin.from('activity_events').upsert({
      id: toDeterministicUuid(ae.id),
      occurred_at: ae.occurredAt,
      actor_id: resolveUserId(ae.actorId)!,
      actor_role: ae.actorRole,
      event_type: ae.eventType,
      customer_id: resolveUserId(ae.customerId),
      conversation_id: ae.conversationId ? toDeterministicUuid(ae.conversationId) : null,
      ticket_id: ae.ticketId ? toDeterministicUuid(ae.ticketId) : null,
      offer_id: ae.offerId ? toDeterministicUuid(ae.offerId) : null,
      message_id: ae.messageId ? toDeterministicUuid(ae.messageId) : null,
      meta: ae.meta ?? {}
    });
    if (error) throw new Error(`activity_events upsert failed: ${error.message}`);
  }

  for (const log of state.auditLogs ?? []) {
    const { error } = await admin.from('audit_log').upsert({
      id: toDeterministicUuid(log.id),
      actor_id: resolveUserId(log.actorId),
      action: log.action,
      entity: log.entity,
      entity_id: log.entityId,
      before_meta: log.beforeMeta ?? null,
      after_meta: log.afterMeta ?? null,
      ip: log.ip ?? null,
      created_at: log.createdAt
    });
    if (error) throw new Error(`audit_log upsert failed: ${error.message}`);
  }

  console.log('✓ Successfully imported state.json into PostgreSQL tables.');
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
