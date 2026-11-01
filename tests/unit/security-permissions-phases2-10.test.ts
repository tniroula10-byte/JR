import { beforeEach, describe, expect, it } from 'vitest';
import { MockDataRepository, resetMockState } from '@/lib/data/mock';
import type { CallerContext } from '@/lib/data/types';
import {
  canOpenRealtimeConnection,
  canReceiveRealtimeRow,
  connectRealtimeSocket
} from '@/lib/realtime';
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
    const invitedRes = await requestMagicLinkAction({ email: 'member1@johnrambo.us' });
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
    expect(lastStaffMsg?.attributedStaffName).toBe('GUZ');
    expect(lastStaffMsg?.attributedStaffAlias).toBe('GUZ');

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
      offeredPricePaise: 17000,
      clientMsgId: 'valid-offer-1'
    });
    expect(offer.status).toBe('pending');
    expect(offer.listedPricePaise).toBe(18500);
    expect(message.type).toBe('offer');
    expect(message.offerId).toBe(offer.id);

    // Staff counters offer
    const countered = await repo.respondToOffer(emp1, {
      offerId: offer.id,
      action: 'counter',
      counterPricePaise: 17800,
      note: 'Special VIP counter'
    });
    expect(countered.status).toBe('countered');
    expect(countered.counterPricePaise).toBe(17800);
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

  it('Phase 7: enforces JR Family all-staff messaging and BOKA directive acknowledgements', async () => {
    // Customers get FORBIDDEN on staff threads and staff announcements
    await expect(repo.listStaffThreads(custA)).rejects.toThrow(/FORBIDDEN/);
    await expect(repo.listStaffAnnouncements(custA)).rejects.toThrow(/FORBIDDEN/);

    // Employee 1 (GUZ) can read all threads and message every other employee and Boss (BOKA)
    const threads = await repo.listStaffThreads(emp1);
    expect(threads.length).toBe(5);

    const ownPost = await repo.sendStaffThreadMessage(emp1, {
      threadId: 'sthread-1',
      body: 'Reporting in on GUZ thread.'
    });
    expect(ownPost.senderId).toBe('emp-1');

    const colleaguePost = await repo.sendStaffThreadMessage(emp1, {
      threadId: 'sthread-2',
      body: 'GUZ messaging NOX in JR Family.'
    });
    expect(colleaguePost.senderId).toBe('emp-1');

    const bossThreadPost = await repo.sendStaffThreadMessage(emp1, {
      threadId: 'sthread-boss',
      body: 'GUZ messaging BOKA in JR Family.'
    });
    expect(bossThreadPost.senderId).toBe('emp-1');

    // Staff announcements: only Boss (BOKA) can post; Employee acknowledges with timestamp
    await expect(
      repo.createStaffAnnouncement(emp1, {
        title: 'Unauthorized',
        body: 'Employees cannot post here',
        priority: 'normal'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    const createdAnn = await repo.createStaffAnnouncement(boss, {
      title: 'BOKA Directive',
      body: 'All hands check JR Family.',
      priority: 'important'
    });

    const ack = await repo.acknowledgeStaffPost(emp3, createdAnn.id);
    expect(ack.employeeId).toBe('emp-3');
    expect(ack.acknowledgedAt).toBeTruthy();

    // Daily Spin Bonus: customer can spin once per California day
    const initialSpin = await repo.getSpinBonusStatus(custA);
    expect(initialSpin.hasSpunToday).toBe(false);
    const afterSpin = await repo.spinDailyBonus(custA);
    expect(afterSpin.hasSpunToday).toBe(true);
    expect(afterSpin.todaysSpin?.rewardPoints).toBeGreaterThan(0);
    await expect(repo.spinDailyBonus(custA)).rejects.toThrow(/ALREADY_SPUN/);
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

  it('enforces customer password change and 3-member private Complaint Chat room creation & isolation', async () => {
    // Customer can change own password and subsequent change validates current password & compulsory basic password format
    await expect(
      repo.changeCustomerPassword(custA, {
        currentPassword: 'initialPassword123',
        newPassword: 'weakpassword'
      })
    ).rejects.toThrow(/INVALID_PASSWORD/);

    await repo.changeCustomerPassword(custA, {
      currentPassword: 'initialPassword123',
      newPassword: 'NewSecurePassword456@'
    });
    await expect(
      repo.changeCustomerPassword(custA, {
        currentPassword: 'wrongCurrentPassword',
        newPassword: 'AnotherPassword789@'
      })
    ).rejects.toThrow(/INVALID_PASSWORD/);

    // Raising a ticket against a specific employee (emp-2) automatically creates a 3-member Complaint Chat room
    const complaintTicket = await repo.createTicket(custA, {
      subject: 'Delayed transfer complaint regarding Valkyrie',
      description: 'Raising complaint ticket regarding specialist Valkyrie.',
      category: 'account_support',
      priority: 'high',
      requestedEmployeeId: 'emp-2'
    });

    const roomForCust = await repo.getComplaintChatRoomByTicket(custA, complaintTicket.id);
    expect(roomForCust).not.toBeNull();
    expect(roomForCust?.memberIds).toEqual(['boss-1', 'emp-2', 'cust-1']);

    // All 3 members (Boss, emp-2, cust-1) can post & read in the 3-member room
    await repo.sendComplaintChatMessage(boss, {
      ticketId: complaintTicket.id,
      body: 'Boss here: reviewing this complaint.'
    });
    await repo.sendComplaintChatMessage(emp2, {
      ticketId: complaintTicket.id,
      body: 'Valkyrie here: sharing the transfer logs now.'
    });
    const roomMsgs = await repo.listComplaintChatMessages(custA, complaintTicket.id);
    expect(roomMsgs.length).toBe(3); // initial + boss + emp2

    // Other employees (emp-1) and other customers (cust-2) are strictly blocked from the 3-member room
    expect(await repo.getComplaintChatRoomByTicket(emp1, complaintTicket.id)).toBeNull();
    await expect(
      repo.listComplaintChatMessages(emp1, complaintTicket.id)
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      repo.sendComplaintChatMessage(emp1, {
        ticketId: complaintTicket.id,
        body: 'Intruder message'
      })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      repo.listComplaintChatMessages(custB, complaintTicket.id)
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('enforces customer approval before first login, WebSocket blocking, anti-enumeration, role approval rules, and audit logs', async () => {
    // 1. After a customer verifies their email OTP and sets a password, their status becomes PENDING_APPROVAL instead of ACTIVE
    const pendingCustomer = await repo.verifyEmailOtpAndSetPassword({
      email: 'pending.buyer@johnrambo.us',
      otpCode: '654321',
      password: 'CorrectHorseBattery123@',
      fullName: 'Pending Buyer',
      phone: '+13105550199'
    });
    expect(pendingCustomer.status).toBe('pending_approval');

    const pendingCaller: CallerContext = {
      userId: pendingCustomer.id,
      role: 'customer',
      status: pendingCustomer.status
    };

    // 2. A pending customer cannot log in, call APIs, or open/connect via WebSocket
    await expect(repo.listProducts(pendingCaller)).rejects.toThrow(/FORBIDDEN_SUSPENDED/);
    expect(canOpenRealtimeConnection(pendingCaller)).toBe(false);
    expect(() => connectRealtimeSocket(pendingCaller)).toThrow(/FORBIDDEN_WEBSOCKET/);
    expect(
      canReceiveRealtimeRow(
        pendingCaller,
        'messages',
        { id: 'm-1' },
        { conversationOwnerId: pendingCustomer.id }
      )
    ).toBe(false);

    // 3. Anti-enumeration: Wrong password on pending customer returns INVALID_CREDENTIALS (does NOT reveal "awaiting approval")
    const wrongPassLogin = await repo.authenticateWithPassword({
      email: 'pending.buyer@johnrambo.us',
      password: 'WrongPassword999'
    });
    expect(wrongPassLogin.ok).toBe(false);
    expect(wrongPassLogin.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassLogin.error).toBe('Invalid email or password.');

    // Unregistered email also returns identical INVALID_CREDENTIALS
    const unknownEmailLogin = await repo.authenticateWithPassword({
      email: 'nobody@johnrambo.us',
      password: 'WrongPassword999'
    });
    expect(unknownEmailLogin.ok).toBe(false);
    expect(unknownEmailLogin.code).toBe('INVALID_CREDENTIALS');

    // Correct password on pending customer shows the "awaiting approval" message
    const rightPassWhilePending = await repo.authenticateWithPassword({
      email: 'pending.buyer@johnrambo.us',
      password: 'CorrectHorseBattery123@'
    });
    expect(rightPassWhilePending.ok).toBe(false);
    expect(rightPassWhilePending.code).toBe('PENDING_APPROVAL');
    expect(rightPassWhilePending.error).toMatch(/awaiting approval/i);

    // 4. Pending customers queue is visible to BOKA and all Employees, but forbidden to Customers
    await expect(repo.listPendingCustomers(custA)).rejects.toThrow(/FORBIDDEN/);
    const queueForEmp = await repo.listPendingCustomers(emp1);
    expect(queueForEmp.some((p) => p.id === pendingCustomer.id)).toBe(true);
    const queueForBoss = await repo.listPendingCustomers(boss);
    expect(queueForBoss.some((p) => p.id === pendingCustomer.id)).toBe(true);

    // 5. A customer cannot approve anyone
    await expect(
      repo.reviewPendingUser(custA, {
        targetUserId: pendingCustomer.id,
        decision: 'approve'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // 6. An employee CAN approve a pending customer -> emails customer that account is active & logs in audit_log
    const approvalRes = await repo.reviewPendingUser(emp1, {
      targetUserId: pendingCustomer.id,
      decision: 'approve'
    });
    expect(approvalRes.profile.status).toBe('active');
    expect(approvalRes.profile.approvedBy).toBe('emp-1');
    expect(approvalRes.emailNotice.kind).toBe('customer_approved');
    expect(approvalRes.emailNotice.to).toBe('pending.buyer@johnrambo.us');
    expect(approvalRes.emailNotice.subject).toMatch(/Active/i);

    // After approval, the customer logs in normally and can connect via WebSocket
    const approvedLogin = await repo.authenticateWithPassword({
      email: 'pending.buyer@johnrambo.us',
      password: 'CorrectHorseBattery123@'
    });
    expect(approvedLogin.ok).toBe(true);
    expect(approvedLogin.code).toBe('SUCCESS');
    expect(
      canOpenRealtimeConnection({
        userId: pendingCustomer.id,
        role: 'customer',
        status: approvalRes.profile.status
      })
    ).toBe(true);

    // 7. Approval happens once: suspending and unsuspending does NOT send them back to the approval queue
    const suspended = await repo.setUserStatus(boss, pendingCustomer.id, 'suspended');
    expect(suspended.status).toBe('suspended');
    const unsuspended = await repo.setUserStatus(boss, pendingCustomer.id, 'active');
    expect(unsuspended.status).toBe('active');
    await expect(
      repo.setUserStatus(boss, pendingCustomer.id, 'pending_approval')
    ).rejects.toThrow(/Approval happens once/);

    // 8. Rejection sends generic notice, blocks login & WebSocket, and logs in audit_log
    const secondPending = await repo.verifyEmailOtpAndSetPassword({
      email: 'rejected.buyer@johnrambo.us',
      otpCode: '112233',
      password: 'SecondPassword123@',
      fullName: 'Rejected Buyer'
    });
    const rejectRes = await repo.reviewPendingUser(boss, {
      targetUserId: secondPending.id,
      decision: 'reject'
    });
    expect(rejectRes.profile.status).toBe('rejected');
    expect(rejectRes.emailNotice.kind).toBe('customer_rejected');
    expect(
      canOpenRealtimeConnection({
        userId: secondPending.id,
        role: 'customer',
        status: 'rejected'
      })
    ).toBe(false);
    const rejectedLogin = await repo.authenticateWithPassword({
      email: 'rejected.buyer@johnrambo.us',
      password: 'SecondPassword123@'
    });
    expect(rejectedLogin.ok).toBe(false);

    // 9. Employee approval stays BOKA-only: an employee CANNOT approve another employee
    const { profile: pendingEmp } = await repo.inviteUser(boss, {
      email: 'new.staff@johnrambo.us',
      fullName: 'NEWSTAFF',
      intendedRole: 'employee',
      publicAlias: 'NEWSTAFF'
    });
    expect(pendingEmp.status).toBe('pending_approval');

    await expect(
      repo.reviewPendingUser(emp1, {
        targetUserId: pendingEmp.id,
        decision: 'approve'
      })
    ).rejects.toThrow(/BOKA-only/);

    // BOKA CAN approve the pending employee
    const bossEmpApproval = await repo.reviewPendingUser(boss, {
      targetUserId: pendingEmp.id,
      decision: 'approve'
    });
    expect(bossEmpApproval.profile.status).toBe('active');

    // 10. Audit log contains both customer approval and rejection with approver identity
    const auditLogs = await repo.listAuditLogs(boss);
    const approveLog = auditLogs.find(
      (l) => l.action === 'customer_approved' && l.entityId === pendingCustomer.id
    );
    expect(approveLog).toBeDefined();
    expect(approveLog?.actorId).toBe('emp-1');
    expect(approveLog?.afterMeta?.approvedBy).toBe('emp-1');
    expect(approveLog?.afterMeta?.approvedByName).toBe('GUZ');

    const rejectLog = auditLogs.find(
      (l) => l.action === 'customer_rejected' && l.entityId === secondPending.id
    );
    expect(rejectLog).toBeDefined();
    expect(rejectLog?.actorId).toBe('boss-1');
    expect(rejectLog?.afterMeta?.approvedBy).toBe('boss-1');
  });

  it('enforces seeded Boss & Employee credentials, blocks employee email OTP, and allows BOKA to change Boss/Employee/Customer passwords', async () => {
    // 1. Verify Boss login with BOKA10 / Bokasuri10@
    const bossLogin = await repo.authenticateWithPassword({
      email: 'BOKA10',
      password: 'Bokasuri10@'
    });
    expect(bossLogin.ok).toBe(true);
    expect(bossLogin.profile?.id).toBe('boss-1');

    // 2. Verify Employee 1..4 logins (GUZ, NOX, BSTURN, ANKY)
    const guzLogin = await repo.authenticateWithPassword({
      email: 'GUZ',
      password: 'chotabhim'
    });
    expect(guzLogin.ok).toBe(true);
    expect(guzLogin.profile?.id).toBe('emp-1');

    const noxLogin = await repo.authenticateWithPassword({
      email: 'NOX',
      password: 'NOX'
    });
    expect(noxLogin.ok).toBe(true);
    expect(noxLogin.profile?.id).toBe('emp-2');

    const bsturnLogin = await repo.authenticateWithPassword({
      email: 'BSTURN',
      password: 'BSTURN'
    });
    expect(bsturnLogin.ok).toBe(true);
    expect(bsturnLogin.profile?.id).toBe('emp-3');

    const ankyLogin = await repo.authenticateWithPassword({
      email: 'ANKY',
      password: 'ANKY'
    });
    expect(ankyLogin.ok).toBe(true);
    expect(ankyLogin.profile?.id).toBe('emp-4');

    // 3. Employee first-time login cannot use email OTP
    await expect(
      repo.verifyEmailOtpAndSetPassword({
        email: 'guz@johnrambo.us',
        otpCode: '123456',
        password: 'NewPassword123'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // 4. Non-Boss (employee or customer) cannot use adminSetUserPassword
    await expect(
      repo.adminSetUserPassword(emp1, {
        targetUserId: 'emp-2',
        newPassword: 'hacked'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    await expect(
      repo.adminSetUserPassword(custA, {
        targetUserId: 'boss-1',
        newPassword: 'hacked'
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // 5. BOKA can change his own password WITHOUT compulsory format restrictions (e.g. 'boka'),
    // while Employee and Customer password changes MUST follow the compulsory basic password format
    await repo.adminSetUserPassword(boss, {
      targetUserId: 'boss-1',
      newPassword: 'boka',
      newUsername: 'BOKA10'
    });
    const bossNewLogin = await repo.authenticateWithPassword({
      email: 'BOKA10',
      password: 'boka'
    });
    expect(bossNewLogin.ok).toBe(true);

    // Employee password without special char / uppercase / number is rejected
    await expect(
      repo.adminSetUserPassword(boss, {
        targetUserId: 'emp-1',
        newPassword: 'guzweakpassword',
        newUsername: 'GUZ'
      })
    ).rejects.toThrow(/INVALID_PASSWORD/);

    await repo.adminSetUserPassword(boss, {
      targetUserId: 'emp-1',
      newPassword: 'GuzNewPassword123@',
      newUsername: 'GUZ'
    });
    const guzNewLogin = await repo.authenticateWithPassword({
      email: 'GUZ',
      password: 'GuzNewPassword123@'
    });
    expect(guzNewLogin.ok).toBe(true);

    // Customer password without compulsory format is rejected
    await expect(
      repo.adminSetUserPassword(boss, {
        targetUserId: 'cust-1',
        newPassword: 'custweakpassword',
        newUsername: 'member1'
      })
    ).rejects.toThrow(/INVALID_PASSWORD/);

    await repo.adminSetUserPassword(boss, {
      targetUserId: 'cust-1',
      newPassword: 'CustNewPassword123@',
      newUsername: 'member1'
    });
    const custNewLogin = await repo.authenticateWithPassword({
      email: 'member1',
      password: 'CustNewPassword123@'
    });
    expect(custNewLogin.ok).toBe(true);
  });
});
