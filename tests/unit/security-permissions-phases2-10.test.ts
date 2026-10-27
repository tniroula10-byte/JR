import { beforeEach, describe, expect, it } from 'vitest';
import { MockDataRepository, resetMockState } from '@/lib/data/mock';
import type { CallerContext } from '@/lib/data/types';
import { canReceiveRealtimeRow } from '@/lib/realtime';
import { dispatchWebPushNotifications } from '@/lib/push';
import { requestMagicLinkAction } from '@/actions';

const boss: CallerContext = { userId: 'boss-1', role: 'boss', status: 'active' };
const emp1: CallerContext = { userId: 'emp-1', role: 'employee', status: 'active' }; // Maverick (has flags)
const emp2: CallerContext = { userId: 'emp-2', role: 'employee', status: 'active' }; // Valkyrie
const emp3: CallerContext = { userId: 'emp-3', role: 'employee', status: 'active' }; // Ghost (no flags)
const custA: CallerContext = { userId: 'cust-1', role: 'customer', status: 'active' };
const custB: CallerContext = { userId: 'cust-2', role: 'customer', status: 'active' };
const suspendedCust: CallerContext = {
  userId: 'cust-suspended',
  role: 'customer',
  status: 'suspended'
};

describe('Comprehensive Security, Permission Matrix & Phase 2-10 Self-Checks', () => {
  let repo: MockDataRepository;

  beforeEach(() => {
    resetMockState();
    repo = new MockDataRepository();
  });

  it('Phase 2: enforces suspended user isolation and invite-only magic-link rules', async () => {
    // Suspended user is denied every query
    await expect(repo.listProducts(suspendedCust)).rejects.toThrow(/FORBIDDEN_SUSPENDED/);
    await expect(repo.listConversations(suspendedCust)).rejects.toThrow(/FORBIDDEN_SUSPENDED/);

    // Uninvited email does not create a user and shouldCreateUser is strictly false
    const uninvitedRes = await requestMagicLinkAction({ email: 'uninvited.stranger@example.com' });
    expect(uninvitedRes.ok).toBe(true);
    expect(uninvitedRes.shouldCreateUser).toBe(false);
    expect(uninvitedRes.invitedMatchInMock).toBeNull();

    // Invited active email resolves cleanly
    const invitedRes = await requestMagicLinkAction({ email: 'aarav.mehta@gamer.in' });
    expect(invitedRes.ok).toBe(true);
    expect(invitedRes.shouldCreateUser).toBe(false);
    expect(invitedRes.invitedMatchInMock).toBe('cust-1');
  });

  it('Phase 2 & 3: enforces invitation authority rules (Boss vs Employee vs Customer)', async () => {
    // Customer cannot invite anyone
    await expect(
      repo.inviteUser(custA, {
        email: 'friend@gamer.in',
        fullName: 'Friend',
        intendedRole: 'customer'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // Employee CAN invite a customer, starting unassigned and logging audit_log + invitations
    const empInvite = await repo.inviteUser(emp1, {
      email: 'new.cust@gamer.in',
      fullName: 'NewInvited Customer',
      phone: '+919877766655',
      intendedRole: 'customer'
    });
    expect(empInvite.profile.role).toBe('customer');
    expect(empInvite.profile.invitedBy).toBe('emp-1');
    expect(empInvite.invitation.invitedBy).toBe('emp-1');

    // Employee CANNOT invite an employee
    await expect(
      repo.inviteUser(emp1, {
        email: 'rogue.emp@johnrambo.in',
        fullName: 'Rogue Staff',
        intendedRole: 'employee'
      })
    ).rejects.toThrow(/Employees can invite customers only/);

    // Boss CAN invite an employee
    const bossEmpInvite = await repo.inviteUser(boss, {
      email: 'specialist5@johnrambo.in',
      fullName: 'Specialist Five',
      intendedRole: 'employee',
      publicAlias: 'Titan'
    });
    expect(bossEmpInvite.profile.role).toBe('employee');
  });

  it('Phase 3: hides hidden/sold_out products from customers even on direct ID lookup', async () => {
    const custProducts = await repo.listProducts(custA);
    expect(custProducts.every((p) => p.status === 'available')).toBe(true);
    expect(custProducts.find((p) => p.id === 'prod-hidden')).toBeUndefined();

    // Direct lookup of hidden product by customer returns null
    const directHidden = await repo.getProductById(custA, 'prod-hidden');
    expect(directHidden).toBeNull();

    // Staff can view hidden product
    const staffHidden = await repo.getProductById(emp1, 'prod-hidden');
    expect(staffHidden?.id).toBe('prod-hidden');

    // Employee without canManageProducts flag (emp3) cannot create/edit products
    await expect(
      repo.upsertProduct(emp3, {
        gameName: 'Test',
        title: 'Unauthorized Product',
        pointsQty: 1000,
        description: 'Should fail',
        pricePaise: 50000,
        status: 'available'
      })
    ).rejects.toThrow(/can_manage_products/);
  });

  it('Phase 4: enforces Customer A vs Customer B isolation, Structural Staff Anonymity, and Inbox Scope', async () => {
    // Customer A cannot read Customer B's conversation or messages
    await expect(repo.getCustomerConversation(custA, 'conv-2')).rejects.toThrow(/FORBIDDEN/);
    await expect(repo.listCustomerMessages(custA, 'conv-2')).rejects.toThrow(/FORBIDDEN/);

    // Staff sends message in conv-1
    await repo.sendStaffMessage(emp1, {
      conversationId: 'conv-1',
      body: 'Hello from support team!',
      clientMsgId: 'test-anon-msg-1'
    });

    // Customer view of conv-1 messages NEVER contains staff ID, name, or alias
    const custMessages = await repo.listCustomerMessages(custA, 'conv-1');
    const staffMsgsForCust = custMessages.filter((m) => m.senderKind === 'staff');
    expect(staffMsgsForCust.length).toBeGreaterThan(0);
    for (const msg of staffMsgsForCust) {
      expect(msg.senderDisplayName).toBe('John Rambo Support');
      expect(msg.customerSenderId).toBeNull();
      expect('attributedStaffId' in msg).toBe(false);
      expect('attributedStaffName' in msg).toBe(false);
    }

    // Staff view of conv-1 messages includes real employee attribution
    const staffMessages = await repo.listStaffMessages(boss, 'conv-1');
    const lastStaffMsg = staffMessages.find((m) => m.clientMsgId === 'test-anon-msg-1');
    expect(lastStaffMsg?.attributedStaffId).toBe('emp-1');
    expect(lastStaffMsg?.attributedStaffName).toBe('Vikram Singh');
    expect(lastStaffMsg?.attributedStaffAlias).toBe('Maverick');

    // Switch employee_inbox_scope to 'assigned_only'
    await repo.updateAppSettings(boss, { employeeInboxScope: 'assigned_only' });
    // conv-1 is handled by emp-1, so emp-2 cannot read or reply to conv-1
    await expect(repo.listStaffMessages(emp2, 'conv-1')).rejects.toThrow(/FORBIDDEN/);
    await expect(
      repo.sendStaffMessage(emp2, {
        conversationId: 'conv-1',
        body: 'Out of scope reply',
        clientMsgId: 'out-of-scope-1'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // Realtime isolation check: Customer A never receives Customer B rows or staff-only tables
    expect(
      canReceiveRealtimeRow(custA, 'messages', { id: 'm1' }, { conversationOwnerId: 'cust-2' })
    ).toBe(false);
    expect(canReceiveRealtimeRow(custA, 'message_attribution', { staff_id: 'emp-1' })).toBe(false);
    expect(canReceiveRealtimeRow(custA, 'staff_threads', { employee_id: 'emp-1' })).toBe(false);
    expect(canReceiveRealtimeRow(custA, 'audit_log', { id: 'aud-1' })).toBe(false);
  });

  it('Phase 5: enforces atomic offer creation, price sanity caps, and negotiation actions', async () => {
    // Reject offer on hidden product
    await expect(
      repo.submitOffer(custA, {
        productId: 'prod-hidden',
        offeredPricePaise: 500000,
        clientMsgId: 'bad-offer-1'
      })
    ).rejects.toThrow(/INVALID_PRODUCT/);

    // Reject negative or over-cap offer
    await expect(
      repo.submitOffer(custA, {
        productId: 'prod-1',
        offeredPricePaise: -100,
        clientMsgId: 'bad-offer-2'
      })
    ).rejects.toThrow(/INVALID_AMOUNT/);

    // Valid offer creates offer + structured chat message atomically
    const { offer, message } = await repo.submitOffer(custA, {
      productId: 'prod-1',
      offeredPricePaise: 1700000,
      clientMsgId: 'valid-offer-1'
    });
    expect(offer.status).toBe('pending');
    expect(offer.listedPricePaise).toBe(1850000);
    expect(message.type).toBe('offer');
    expect(message.offerId).toBe(offer.id);

    // Staff counters offer
    const countered = await repo.respondToOffer(emp1, {
      offerId: offer.id,
      action: 'counter',
      counterPricePaise: 1780000,
      note: 'Special VIP counter'
    });
    expect(countered.status).toBe('countered');
    expect(countered.counterPricePaise).toBe(1780000);
    expect(countered.handledBy).toBe('emp-1');

    // Customer accepts counter offer
    const accepted = await repo.acceptCounterOffer(custA, offer.id);
    expect(accepted.status).toBe('accepted');
    expect(accepted.handledBy).toBeNull(); // Stripped for customer anonymity
  });

  it('Phase 6: enforces ticket assignment, selectable aliases, status machine, and auto-close job', async () => {
    // With customerCanPickEmployee = false (default), selectable aliases list is empty for customer
    expect(await repo.getSelectableStaffAliases(custA)).toEqual([]);

    // Enable customerCanPickEmployee
    await repo.updateAppSettings(boss, { customerCanPickEmployee: true });
    const aliases = await repo.getSelectableStaffAliases(custA);
    expect(aliases.length).toBeGreaterThan(0);
    // Only staffId and publicAlias are exposed
    expect(Object.keys(aliases[0]!).sort()).toEqual(['publicAlias', 'staffId']);

    // Customer creates ticket selecting emp-1 (Maverick) -> created as 'assigned'
    const tkt = await repo.createTicket(custA, {
      subject: 'Priority VP transfer request',
      description: 'Requesting Maverick alias handler for this transfer.',
      category: 'points_delivery',
      priority: 'high',
      requestedEmployeeId: 'emp-1'
    });
    expect(tkt.status).toBe('assigned');

    // Non-assigned employee (emp-2) can read the ticket, but CANNOT reply or change status
    const allForEmp2 = await repo.listTickets(emp2);
    expect(allForEmp2.some((x) => x.id === tkt.id)).toBe(true);
    await expect(
      repo.replyTicket(emp2, { ticketId: tkt.id, body: 'Unauthorized colleague reply' })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      repo.transitionTicket(emp2, { ticketId: tkt.id, toStatus: 'in_progress' })
    ).rejects.toThrow(/FORBIDDEN/);

    // Assigned employee (emp-1) replies -> transitions assigned -> in_progress
    await repo.replyTicket(emp1, {
      ticketId: tkt.id,
      body: 'On it! Starting your transfer now.'
    });
    // Assigned employee transitions in_progress -> resolved
    const resolvedTkt = await repo.transitionTicket(emp1, {
      ticketId: tkt.id,
      toStatus: 'resolved'
    });
    expect(resolvedTkt.status).toBe('resolved');

    // Auto-close cron job 8 days in the future closes resolved tickets
    const futureIso = new Date(Date.now() + 8 * 24 * 3600_000).toISOString();
    const closedCount = await repo.autoCloseResolvedTickets(futureIso);
    expect(closedCount).toBeGreaterThanOrEqual(1);
  });

  it('Phase 7: enforces Boss-Employee private thread rules and Staff Channel acknowledgements', async () => {
    // Customers get FORBIDDEN on staff threads and staff announcements
    await expect(repo.listStaffThreads(custA)).rejects.toThrow(/FORBIDDEN/);
    await expect(repo.listStaffAnnouncements(custA)).rejects.toThrow(/FORBIDDEN/);

    // Employee 1 can read all 4 threads, can post in sthread-1 (own), CANNOT post in sthread-2 (Ananya's)
    const threads = await repo.listStaffThreads(emp1);
    expect(threads.length).toBe(4);

    const ownPost = await repo.sendStaffThreadMessage(emp1, {
      threadId: 'sthread-1',
      body: 'Reporting in on my own thread.'
    });
    expect(ownPost.senderId).toBe('emp-1');

    await expect(
      repo.sendStaffThreadMessage(emp1, {
        threadId: 'sthread-2',
        body: 'Trying to post in colleague thread'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // Staff channel: only Boss can post; Employee acknowledges with timestamp
    await expect(
      repo.createStaffAnnouncement(emp1, {
        title: 'Unauthorized',
        body: 'Employees cannot post here',
        priority: 'normal'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    const ack = await repo.acknowledgeStaffPost(emp3, 'sann-1');
    expect(ack.employeeId).toBe('emp-3');
    expect(ack.acknowledgedAt).toBeTruthy();
  });

  it('Phase 8, 9 & 10: enforces analytics scoping, CSV audit log, 24h story expiry, and Web Push', async () => {
    // Employee sees only own performance numbers
    const emp2Perf = await repo.getEmployeePerformance(emp2);
    expect(emp2Perf.length).toBe(1);
    expect(emp2Perf[0]!.employeeId).toBe('emp-2');

    // Employee cannot export CSV; Boss can export CSV and it writes to audit_log
    await expect(repo.exportPerformanceCsv(emp1)).rejects.toThrow(/FORBIDDEN/);
    const csv = await repo.exportPerformanceCsv(boss);
    expect(csv).toContain('Employee ID,Employee Name,Public Alias');
    const logs = await repo.listAuditLogs(boss);
    expect(logs[0]!.action).toBe('export_performance_csv');

    // Stories: expired story ('story-expired') is never returned to customers
    const liveStories = await repo.listStories(custA);
    expect(liveStories.find((s) => s.id === 'story-expired')).toBeUndefined();

    // Web Push subscription and sanitized dispatch
    const sub = await repo.savePushSubscription(custA, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/mock-token-1',
      p256dh: 'mock-p256dh-key',
      auth: 'mock-auth-secret'
    });
    const pushRes = await dispatchWebPushNotifications([sub], {
      title: 'John Rambo Support',
      body: 'Your offer has been updated.',
      link: '/offers'
    });
    expect(pushRes.deliveredCount).toBe(1);
    expect(pushRes.payload.title).toBe('John Rambo Support');
  });
});
