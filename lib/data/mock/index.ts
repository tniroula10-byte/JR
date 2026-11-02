/**
 * Stateful Mock Data Repository (`lib/data/mock/index.ts`)
 * Enforces the exact Permission Matrix (Section 7), Structural Staff Anonymity (Decision 4),
 * Inbox Scope (Decision 5), Invitation Rules (Decision 3), and Ticket State Machine (Section 8).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createInitialMockState,
  getEmployeesWithFlagsFromState,
  type MockDatabaseState
} from '@/mocks/seed-data';
import { calculateEmployeeMetrics } from '@/lib/analytics/metrics';
import { formatPaiseToINR } from '@/lib/money';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { validateTicketTransition } from '@/lib/tickets/state-machine';
import { validateBasicPasswordFormat } from '@/lib/validation/schemas';
import type {
  ActivityEvent,
  AnnouncementPriority,
  AppNotification,
  AppSettings,
  AuditLogEntry,
  CallerContext,
  ComplaintChatMessage,
  ComplaintChatRoom,
  Conversation,
  CustomerAnnouncement,
  CustomerMessageView,
  CustomerTicketMessageView,
  DataRepository,
  EmployeePerformanceMetrics,
  EmployeeWithFlags,
  Invitation,
  Offer,
  OfferEvent,
  OutboundEmailNotice,
  PasswordAuthResult,
  PerformanceQueryFilter,
  Product,
  ProductStatus,
  Profile,
  PushSubscriptionRecord,
  SelectableStaffAlias,
  StaffAnnouncement,
  StaffAnnouncementAck,
  StaffMessageView,
  StaffThread,
  StaffThreadMessage,
  StaffTicketMessageView,
  Story,
  StoryKind,
  Ticket,
  TicketEvent,
  TicketPriority,
  TicketStatus,
  UserStatus
} from '@/lib/data/types';

const globalMockHolder = globalThis as unknown as {
  __jrMockState?: MockDatabaseState;
};

const STATE_FILE_PATH = path.join(process.cwd(), 'mocks', '.mock-state.json');

function getState(): MockDatabaseState {
  if (process.env.JR_PERSIST_MOCK_FILE === '1' && fs.existsSync(STATE_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as MockDatabaseState;
      if (
        parsed.profiles?.[0]?.username === 'BOKA10' &&
        !parsed.profiles.some((p) => p.id === 'emp-4')
      ) {
        globalMockHolder.__jrMockState = parsed;
        return globalMockHolder.__jrMockState;
      }
    } catch {
      // Fallback to in-memory
    }
  }
  if (
    !globalMockHolder.__jrMockState ||
    globalMockHolder.__jrMockState.profiles?.[0]?.username !== 'BOKA10' ||
    globalMockHolder.__jrMockState.profiles.some((p) => p.id === 'emp-4')
  ) {
    globalMockHolder.__jrMockState = createInitialMockState();
  }
  return globalMockHolder.__jrMockState;
}

function saveState(state: MockDatabaseState): void {
  globalMockHolder.__jrMockState = state;
  if (process.env.JR_PERSIST_MOCK_FILE === '1') {
    try {
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state), 'utf8');
    } catch {
      // Ignore write errors in read-only environments
    }
  }
}

export function resetMockState(): void {
  const fresh = createInitialMockState();
  saveState(fresh);
}

function assertActiveCaller(state: MockDatabaseState, caller: CallerContext): Profile {
  const profile = state.profiles.find((p) => p.id === caller.userId);
  if (!profile) {
    throw new Error('UNAUTHORIZED: Caller profile does not exist.');
  }
  if (profile.status !== 'active' || caller.status !== 'active') {
    throw new Error('FORBIDDEN_SUSPENDED: Account is not active.');
  }
  if (profile.role !== caller.role) {
    throw new Error('FORBIDDEN: Caller role mismatch.');
  }
  return profile;
}

function assertBoss(state: MockDatabaseState, caller: CallerContext): Profile {
  const p = assertActiveCaller(state, caller);
  if (p.role !== 'boss') {
    throw new Error('FORBIDDEN: Boss authority required.');
  }
  return p;
}

function assertStaff(state: MockDatabaseState, caller: CallerContext): Profile {
  const p = assertActiveCaller(state, caller);
  if (p.role !== 'boss' && p.role !== 'employee') {
    throw new Error('FORBIDDEN: Staff authority required.');
  }
  return p;
}

function assertCustomer(state: MockDatabaseState, caller: CallerContext): Profile {
  const p = assertActiveCaller(state, caller);
  if (p.role !== 'customer') {
    throw new Error('FORBIDDEN: Customer role required.');
  }
  return p;
}

function hasStaffFlag(
  state: MockDatabaseState,
  caller: CallerContext,
  flag: 'canManageProducts' | 'canPublishStories' | 'canPostCustomerAnnouncements'
): boolean {
  const p = assertActiveCaller(state, caller);
  if (p.role === 'boss') return true;
  if (p.role !== 'employee') return false;
  const sp = state.staffProfiles.find((s) => s.userId === p.id);
  return Boolean(sp?.[flag]);
}

function canAccessConversation(
  state: MockDatabaseState,
  caller: CallerContext,
  conv: Conversation
): boolean {
  const p = assertActiveCaller(state, caller);
  if (p.role === 'boss') return true;
  if (p.role === 'customer') return conv.customerId === p.id;
  if (p.role === 'employee') {
    if (state.appSettings.employeeInboxScope === 'all') return true;
    return conv.handledBy === p.id;
  }
  return false;
}

function stripStaffIdentityFromOfferForCustomer(offer: Offer): Offer {
  return {
    ...offer,
    handledBy: null,
    handledByName: null
  };
}

function stripStaffIdentityFromTicketForCustomer(
  state: MockDatabaseState,
  ticket: Ticket
): Ticket {
  const canShowAlias = state.appSettings.customerCanPickEmployee;
  return {
    ...ticket,
    assignedEmployeeId: null,
    assignedEmployeeName: null,
    assignedEmployeeAlias: canShowAlias ? ticket.assignedEmployeeAlias ?? null : null
  };
}

export class MockDataRepository implements DataRepository {
  readonly mode = 'mock' as const;

  async getProfileById(userId: string): Promise<Profile | null> {
    const state = getState();
    const found = state.profiles.find((p) => p.id === userId);
    return found ? { ...found } : null;
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const state = getState();
    const clean = email.trim().toLowerCase();
    const found = state.profiles.find((p) => p.email.toLowerCase() === clean);
    return found ? { ...found } : null;
  }

  async listAllProfiles(caller: CallerContext): Promise<Profile[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    if (p.role === 'customer') {
      return state.profiles.filter((x) => x.id === p.id).map((x) => ({ ...x }));
    }
    return state.profiles.map((x) => ({ ...x }));
  }

  async listEmployeesWithFlags(caller: CallerContext): Promise<EmployeeWithFlags[]> {
    const state = getState();
    assertStaff(state, caller);
    return getEmployeesWithFlagsFromState(state);
  }

  async getSelectableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    const state = getState();
    assertActiveCaller(state, caller);
    if (!state.appSettings.customerCanPickEmployee && caller.role === 'customer') {
      return [];
    }
    return state.staffProfiles
      .filter((sp) => {
        const prof = state.profiles.find((p) => p.id === sp.userId);
        return (
          prof &&
          prof.role === 'employee' &&
          prof.status === 'active' &&
          sp.customerSelectable &&
          sp.acceptsTickets
        );
      })
      .map((sp) => ({
        staffId: sp.userId,
        publicAlias: sp.publicAlias
      }));
  }

  async listReportableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    const state = getState();
    assertActiveCaller(state, caller);
    return state.staffProfiles
      .filter((sp) => {
        const prof = state.profiles.find((p) => p.id === sp.userId);
        return prof && prof.role === 'employee' && prof.status === 'active' && sp.acceptsTickets;
      })
      .map((sp) => ({
        staffId: sp.userId,
        publicAlias: sp.publicAlias
      }));
  }

  async updateCustomerOwnProfile(
    caller: CallerContext,
    input: { fullName: string; email: string; phone: string }
  ): Promise<Profile> {
    const state = getState();
    const p = assertCustomer(state, caller);
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanPhone = input.phone.trim();

    const emailConflict = state.profiles.find(
      (other) => other.id !== p.id && other.email.toLowerCase() === cleanEmail
    );
    if (emailConflict) {
      throw new Error('CONFLICT: Email address is already in use.');
    }

    const phoneConflict = state.profiles.find(
      (other) => other.id !== p.id && other.phone === cleanPhone
    );
    if (phoneConflict) {
      throw new Error('CONFLICT: Phone number is already in use.');
    }

    p.fullName = input.fullName.trim();
    p.email = cleanEmail;
    p.phone = cleanPhone;

    const conv = state.conversations.find((c) => c.customerId === p.id);
    if (conv) {
      conv.customerName = p.fullName;
      conv.customerEmail = p.email;
    }

    saveState(state);
    return { ...p };
  }

  async changeCustomerPassword(
    caller: CallerContext,
    input: { currentPassword?: string; newPassword: string }
  ): Promise<void> {
    const state = getState();
    const p = assertCustomer(state, caller);
    if (!state.customerPasswords) {
      state.customerPasswords = {};
    }
    const existingPassword = state.customerPasswords[p.id];
    if (
      existingPassword &&
      input.currentPassword &&
      input.currentPassword !== existingPassword
    ) {
      throw new Error('INVALID_PASSWORD: Current password does not match.');
    }
    const formatCheck = validateBasicPasswordFormat(input.newPassword);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error);
    }
    state.customerPasswords[p.id] = input.newPassword;

    state.auditLogs.unshift({
      id: `aud-${Date.now()}-pwd`,
      actorId: p.id,
      actorName: p.fullName,
      action: 'customer_password_changed',
      entity: 'profiles',
      entityId: p.id,
      beforeMeta: null,
      afterMeta: { passwordUpdated: true },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    });

    saveState(state);
  }

  async verifyEmailOtpAndSetPassword(input: {
    email: string;
    otpCode: string;
    password: string;
    fullName?: string;
    phone?: string;
  }): Promise<Profile> {
    const state = getState();
    const cleanEmail = input.email.trim().toLowerCase();
    const cleanOtp = input.otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      throw new Error('INVALID_OTP: Invalid or expired email OTP code.');
    }
    const nowIso = new Date().toISOString();
    const profile = state.profiles.find((p) => p.email.toLowerCase() === cleanEmail);

    // Only pre-invited, not-yet-approved customers may verify. Never create accounts here,
    // and use one generic error so the form cannot be used to discover registered emails.
    if (
      !profile ||
      profile.role !== 'customer' ||
      (profile.status !== 'invited' && profile.status !== 'pending_approval')
    ) {
      throw new Error('INVALID_OTP: Invalid or expired email OTP code.');
    }

    const formatCheck = validateBasicPasswordFormat(input.password);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error);
    }

    // After a customer verifies their email OTP and sets a password, their status becomes PENDING_APPROVAL instead of ACTIVE
    profile.status = 'pending_approval';
    if (input.fullName?.trim()) {
      profile.fullName = input.fullName.trim();
    }
    if (input.phone?.trim()) {
      profile.phone = input.phone.trim();
    }

    if (!state.customerPasswords) {
      state.customerPasswords = {};
    }
    state.customerPasswords[profile.id] = input.password;

    const inv = state.invitations.find(
      (i) => i.email.toLowerCase() === cleanEmail && i.status === 'pending'
    );
    if (inv) {
      inv.status = 'accepted';
      inv.acceptedAt = nowIso;
    }

    saveState(state);
    return { ...profile };
  }

  async authenticateWithPassword(input: {
    email: string;
    password: string;
  }): Promise<PasswordAuthResult> {
    const state = getState();
    const cleanId = input.email.trim().toLowerCase();
    const profile = state.profiles.find(
      (p) =>
        p.email.toLowerCase() === cleanId ||
        p.username?.toLowerCase() === cleanId ||
        (p.role !== 'customer' && p.fullName.toLowerCase() === cleanId)
    );

    if (!profile) {
      return {
        ok: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email or password.'
      };
    }

    const storedPassword = state.customerPasswords?.[profile.id];
    if (!storedPassword || storedPassword !== input.password) {
      // Do NOT reveal whether the email/username is registered or pending approval when password is wrong
      return {
        ok: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email or password.'
      };
    }

    if (profile.status === 'pending_approval' || profile.status === 'invited') {
      return {
        ok: false,
        code: 'PENDING_APPROVAL',
        error: 'Your account is awaiting approval. You will receive an email once approved.'
      };
    }

    if (profile.status === 'rejected') {
      return {
        ok: false,
        code: 'ACCOUNT_REJECTED',
        error: 'Unable to sign in with these credentials.'
      };
    }

    if (profile.status === 'suspended') {
      return {
        ok: false,
        code: 'ACCOUNT_SUSPENDED',
        error: 'This account has been suspended by administration.'
      };
    }

    profile.lastSeenAt = new Date().toISOString();
    saveState(state);
    return {
      ok: true,
      code: 'SUCCESS',
      profile: { ...profile }
    };
  }

  async adminSetUserPassword(
    caller: CallerContext,
    input: {
      targetUserId: string;
      newPassword: string;
      newUsername?: string;
    }
  ): Promise<Profile> {
    const state = getState();
    const boss = assertBoss(state, caller);

    const target = state.profiles.find((p) => p.id === input.targetUserId);
    if (!target) {
      throw new Error('NOT_FOUND: Target user not found.');
    }

    const cleanPassword = input.newPassword.trim();
    if (!cleanPassword) {
      throw new Error('INVALID_PASSWORD: Password cannot be empty.');
    }

    // Basic password format is compulsory for Employees and Customers, NOT for BOKA (boss)
    if (target.role !== 'boss') {
      const formatCheck = validateBasicPasswordFormat(cleanPassword);
      if (!formatCheck.valid) {
        throw new Error(formatCheck.error);
      }
    }

    if (!state.customerPasswords) {
      state.customerPasswords = {};
    }
    state.customerPasswords[target.id] = cleanPassword;

    if (input.newUsername?.trim()) {
      target.username = input.newUsername.trim();
    }

    state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'admin_set_user_password',
      entity: 'profiles',
      entityId: target.id,
      beforeMeta: null,
      afterMeta: {
        targetRole: target.role,
        targetName: target.fullName,
        username: target.username ?? null,
        passwordUpdatedByBoss: true
      },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    });

    saveState(state);
    return { ...target };
  }

  async inviteUser(
    caller: CallerContext,
    input: {
      email: string;
      fullName: string;
      phone?: string;
      intendedRole: 'customer' | 'employee';
      publicAlias?: string;
      username?: string;
      initialPassword?: string;
    }
  ): Promise<{ invitation: Invitation; profile: Profile }> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);

    // Decision 3: Customers cannot invite anyone. Employees can invite customers only. Boss can invite customers and employees.
    if (actor.role === 'customer') {
      throw new Error('FORBIDDEN: Customers cannot invite anyone.');
    }
    if (actor.role === 'employee' && input.intendedRole !== 'customer') {
      throw new Error('FORBIDDEN: Employees can invite customers only (never employees or a boss).');
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const existing = state.profiles.find((p) => p.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error('CONFLICT: A user with this email already exists.');
    }

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const newId = `${input.intendedRole === 'employee' ? 'emp' : 'cust'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (input.initialPassword?.trim()) {
      const formatCheck = validateBasicPasswordFormat(input.initialPassword.trim());
      if (!formatCheck.valid) {
        throw new Error(formatCheck.error);
      }
    }

    const newProfile: Profile = {
      id: newId,
      role: input.intendedRole,
      status: 'pending_approval',
      username: input.username?.trim() || input.publicAlias?.trim() || cleanEmail.split('@')[0],
      fullName: input.fullName.trim(),
      email: cleanEmail,
      phone: input.phone?.trim() || null,
      avatarPath: null,
      invitedBy: actor.id,
      approvedBy: null,
      approvedAt: null,
      createdAt: nowIso,
      lastSeenAt: null
    };
    state.profiles.push(newProfile);

    if (input.initialPassword?.trim()) {
      if (!state.customerPasswords) state.customerPasswords = {};
      state.customerPasswords[newId] = input.initialPassword.trim();
    }

    if (input.intendedRole === 'employee') {
      const alias =
        input.publicAlias?.trim() ||
        `${input.fullName.trim().split(' ')[0]}-${state.staffProfiles.length + 1}`;
      state.staffProfiles.push({
        userId: newId,
        publicAlias: alias,
        customerSelectable: false,
        acceptsTickets: true,
        canManageProducts: false,
        canPublishStories: false,
        canPostCustomerAnnouncements: false,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      state.staffThreads.push({
        id: `sthread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employeeId: newId,
        employeeName: newProfile.fullName,
        employeeAlias: alias,
        lastMessageAt: null,
        lastMessagePreview: null,
        createdAt: nowIso
      });
    } else {
      // Customer invited by employee or boss starts unassigned and visible to all staff
      state.conversations.push({
        id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        customerId: newId,
        customerName: newProfile.fullName,
        customerEmail: newProfile.email,
        handledBy: null,
        handledByName: null,
        handledByAlias: null,
        awaitingStaff: false,
        lastMessageAt: nowIso,
        lastMessagePreview: 'Account invited — ready for support chat.',
        customerLastReadAt: null,
        staffLastReadAt: null,
        customerUnreadCount: 0,
        staffUnreadCount: 0,
        createdAt: nowIso
      });
    }

    const invitation: Invitation = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: cleanEmail,
      intendedRole: input.intendedRole,
      fullName: newProfile.fullName,
      phone: newProfile.phone,
      invitedBy: actor.id,
      invitedByName: actor.fullName,
      status: 'pending',
      createdAt: nowIso,
      expiresAt: expiresIso,
      acceptedAt: null
    };
    state.invitations.unshift(invitation);

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'invite_user',
      entity: 'invitations',
      entityId: invitation.id,
      beforeMeta: null,
      afterMeta: {
        email: cleanEmail,
        intendedRole: input.intendedRole,
        invitedBy: actor.id,
        profileId: newProfile.id
      },
      ip: '127.0.0.1',
      createdAt: nowIso
    });

    state.activityEvents.unshift({
      id: `act-${Date.now()}`,
      occurredAt: nowIso,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      eventType: 'user_invited',
      customerId: input.intendedRole === 'customer' ? newProfile.id : null,
      conversationId: null,
      ticketId: null,
      offerId: null,
      messageId: null,
      meta: { email: cleanEmail, intended_role: input.intendedRole }
    });

    saveState(state);
    return { invitation: { ...invitation }, profile: { ...newProfile } };
  }

  async listInvitations(caller: CallerContext): Promise<Invitation[]> {
    const state = getState();
    assertStaff(state, caller);
    return state.invitations.map((i) => ({ ...i }));
  }

  async listPendingCustomers(caller: CallerContext): Promise<Profile[]> {
    const state = getState();
    assertStaff(state, caller);
    return state.profiles
      .filter((p) => p.role === 'customer' && p.status === 'pending_approval')
      .map((p) => ({ ...p }));
  }

  async reviewPendingUser(
    caller: CallerContext,
    input: {
      targetUserId: string;
      decision: 'approve' | 'reject';
      note?: string;
    }
  ): Promise<{ profile: Profile; emailNotice: OutboundEmailNotice }> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);

    if (actor.role === 'customer') {
      throw new Error('FORBIDDEN: Customers cannot approve or reject anyone.');
    }

    const target = state.profiles.find((p) => p.id === input.targetUserId);
    if (!target) {
      throw new Error('NOT_FOUND: Target user not found.');
    }

    if (target.role === 'boss') {
      throw new Error('FORBIDDEN: Cannot modify Boss account approval.');
    }

    // Employee approval stays Boka-only. Employees cannot approve other employees.
    if (target.role === 'employee' && actor.role !== 'boss') {
      throw new Error(
        'FORBIDDEN: Employee approval is BOKA-only. Employees cannot approve or reject other employees.'
      );
    }

    if (target.status !== 'pending_approval' && target.status !== 'invited') {
      throw new Error(
        `INVALID_STATUS: User is currently "${target.status}" and is not awaiting first-login approval.`
      );
    }

    const prevStatus = target.status;
    const nowIso = new Date().toISOString();

    let emailNotice: OutboundEmailNotice;
    if (input.decision === 'approve') {
      target.status = 'active';
      target.approvedBy = actor.id;
      target.approvedAt = nowIso;

      emailNotice = {
        id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        to: target.email,
        subject: 'Your John Rambo Account is Active',
        body: `Hello ${target.fullName}, your account has been approved and is now active. You may now sign in.`,
        kind: target.role === 'customer' ? 'customer_approved' : 'employee_approved',
        sentAt: nowIso
      };
    } else {
      target.status = 'rejected';

      emailNotice = {
        id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        to: target.email,
        subject: 'John Rambo Account Notice',
        body: 'Thank you for your interest. We are unable to complete your account registration at this time.',
        kind: target.role === 'customer' ? 'customer_rejected' : 'employee_rejected',
        sentAt: nowIso
      };
    }

    if (!state.sentEmails) {
      state.sentEmails = [];
    }
    state.sentEmails.unshift(emailNotice);

    const auditAction =
      input.decision === 'approve'
        ? target.role === 'customer'
          ? 'customer_approved'
          : 'employee_approved'
        : target.role === 'customer'
          ? 'customer_rejected'
          : 'employee_rejected';

    state.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actorId: actor.id,
      actorName: actor.fullName,
      action: auditAction,
      entity: 'profiles',
      entityId: target.id,
      beforeMeta: { status: prevStatus },
      afterMeta: {
        status: target.status,
        decision: input.decision,
        approvedBy: actor.id,
        approvedByName: actor.fullName,
        targetRole: target.role,
        note: input.note ?? null
      },
      ip: '127.0.0.1',
      createdAt: nowIso
    });

    saveState(state);
    return {
      profile: { ...target },
      emailNotice: { ...emailNotice }
    };
  }

  async listSentEmails(caller: CallerContext): Promise<OutboundEmailNotice[]> {
    const state = getState();
    assertStaff(state, caller);
    return (state.sentEmails ?? []).map((e) => ({ ...e }));
  }

  async setUserStatus(
    caller: CallerContext,
    targetUserId: string,
    newStatus: UserStatus
  ): Promise<Profile> {
    const state = getState();
    const boss = assertBoss(state, caller);
    const target = state.profiles.find((p) => p.id === targetUserId);
    if (!target) {
      throw new Error('NOT_FOUND: Target user not found.');
    }
    if (target.role === 'boss') {
      throw new Error('FORBIDDEN: Cannot suspend the singleton Boss account.');
    }
    // Approval happens once: suspending/unsuspending never sends an approved account back to pending_approval
    if (
      newStatus === 'pending_approval' &&
      (target.approvedAt || target.status === 'active' || target.status === 'suspended')
    ) {
      throw new Error(
        'INVALID_STATUS: Approval happens once. Suspending or unsuspending cannot send a user back to the approval queue.'
      );
    }

    const prevStatus = target.status;
    target.status = newStatus;

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'user_status_changed',
      entity: 'profiles',
      entityId: target.id,
      beforeMeta: { status: prevStatus },
      afterMeta: { status: newStatus },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    });

    saveState(state);
    return { ...target };
  }

  async updateStaffFlags(
    caller: CallerContext,
    input: {
      employeeId: string;
      publicAlias: string;
      customerSelectable: boolean;
      acceptsTickets: boolean;
      canManageProducts: boolean;
      canPublishStories: boolean;
      canPostCustomerAnnouncements: boolean;
    }
  ): Promise<EmployeeWithFlags> {
    const state = getState();
    const boss = assertBoss(state, caller);

    const emp = state.profiles.find((p) => p.id === input.employeeId && p.role === 'employee');
    if (!emp) {
      throw new Error('NOT_FOUND: Employee not found.');
    }

    const sp = state.staffProfiles.find((s) => s.userId === emp.id);
    if (!sp) {
      throw new Error('NOT_FOUND: Staff profile not found.');
    }

    const before = { ...sp };
    sp.publicAlias = input.publicAlias.trim();
    sp.customerSelectable = input.customerSelectable;
    sp.acceptsTickets = input.acceptsTickets;
    sp.canManageProducts = input.canManageProducts;
    sp.canPublishStories = input.canPublishStories;
    sp.canPostCustomerAnnouncements = input.canPostCustomerAnnouncements;
    sp.updatedAt = new Date().toISOString();

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'update_staff_flags',
      entity: 'staff_profiles',
      entityId: emp.id,
      beforeMeta: before as unknown as Record<string, unknown>,
      afterMeta: { ...sp } as unknown as Record<string, unknown>,
      ip: '127.0.0.1',
      createdAt: sp.updatedAt
    });

    saveState(state);
    return {
      ...emp,
      staffProfile: { ...sp }
    };
  }

  async getAppSettings(caller: CallerContext): Promise<AppSettings> {
    const state = getState();
    assertActiveCaller(state, caller);
    return { ...state.appSettings };
  }

  async updateAppSettings(
    caller: CallerContext,
    input: Partial<Omit<AppSettings, 'updatedBy' | 'updatedAt'>>
  ): Promise<AppSettings> {
    const state = getState();
    const boss = assertBoss(state, caller);
    const before = { ...state.appSettings };

    state.appSettings = {
      ...state.appSettings,
      ...input,
      updatedBy: boss.id,
      updatedAt: new Date().toISOString()
    };

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'update_app_settings',
      entity: 'app_settings',
      entityId: 'singleton',
      beforeMeta: before as unknown as Record<string, unknown>,
      afterMeta: { ...state.appSettings } as unknown as Record<string, unknown>,
      ip: '127.0.0.1',
      createdAt: state.appSettings.updatedAt
    });

    saveState(state);
    return { ...state.appSettings };
  }

  async listProducts(caller: CallerContext): Promise<Product[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    // Permission Matrix: Customers only read 'available' products (never 'hidden')
    if (p.role === 'customer') {
      return state.products.filter((prod) => prod.status === 'available').map((x) => ({ ...x }));
    }
    return state.products.map((x) => ({ ...x }));
  }

  async getProductById(caller: CallerContext, productId: string): Promise<Product | null> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const prod = state.products.find((x) => x.id === productId);
    if (!prod) return null;
    if (p.role === 'customer' && prod.status !== 'available') {
      return null;
    }
    return { ...prod };
  }

  async upsertProduct(
    caller: CallerContext,
    input: {
      id?: string;
      gameName: string;
      title: string;
      pointsQty: number;
      description: string;
      imagePath?: string | null;
      pricePaise: number;
      status: ProductStatus;
    }
  ): Promise<Product> {
    const state = getState();
    if (!hasStaffFlag(state, caller, 'canManageProducts')) {
      throw new Error('FORBIDDEN: Caller lacks can_manage_products permission.');
    }
    const nowIso = new Date().toISOString();

    if (input.id) {
      const existing = state.products.find((p) => p.id === input.id);
      if (!existing) {
        throw new Error('NOT_FOUND: Product not found.');
      }
      const before = { ...existing };
      existing.gameName = input.gameName.trim();
      existing.title = input.title.trim();
      existing.pointsQty = input.pointsQty;
      existing.description = input.description.trim();
      existing.imagePath = input.imagePath ?? existing.imagePath;
      existing.pricePaise = input.pricePaise;
      existing.status = input.status;
      existing.updatedAt = nowIso;

      state.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        actorId: caller.userId,
        action: 'update_product',
        entity: 'products',
        entityId: existing.id,
        beforeMeta: { pricePaise: before.pricePaise, status: before.status },
        afterMeta: { pricePaise: existing.pricePaise, status: existing.status },
        ip: '127.0.0.1',
        createdAt: nowIso
      });
      saveState(state);
      return { ...existing };
    }

    const created: Product = {
      id: `prod-${Date.now()}`,
      gameName: input.gameName.trim(),
      title: input.title.trim(),
      pointsQty: input.pointsQty,
      description: input.description.trim(),
      imagePath: input.imagePath ?? '/icons/icon-512.svg',
      pricePaise: input.pricePaise,
      status: input.status,
      createdBy: caller.userId,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    state.products.unshift(created);

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: caller.userId,
      action: 'create_product',
      entity: 'products',
      entityId: created.id,
      beforeMeta: null,
      afterMeta: { title: created.title, pricePaise: created.pricePaise, status: created.status },
      ip: '127.0.0.1',
      createdAt: nowIso
    });

    saveState(state);
    return { ...created };
  }

  async listConversations(caller: CallerContext): Promise<Conversation[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const visible = state.conversations.filter((c) => canAccessConversation(state, caller, c));
    if (p.role === 'customer') {
      // Customer never sees staff handler details
      return visible.map((c) => ({
        ...c,
        handledBy: null,
        handledByName: null,
        handledByAlias: null
      }));
    }
    return visible.map((c) => ({ ...c }));
  }

  async getCustomerConversation(
    caller: CallerContext,
    conversationId?: string
  ): Promise<Conversation | null> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const conv = conversationId
      ? state.conversations.find((c) => c.id === conversationId)
      : state.conversations.find((c) => c.customerId === p.id);
    if (!conv) return null;
    if (!canAccessConversation(state, caller, conv)) {
      throw new Error('FORBIDDEN: Conversation outside caller scope.');
    }
    if (p.role === 'customer') {
      return {
        ...conv,
        handledBy: null,
        handledByName: null,
        handledByAlias: null
      };
    }
    return { ...conv };
  }

  async listCustomerMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<CustomerMessageView[]> {
    const state = getState();
    assertActiveCaller(state, caller);
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv || !canAccessConversation(state, caller, conv)) {
      throw new Error('FORBIDDEN: Cannot read messages for this conversation.');
    }

    return state.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => {
        const offer = m.offerId ? state.offers.find((o) => o.id === m.offerId) ?? null : null;
        return {
          id: m.id,
          conversationId: m.conversationId,
          senderKind: m.senderKind,
          senderDisplayName:
            m.senderKind === 'staff'
              ? 'John Rambo Support'
              : m.senderKind === 'system'
                ? 'System'
                : conv.customerName,
          customerSenderId: m.senderKind === 'customer' ? m.customerSenderId : null,
          type: m.type,
          body: m.body,
          offerId: m.offerId,
          offerSnapshot: offer ? stripStaffIdentityFromOfferForCustomer(offer) : null,
          clientMsgId: m.clientMsgId,
          createdAt: m.createdAt
        };
      });
  }

  async listStaffMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<StaffMessageView[]> {
    const state = getState();
    assertStaff(state, caller);
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv || !canAccessConversation(state, caller, conv)) {
      throw new Error('FORBIDDEN: Conversation outside staff scope.');
    }

    return state.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => {
        const attr = state.messageAttributions.find((a) => a.messageId === m.id);
        const staffProf = attr ? state.profiles.find((p) => p.id === attr.staffId) : null;
        const staffFlags = attr ? state.staffProfiles.find((s) => s.userId === attr.staffId) : null;
        const offer = m.offerId ? state.offers.find((o) => o.id === m.offerId) ?? null : null;

        return {
          id: m.id,
          conversationId: m.conversationId,
          senderKind: m.senderKind,
          senderDisplayName:
            m.senderKind === 'staff'
              ? 'John Rambo Support'
              : m.senderKind === 'system'
                ? 'System'
                : conv.customerName,
          customerSenderId: m.senderKind === 'customer' ? m.customerSenderId : null,
          type: m.type,
          body: m.body,
          offerId: m.offerId,
          offerSnapshot: offer ? { ...offer } : null,
          clientMsgId: m.clientMsgId,
          createdAt: m.createdAt,
          attributedStaffId: attr?.staffId ?? null,
          attributedStaffName: staffProf?.fullName ?? null,
          attributedStaffAlias: staffFlags?.publicAlias ?? null
        };
      });
  }

  async sendCustomerMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<CustomerMessageView> {
    const state = getState();
    const customer = assertCustomer(state, caller);
    const conv = state.conversations.find((c) => c.id === input.conversationId);
    if (!conv || conv.customerId !== customer.id) {
      throw new Error('FORBIDDEN: Customers can only message in their own conversation.');
    }

    const rl = checkRateLimit(`msg:${customer.id}`, RATE_LIMIT_PRESETS.SEND_MESSAGE);
    if (!rl.allowed) {
      throw new Error('RATE_LIMITED: Too many messages sent. Please wait a moment.');
    }

    // Idempotency check on (conversationId, clientMsgId)
    const duplicate = state.messages.find(
      (m) => m.conversationId === conv.id && m.clientMsgId === input.clientMsgId
    );
    if (duplicate) {
      return {
        id: duplicate.id,
        conversationId: duplicate.conversationId,
        senderKind: 'customer',
        senderDisplayName: customer.fullName,
        customerSenderId: customer.id,
        type: duplicate.type,
        body: duplicate.body,
        offerId: duplicate.offerId,
        clientMsgId: duplicate.clientMsgId,
        createdAt: duplicate.createdAt
      };
    }

    const nowIso = new Date().toISOString();
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanBody = input.body.trim();

    state.messages.push({
      id: msgId,
      conversationId: conv.id,
      senderKind: 'customer',
      customerSenderId: customer.id,
      type: 'text',
      body: cleanBody,
      offerId: null,
      clientMsgId: input.clientMsgId,
      createdAt: nowIso
    });

    conv.awaitingStaff = true;
    conv.lastMessageAt = nowIso;
    conv.lastMessagePreview = cleanBody.slice(0, 120);
    conv.staffUnreadCount += 1;

    state.activityEvents.unshift({
      id: `act-${Date.now()}-cmsg`,
      occurredAt: nowIso,
      actorId: customer.id,
      actorName: customer.fullName,
      actorRole: 'customer',
      eventType: 'customer_message_sent',
      customerId: customer.id,
      conversationId: conv.id,
      ticketId: null,
      offerId: null,
      messageId: msgId,
      meta: {}
    });

    // Notify handler (or all staff if unassigned)
    const recipients = conv.handledBy
      ? [conv.handledBy, 'boss-1']
      : state.profiles.filter((p) => p.role !== 'customer' && p.status === 'active').map((p) => p.id);

    for (const rid of new Set(recipients)) {
      state.notifications.unshift({
        id: `notif-${Date.now()}-${rid}`,
        recipientId: rid,
        type: 'customer_message',
        title: `New message from ${customer.fullName}`,
        body: cleanBody.slice(0, 100),
        link: rid === 'boss-1' ? '/boss/inbox' : '/employee/inbox',
        payload: { conversationId: conv.id, messageId: msgId },
        readAt: null,
        createdAt: nowIso
      });
    }

    saveState(state);
    return {
      id: msgId,
      conversationId: conv.id,
      senderKind: 'customer',
      senderDisplayName: customer.fullName,
      customerSenderId: customer.id,
      type: 'text',
      body: cleanBody,
      offerId: null,
      clientMsgId: input.clientMsgId,
      createdAt: nowIso
    };
  }

  async sendStaffMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<StaffMessageView> {
    const state = getState();
    const staff = assertStaff(state, caller);
    const conv = state.conversations.find((c) => c.id === input.conversationId);
    if (!conv || !canAccessConversation(state, caller, conv)) {
      throw new Error('FORBIDDEN: Staff member does not have access to this conversation.');
    }

    const staffFlags = state.staffProfiles.find((s) => s.userId === staff.id);
    const duplicate = state.messages.find(
      (m) => m.conversationId === conv.id && m.clientMsgId === input.clientMsgId
    );
    if (duplicate) {
      return {
        id: duplicate.id,
        conversationId: duplicate.conversationId,
        senderKind: 'staff',
        senderDisplayName: 'John Rambo Support',
        customerSenderId: null,
        type: duplicate.type,
        body: duplicate.body,
        offerId: duplicate.offerId,
        clientMsgId: duplicate.clientMsgId,
        createdAt: duplicate.createdAt,
        attributedStaffId: staff.id,
        attributedStaffName: staff.fullName,
        attributedStaffAlias: staffFlags?.publicAlias ?? null
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanBody = input.body.trim();

    // Calculate first response time if conversation was awaiting staff
    const wasAwaitingStaff = conv.awaitingStaff;
    let firstResponseSec: number | undefined;
    if (wasAwaitingStaff && conv.lastMessageAt) {
      firstResponseSec = Math.max(
        1,
        Math.round((now.getTime() - new Date(conv.lastMessageAt).getTime()) / 1000)
      );
    }

    // 1. Insert message with customerSenderId = null
    state.messages.push({
      id: msgId,
      conversationId: conv.id,
      senderKind: 'staff',
      customerSenderId: null,
      type: 'text',
      body: cleanBody,
      offerId: null,
      clientMsgId: input.clientMsgId,
      createdAt: nowIso
    });

    // 2. Insert message_attribution in the same transaction
    state.messageAttributions.push({
      messageId: msgId,
      staffId: staff.id,
      createdAt: nowIso
    });

    // 3. Claim/update handler and clear awaiting_staff
    if (!conv.handledBy && staff.role === 'employee') {
      conv.handledBy = staff.id;
      conv.handledByName = staff.fullName;
      conv.handledByAlias = staffFlags?.publicAlias ?? null;
    }
    conv.awaitingStaff = false;
    conv.lastMessageAt = nowIso;
    conv.lastMessagePreview = cleanBody.slice(0, 120);
    conv.customerUnreadCount += 1;

    // 4. Write activity_events
    state.activityEvents.unshift({
      id: `act-${Date.now()}-smsg`,
      occurredAt: nowIso,
      actorId: staff.id,
      actorName: staff.fullName,
      actorRole: staff.role,
      eventType: 'staff_chat_reply',
      customerId: conv.customerId,
      conversationId: conv.id,
      ticketId: null,
      offerId: null,
      messageId: msgId,
      meta: {
        is_first_response: wasAwaitingStaff,
        ...(firstResponseSec !== undefined ? { first_response_seconds: firstResponseSec } : {})
      }
    });

    // 5. Notify customer as "John Rambo Support" (never leaking staff identity)
    state.notifications.unshift({
      id: `notif-${Date.now()}-${conv.customerId}`,
      recipientId: conv.customerId,
      type: 'staff_reply',
      title: 'New reply from John Rambo Support',
      body: cleanBody.slice(0, 100),
      link: '/chat',
      payload: { conversationId: conv.id, messageId: msgId },
      readAt: null,
      createdAt: nowIso
    });

    saveState(state);
    return {
      id: msgId,
      conversationId: conv.id,
      senderKind: 'staff',
      senderDisplayName: 'John Rambo Support',
      customerSenderId: null,
      type: 'text',
      body: cleanBody,
      offerId: null,
      clientMsgId: input.clientMsgId,
      createdAt: nowIso,
      attributedStaffId: staff.id,
      attributedStaffName: staff.fullName,
      attributedStaffAlias: staffFlags?.publicAlias ?? null
    };
  }

  async reassignConversationHandler(
    caller: CallerContext,
    conversationId: string,
    employeeId: string | null
  ): Promise<Conversation> {
    const state = getState();
    const boss = assertBoss(state, caller);
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv) {
      throw new Error('NOT_FOUND: Conversation not found.');
    }

    const prevHandler = conv.handledBy;
    if (employeeId) {
      const emp = state.profiles.find((p) => p.id === employeeId && p.role === 'employee');
      const sp = state.staffProfiles.find((s) => s.userId === employeeId);
      if (!emp) throw new Error('NOT_FOUND: Target employee not found.');
      conv.handledBy = emp.id;
      conv.handledByName = emp.fullName;
      conv.handledByAlias = sp?.publicAlias ?? null;
    } else {
      conv.handledBy = null;
      conv.handledByName = null;
      conv.handledByAlias = null;
    }

    state.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'reassign_conversation',
      entity: 'conversations',
      entityId: conv.id,
      beforeMeta: { handledBy: prevHandler },
      afterMeta: { handledBy: conv.handledBy },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    });

    saveState(state);
    return { ...conv };
  }

  async markConversationRead(caller: CallerContext, conversationId: string): Promise<void> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv || !canAccessConversation(state, caller, conv)) return;
    const nowIso = new Date().toISOString();
    if (p.role === 'customer') {
      conv.customerLastReadAt = nowIso;
      conv.customerUnreadCount = 0;
    } else {
      conv.staffLastReadAt = nowIso;
      conv.staffUnreadCount = 0;
    }
    saveState(state);
  }

  async listOffers(caller: CallerContext): Promise<Offer[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    if (p.role === 'customer') {
      return state.offers
        .filter((o) => o.customerId === p.id)
        .map((o) => stripStaffIdentityFromOfferForCustomer(o));
    }
    if (p.role === 'employee' && state.appSettings.employeeInboxScope === 'assigned_only') {
      return state.offers
        .filter((o) => {
          const conv = state.conversations.find((c) => c.id === o.conversationId);
          return conv?.handledBy === p.id || o.handledBy === p.id;
        })
        .map((o) => ({ ...o }));
    }
    return state.offers.map((o) => ({ ...o }));
  }

  async listOfferEvents(caller: CallerContext, offerId: string): Promise<OfferEvent[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const offer = state.offers.find((o) => o.id === offerId);
    if (!offer) throw new Error('NOT_FOUND: Offer not found.');
    if (p.role === 'customer' && offer.customerId !== p.id) {
      throw new Error('FORBIDDEN: Cannot read another customer offer events.');
    }
    return state.offerEvents
      .filter((e) => e.offerId === offerId)
      .map((e) => ({
        ...e,
        actorId: p.role === 'customer' && e.actorId !== p.id ? 'staff-anon' : e.actorId
      }));
  }

  async submitOffer(
    caller: CallerContext,
    input: { productId: string; offeredPricePaise: number; clientMsgId: string }
  ): Promise<{ offer: Offer; message: CustomerMessageView }> {
    const state = getState();
    const customer = assertCustomer(state, caller);

    const rl = checkRateLimit(`offer:${customer.id}`, RATE_LIMIT_PRESETS.SUBMIT_OFFER);
    if (!rl.allowed) {
      throw new Error('RATE_LIMITED: Maximum offer submissions reached for this hour.');
    }

    const product = state.products.find((p) => p.id === input.productId);
    if (!product || product.status !== 'available') {
      throw new Error('INVALID_PRODUCT: Product is not available for offers.');
    }

    if (
      !Number.isInteger(input.offeredPricePaise) ||
      input.offeredPricePaise < 100 ||
      input.offeredPricePaise > state.appSettings.offerSanityMaxPaise ||
      input.offeredPricePaise > product.pricePaise * 2
    ) {
      throw new Error(
        `INVALID_AMOUNT: Offer must be a positive integer in paise between ₹1 and ${formatPaiseToINR(
          Math.min(state.appSettings.offerSanityMaxPaise, product.pricePaise * 2)
        )}.`
      );
    }

    const conv = state.conversations.find((c) => c.customerId === customer.id);
    if (!conv) {
      throw new Error('NOT_FOUND: Customer conversation not found.');
    }

    const nowIso = new Date().toISOString();
    const offerId = `offer-${Date.now()}`;
    const msgId = `msg-${Date.now()}-offer`;

    const newOffer: Offer = {
      id: offerId,
      productId: product.id,
      customerId: customer.id,
      customerName: customer.fullName,
      conversationId: conv.id,
      offeredPricePaise: input.offeredPricePaise,
      listedPricePaise: product.pricePaise,
      productTitle: product.title,
      gameName: product.gameName,
      status: 'pending',
      counterPricePaise: null,
      staffNote: null,
      handledBy: null,
      handledByName: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    state.offers.unshift(newOffer);

    const bodyText = `Submitted an offer of ${formatPaiseToINR(
      input.offeredPricePaise
    )} for ${product.title} (Listed: ${formatPaiseToINR(product.pricePaise)}).`;

    state.messages.push({
      id: msgId,
      conversationId: conv.id,
      senderKind: 'customer',
      customerSenderId: customer.id,
      type: 'offer',
      body: bodyText,
      offerId: newOffer.id,
      clientMsgId: input.clientMsgId,
      createdAt: nowIso
    });

    conv.awaitingStaff = true;
    conv.lastMessageAt = nowIso;
    conv.lastMessagePreview = bodyText.slice(0, 120);
    conv.staffUnreadCount += 1;

    state.offerEvents.push({
      id: `oe-${Date.now()}`,
      offerId: newOffer.id,
      actorId: customer.id,
      event: 'submitted',
      meta: {
        offered_price_paise: input.offeredPricePaise,
        listed_price_paise: product.pricePaise
      },
      createdAt: nowIso
    });

    state.activityEvents.unshift({
      id: `act-${Date.now()}-offer`,
      occurredAt: nowIso,
      actorId: customer.id,
      actorName: customer.fullName,
      actorRole: 'customer',
      eventType: 'offer_submitted',
      customerId: customer.id,
      conversationId: conv.id,
      ticketId: null,
      offerId: newOffer.id,
      messageId: msgId,
      meta: { offered_price_paise: input.offeredPricePaise }
    });

    // Notify all active staff
    const staffIds = state.profiles
      .filter((p) => p.role !== 'customer' && p.status === 'active')
      .map((p) => p.id);
    for (const sid of staffIds) {
      state.notifications.unshift({
        id: `notif-${Date.now()}-${sid}`,
        recipientId: sid,
        type: 'offer_submitted',
        title: `New Offer: ${formatPaiseToINR(input.offeredPricePaise)}`,
        body: `${customer.fullName} offered ${formatPaiseToINR(input.offeredPricePaise)} on ${product.title}.`,
        link: sid === 'boss-1' ? '/boss/inbox' : '/employee/offers',
        payload: { offerId: newOffer.id, conversationId: conv.id },
        readAt: null,
        createdAt: nowIso
      });
    }

    saveState(state);
    return {
      offer: stripStaffIdentityFromOfferForCustomer(newOffer),
      message: {
        id: msgId,
        conversationId: conv.id,
        senderKind: 'customer',
        senderDisplayName: customer.fullName,
        customerSenderId: customer.id,
        type: 'offer',
        body: bodyText,
        offerId: newOffer.id,
        offerSnapshot: stripStaffIdentityFromOfferForCustomer(newOffer),
        clientMsgId: input.clientMsgId,
        createdAt: nowIso
      }
    };
  }

  async respondToOffer(
    caller: CallerContext,
    input: {
      offerId: string;
      action: 'counter' | 'accept' | 'reject';
      counterPricePaise?: number;
      note?: string;
    }
  ): Promise<Offer> {
    const state = getState();
    const staff = assertStaff(state, caller);
    const offer = state.offers.find((o) => o.id === input.offerId);
    if (!offer) throw new Error('NOT_FOUND: Offer not found.');

    const conv = state.conversations.find((c) => c.id === offer.conversationId);
    if (!conv || !canAccessConversation(state, caller, conv)) {
      throw new Error('FORBIDDEN: Offer is outside staff member scope.');
    }

    if (offer.status !== 'pending' && offer.status !== 'countered') {
      throw new Error(`INVALID_OFFER_STATE: Cannot ${input.action} an offer in "${offer.status}" status.`);
    }

    const nowIso = new Date().toISOString();
    if (input.action === 'counter') {
      if (
        !input.counterPricePaise ||
        !Number.isInteger(input.counterPricePaise) ||
        input.counterPricePaise < 100 ||
        input.counterPricePaise > state.appSettings.offerSanityMaxPaise
      ) {
        throw new Error('INVALID_AMOUNT: Valid counter price in paise is required.');
      }
      offer.status = 'countered';
      offer.counterPricePaise = input.counterPricePaise;
    } else if (input.action === 'accept') {
      offer.status = 'accepted';
    } else {
      offer.status = 'rejected';
    }

    offer.staffNote = input.note?.trim() || offer.staffNote;
    offer.handledBy = staff.id;
    offer.handledByName = staff.fullName;
    offer.updatedAt = nowIso;

    const eventType =
      input.action === 'counter'
        ? 'countered'
        : input.action === 'accept'
          ? 'accepted'
          : 'rejected';

    state.offerEvents.push({
      id: `oe-${Date.now()}`,
      offerId: offer.id,
      actorId: staff.id,
      event: eventType,
      meta: {
        counter_price_paise: offer.counterPricePaise,
        note: offer.staffNote
      },
      createdAt: nowIso
    });

    const msgId = `msg-${Date.now()}-oresp`;
    const summaryText =
      input.action === 'counter'
        ? `John Rambo Support countered your offer on ${offer.productTitle} at ${formatPaiseToINR(
            offer.counterPricePaise!
          )}.`
        : input.action === 'accept'
          ? `John Rambo Support accepted your offer on ${offer.productTitle}!`
          : `John Rambo Support declined your offer on ${offer.productTitle}.`;

    state.messages.push({
      id: msgId,
      conversationId: conv.id,
      senderKind: 'staff',
      customerSenderId: null,
      type: 'offer',
      body: summaryText,
      offerId: offer.id,
      clientMsgId: `sys-offer-${Date.now()}`,
      createdAt: nowIso
    });

    state.messageAttributions.push({
      messageId: msgId,
      staffId: staff.id,
      createdAt: nowIso
    });

    conv.awaitingStaff = false;
    conv.handledBy = conv.handledBy ?? (staff.role === 'employee' ? staff.id : conv.handledBy);
    conv.lastMessageAt = nowIso;
    conv.lastMessagePreview = summaryText.slice(0, 120);
    conv.customerUnreadCount += 1;

    state.activityEvents.unshift({
      id: `act-${Date.now()}-oresp`,
      occurredAt: nowIso,
      actorId: staff.id,
      actorName: staff.fullName,
      actorRole: staff.role,
      eventType: `offer_${eventType}`,
      customerId: offer.customerId,
      conversationId: conv.id,
      ticketId: null,
      offerId: offer.id,
      messageId: msgId,
      meta: { status: offer.status, counter_price_paise: offer.counterPricePaise }
    });

    state.notifications.unshift({
      id: `notif-${Date.now()}-${offer.customerId}`,
      recipientId: offer.customerId,
      type: `offer_${eventType}`,
      title: 'Offer Update from John Rambo Support',
      body: summaryText,
      link: '/offers',
      payload: { offerId: offer.id },
      readAt: null,
      createdAt: nowIso
    });

    saveState(state);
    return { ...offer };
  }

  async withdrawOffer(caller: CallerContext, offerId: string): Promise<Offer> {
    const state = getState();
    const customer = assertCustomer(state, caller);
    const offer = state.offers.find((o) => o.id === offerId);
    if (!offer || offer.customerId !== customer.id) {
      throw new Error('FORBIDDEN: Can only withdraw your own offer.');
    }
    if (offer.status !== 'pending' && offer.status !== 'countered') {
      throw new Error('INVALID_OFFER_STATE: Only pending or countered offers can be withdrawn.');
    }

    const nowIso = new Date().toISOString();
    offer.status = 'withdrawn';
    offer.updatedAt = nowIso;

    state.offerEvents.push({
      id: `oe-${Date.now()}`,
      offerId: offer.id,
      actorId: customer.id,
      event: 'withdrawn',
      meta: {},
      createdAt: nowIso
    });

    saveState(state);
    return stripStaffIdentityFromOfferForCustomer(offer);
  }

  async acceptCounterOffer(caller: CallerContext, offerId: string): Promise<Offer> {
    const state = getState();
    const customer = assertCustomer(state, caller);
    const offer = state.offers.find((o) => o.id === offerId);
    if (!offer || offer.customerId !== customer.id) {
      throw new Error('FORBIDDEN: Can only accept counter on your own offer.');
    }
    if (offer.status !== 'countered' || !offer.counterPricePaise) {
      throw new Error('INVALID_OFFER_STATE: Offer does not have an active counter price.');
    }

    const nowIso = new Date().toISOString();
    offer.status = 'accepted';
    offer.updatedAt = nowIso;

    state.offerEvents.push({
      id: `oe-${Date.now()}`,
      offerId: offer.id,
      actorId: customer.id,
      event: 'accepted',
      meta: { accepted_counter_paise: offer.counterPricePaise },
      createdAt: nowIso
    });

    saveState(state);
    return stripStaffIdentityFromOfferForCustomer(offer);
  }

  async listTickets(caller: CallerContext): Promise<Ticket[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    if (p.role === 'customer') {
      return state.tickets
        .filter((t) => t.customerId === p.id)
        .map((t) => stripStaffIdentityFromTicketForCustomer(state, t));
    }
    // Section 7 Permission Matrix: Employees can read ALL tickets (read-only unless assigned)
    return state.tickets.map((t) => ({ ...t }));
  }

  async getTicketById(caller: CallerContext, ticketId: string): Promise<Ticket | null> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return null;
    if (p.role === 'customer') {
      if (t.customerId !== p.id) {
        throw new Error('FORBIDDEN: Customers can only view their own tickets.');
      }
      return stripStaffIdentityFromTicketForCustomer(state, t);
    }
    return { ...t };
  }

  async listCustomerTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<CustomerTicketMessageView[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    if (p.role === 'customer' && ticket.customerId !== p.id) {
      throw new Error('FORBIDDEN: Cannot read another customer ticket messages.');
    }

    return state.ticketMessages
      .filter((m) => m.ticketId === ticketId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({
        id: m.id,
        ticketId: m.ticketId,
        senderKind: m.senderKind,
        senderDisplayName:
          m.senderKind === 'staff'
            ? 'John Rambo Support'
            : m.senderKind === 'system'
              ? 'System'
              : ticket.customerName ?? 'Customer',
        customerSenderId: m.senderKind === 'customer' ? m.customerSenderId : null,
        body: m.body,
        createdAt: m.createdAt
      }));
  }

  async listStaffTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<StaffTicketMessageView[]> {
    const state = getState();
    assertStaff(state, caller);
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');

    return state.ticketMessages
      .filter((m) => m.ticketId === ticketId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => {
        const attr = state.ticketMessageAttributions.find((a) => a.ticketMessageId === m.id);
        const staffProf = attr ? state.profiles.find((p) => p.id === attr.staffId) : null;
        const staffFlags = attr ? state.staffProfiles.find((s) => s.userId === attr.staffId) : null;
        return {
          id: m.id,
          ticketId: m.ticketId,
          senderKind: m.senderKind,
          senderDisplayName:
            m.senderKind === 'staff'
              ? 'John Rambo Support'
              : m.senderKind === 'system'
                ? 'System'
                : ticket.customerName ?? 'Customer',
          customerSenderId: m.senderKind === 'customer' ? m.customerSenderId : null,
          body: m.body,
          createdAt: m.createdAt,
          attributedStaffId: attr?.staffId ?? null,
          attributedStaffName: staffProf?.fullName ?? null,
          attributedStaffAlias: staffFlags?.publicAlias ?? null
        };
      });
  }

  async listTicketEvents(caller: CallerContext, ticketId: string): Promise<TicketEvent[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    if (p.role === 'customer' && ticket.customerId !== p.id) {
      throw new Error('FORBIDDEN: Cannot read another customer ticket events.');
    }

    return state.ticketEvents
      .filter((e) => e.ticketId === ticketId)
      .map((e) => ({
        ...e,
        actorId: p.role === 'customer' && e.actorId !== p.id ? 'staff-anon' : e.actorId,
        actorDisplayName:
          p.role === 'customer' && e.actorId !== p.id ? 'John Rambo Support' : e.actorDisplayName
      }));
  }

  async createTicket(
    caller: CallerContext,
    input: {
      subject: string;
      description: string;
      category: string;
      priority: TicketPriority;
      requestedEmployeeId?: string | null;
    }
  ): Promise<Ticket> {
    const state = getState();
    const customer = assertCustomer(state, caller);

    const rl = checkRateLimit(`tkt:${customer.id}`, RATE_LIMIT_PRESETS.CREATE_TICKET);
    if (!rl.allowed) {
      throw new Error('RATE_LIMITED: Maximum ticket creations reached for this hour.');
    }

    let assignedEmpId: string | null = null;
    let assignedEmpName: string | null = null;
    let assignedEmpAlias: string | null = null;
    let initialStatus: TicketStatus = 'open';

    if (input.requestedEmployeeId) {
      const sp = state.staffProfiles.find(
        (s) => s.userId === input.requestedEmployeeId && s.acceptsTickets
      );
      const empProf = state.profiles.find(
        (p) => p.id === input.requestedEmployeeId && p.role === 'employee' && p.status === 'active'
      );
      if (!sp || !empProf) {
        throw new Error('INVALID_EMPLOYEE_SELECTION: Selected staff alias is not selectable.');
      }
      assignedEmpId = empProf.id;
      assignedEmpName = empProf.fullName;
      assignedEmpAlias = sp.publicAlias;
      initialStatus = 'assigned';
    }

    const nowIso = new Date().toISOString();
    const nextNo =
      state.tickets.reduce((max, t) => (t.ticketNo > max ? t.ticketNo : max), 1000) + 1;
    const tktId = `tkt-${Date.now()}`;

    const newTicket: Ticket = {
      id: tktId,
      ticketNo: nextNo,
      customerId: customer.id,
      customerName: customer.fullName,
      subject: input.subject.trim(),
      description: input.description.trim(),
      category: input.category,
      priority: input.priority,
      status: initialStatus,
      assignedEmployeeId: assignedEmpId,
      assignedEmployeeName: assignedEmpName,
      assignedEmployeeAlias: assignedEmpAlias,
      requestedEmployeeId: assignedEmpId,
      requestedEmployeeAlias: assignedEmpAlias,
      reopenCount: 0,
      createdAt: nowIso,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null
    };
    state.tickets.unshift(newTicket);

    state.ticketMessages.push({
      id: `tmsg-${Date.now()}`,
      ticketId: tktId,
      senderKind: 'customer',
      customerSenderId: customer.id,
      body: input.description.trim(),
      createdAt: nowIso
    });

    state.ticketEvents.push({
      id: `tev-${Date.now()}-create`,
      ticketId: tktId,
      actorId: customer.id,
      actorDisplayName: customer.fullName,
      event: 'created',
      fromValue: null,
      toValue: initialStatus,
      createdAt: nowIso
    });

    if (assignedEmpId && assignedEmpName && assignedEmpAlias) {
      state.ticketEvents.push({
        id: `tev-${Date.now()}-assign`,
        ticketId: tktId,
        actorId: customer.id,
        actorDisplayName: customer.fullName,
        event: 'assigned',
        fromValue: null,
        toValue: assignedEmpId,
        createdAt: nowIso
      });

      // Automatically create a private 3-member Complaint Chat room:
      // 1) Main Admin (Boss), 2) That Employee, 3) The Customer
      const bossProf = state.profiles.find((p) => p.role === 'boss') ?? {
        id: 'boss-1',
        fullName: 'Col. Rajesh Rathore (Boss)'
      };
      const roomId = `croom-${Date.now()}`;
      const newRoom: ComplaintChatRoom = {
        id: roomId,
        ticketId: tktId,
        ticketNo: nextNo,
        customerId: customer.id,
        customerName: customer.fullName,
        employeeId: assignedEmpId,
        employeeName: assignedEmpName,
        employeeAlias: assignedEmpAlias,
        bossId: bossProf.id,
        bossName: bossProf.fullName,
        memberIds: [bossProf.id, assignedEmpId, customer.id],
        createdAt: nowIso
      };
      if (!state.complaintChatRooms) state.complaintChatRooms = [];
      if (!state.complaintChatMessages) state.complaintChatMessages = [];
      state.complaintChatRooms.unshift(newRoom);

      state.complaintChatMessages.push({
        id: `ccmsg-${Date.now()}`,
        roomId,
        ticketId: tktId,
        senderId: customer.id,
        senderRole: 'customer',
        senderDisplayName: `${customer.fullName} (Customer)`,
        body: input.description.trim(),
        createdAt: nowIso
      });

      // Notify Boss and that Employee about the 3-member complaint room
      state.notifications.unshift(
        {
          id: `notif-${Date.now()}-boss-croom`,
          recipientId: bossProf.id,
          type: 'complaint_room_created',
          title: `3-Member Complaint Chat Opened (TKT-${nextNo})`,
          body: `${customer.fullName} raised a ticket involving ${assignedEmpName} (${assignedEmpAlias}).`,
          link: `/boss/tickets?ticketId=${tktId}`,
          payload: { ticketId: tktId, roomId },
          readAt: null,
          createdAt: nowIso
        },
        {
          id: `notif-${Date.now()}-${assignedEmpId}-croom`,
          recipientId: assignedEmpId,
          type: 'complaint_room_created',
          title: `3-Member Complaint Chat Opened (TKT-${nextNo})`,
          body: `You, Main Admin (Boss), and ${customer.fullName} have been added to a private complaint chat room.`,
          link: `/employee/tickets?ticketId=${tktId}`,
          payload: { ticketId: tktId, roomId },
          readAt: null,
          createdAt: nowIso
        }
      );
    }

    state.activityEvents.unshift({
      id: `act-${Date.now()}-tkt`,
      occurredAt: nowIso,
      actorId: customer.id,
      actorName: customer.fullName,
      actorRole: 'customer',
      eventType: 'ticket_created',
      customerId: customer.id,
      conversationId: null,
      ticketId: tktId,
      offerId: null,
      messageId: null,
      meta: { ticket_no: nextNo, assigned_employee_id: assignedEmpId }
    });

    saveState(state);
    return stripStaffIdentityFromTicketForCustomer(state, newTicket);
  }

  async assignTicket(
    caller: CallerContext,
    input: { ticketId: string; employeeId: string }
  ): Promise<Ticket> {
    const state = getState();
    const boss = assertBoss(state, caller);

    const ticket = state.tickets.find((t) => t.id === input.ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    if (ticket.status === 'closed') {
      throw new Error('INVALID_TICKET_TRANSITION: Cannot reassign a closed ticket.');
    }

    const emp = state.profiles.find(
      (p) => p.id === input.employeeId && p.role === 'employee' && p.status === 'active'
    );
    const sp = state.staffProfiles.find((s) => s.userId === input.employeeId);
    if (!emp) throw new Error('NOT_FOUND: Target active employee not found.');

    const nowIso = new Date().toISOString();
    const previousAssignee = ticket.assignedEmployeeId;
    const isReassign = Boolean(previousAssignee && previousAssignee !== emp.id);

    ticket.assignedEmployeeId = emp.id;
    ticket.assignedEmployeeName = emp.fullName;
    ticket.assignedEmployeeAlias = sp?.publicAlias ?? null;
    if (ticket.status === 'open') {
      ticket.status = 'assigned';
    }

    state.ticketEvents.push({
      id: `tev-${Date.now()}-assign`,
      ticketId: ticket.id,
      actorId: boss.id,
      actorDisplayName: boss.fullName,
      event: isReassign ? 'reassigned' : 'assigned',
      fromValue: previousAssignee,
      toValue: emp.id,
      createdAt: nowIso
    });

    state.activityEvents.unshift({
      id: `act-${Date.now()}-assign`,
      occurredAt: nowIso,
      actorId: boss.id,
      actorName: boss.fullName,
      actorRole: 'boss',
      eventType: isReassign ? 'ticket_reassigned' : 'ticket_assigned',
      customerId: ticket.customerId,
      conversationId: null,
      ticketId: ticket.id,
      offerId: null,
      messageId: null,
      meta: { from_employee_id: previousAssignee, to_employee_id: emp.id }
    });

    state.auditLogs.unshift({
      id: `aud-${Date.now()}-assign`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: isReassign ? 'ticket_reassigned' : 'ticket_assigned',
      entity: 'tickets',
      entityId: ticket.id,
      beforeMeta: { assignedEmployeeId: previousAssignee },
      afterMeta: { assignedEmployeeId: emp.id },
      ip: '127.0.0.1',
      createdAt: nowIso
    });

    state.notifications.unshift({
      id: `notif-${Date.now()}-${emp.id}`,
      recipientId: emp.id,
      type: 'ticket_assigned',
      title: `Ticket #${ticket.ticketNo} Assigned to You`,
      body: ticket.subject,
      link: '/employee/tickets',
      payload: { ticketId: ticket.id },
      readAt: null,
      createdAt: nowIso
    });

    saveState(state);
    return { ...ticket };
  }

  async replyTicket(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<CustomerTicketMessageView | StaffTicketMessageView> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);
    const ticket = state.tickets.find((t) => t.id === input.ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    if (ticket.status === 'closed') {
      throw new Error('INVALID_TICKET_TRANSITION: Cannot reply to a closed ticket.');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const msgId = `tmsg-${Date.now()}`;
    const cleanBody = input.body.trim();

    if (actor.role === 'customer') {
      if (ticket.customerId !== actor.id) {
        throw new Error('FORBIDDEN: Customers can only reply to their own tickets.');
      }

      const prevStatus = ticket.status;
      if (ticket.status === 'waiting_for_customer') {
        ticket.status = 'in_progress';
      } else if (ticket.status === 'resolved') {
        ticket.status = 'in_progress';
        ticket.reopenCount += 1;

        const lastResolvedEv = [...state.activityEvents].find(
          (ev) => ev.ticketId === ticket.id && ev.eventType === 'ticket_resolved'
        );

        state.ticketEvents.push({
          id: `tev-${Date.now()}-reopen`,
          ticketId: ticket.id,
          actorId: actor.id,
          actorDisplayName: actor.fullName,
          event: 'reopened',
          fromValue: 'resolved',
          toValue: 'in_progress',
          createdAt: nowIso
        });

        state.activityEvents.unshift({
          id: `act-${Date.now()}-reopen`,
          occurredAt: nowIso,
          actorId: actor.id,
          actorName: actor.fullName,
          actorRole: 'customer',
          eventType: 'ticket_reopened',
          customerId: actor.id,
          conversationId: null,
          ticketId: ticket.id,
          offerId: null,
          messageId: msgId,
          meta: {
            last_resolved_by: lastResolvedEv?.actorId ?? ticket.assignedEmployeeId
          }
        });
      }

      state.ticketMessages.push({
        id: msgId,
        ticketId: ticket.id,
        senderKind: 'customer',
        customerSenderId: actor.id,
        body: cleanBody,
        createdAt: nowIso
      });

      state.ticketEvents.push({
        id: `tev-${Date.now()}-creply`,
        ticketId: ticket.id,
        actorId: actor.id,
        actorDisplayName: actor.fullName,
        event: 'replied',
        fromValue: prevStatus,
        toValue: ticket.status,
        createdAt: nowIso
      });

      saveState(state);
      return {
        id: msgId,
        ticketId: ticket.id,
        senderKind: 'customer',
        senderDisplayName: actor.fullName,
        customerSenderId: actor.id,
        body: cleanBody,
        createdAt: nowIso
      };
    }

    // Staff reply: Only assigned employee or boss can reply
    if (actor.role === 'employee' && ticket.assignedEmployeeId !== actor.id) {
      throw new Error(
        'FORBIDDEN: Only the assigned employee or the Boss can reply to this ticket.'
      );
    }

    const isFirstStaffResponse = !ticket.firstResponseAt;
    let firstResponseSec: number | undefined;
    if (isFirstStaffResponse) {
      ticket.firstResponseAt = nowIso;
      firstResponseSec = Math.max(
        1,
        Math.round((now.getTime() - new Date(ticket.createdAt).getTime()) / 1000)
      );
    }

    const prevStatus = ticket.status;
    if (ticket.status === 'assigned' || ticket.status === 'open') {
      ticket.status = 'in_progress';
      if (!ticket.assignedEmployeeId && actor.role === 'employee') {
        ticket.assignedEmployeeId = actor.id;
        ticket.assignedEmployeeName = actor.fullName;
      }
    }

    state.ticketMessages.push({
      id: msgId,
      ticketId: ticket.id,
      senderKind: 'staff',
      customerSenderId: null,
      body: cleanBody,
      createdAt: nowIso
    });

    state.ticketMessageAttributions.push({
      ticketMessageId: msgId,
      staffId: actor.id,
      createdAt: nowIso
    });

    state.ticketEvents.push({
      id: `tev-${Date.now()}-sreply`,
      ticketId: ticket.id,
      actorId: actor.id,
      actorDisplayName: 'John Rambo Support',
      event: 'replied',
      fromValue: prevStatus,
      toValue: ticket.status,
      createdAt: nowIso
    });

    state.activityEvents.unshift({
      id: `act-${Date.now()}-treply`,
      occurredAt: nowIso,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      eventType: 'staff_ticket_reply',
      customerId: ticket.customerId,
      conversationId: null,
      ticketId: ticket.id,
      offerId: null,
      messageId: msgId,
      meta: {
        is_first_response: isFirstStaffResponse,
        ...(firstResponseSec !== undefined ? { first_response_seconds: firstResponseSec } : {})
      }
    });

    state.notifications.unshift({
      id: `notif-${Date.now()}-${ticket.customerId}`,
      recipientId: ticket.customerId,
      type: 'ticket_reply',
      title: `Reply on Ticket #${ticket.ticketNo} from John Rambo Support`,
      body: cleanBody.slice(0, 100),
      link: `/tickets`,
      payload: { ticketId: ticket.id },
      readAt: null,
      createdAt: nowIso
    });

    const staffFlags = state.staffProfiles.find((s) => s.userId === actor.id);
    saveState(state);
    return {
      id: msgId,
      ticketId: ticket.id,
      senderKind: 'staff',
      senderDisplayName: 'John Rambo Support',
      customerSenderId: null,
      body: cleanBody,
      createdAt: nowIso,
      attributedStaffId: actor.id,
      attributedStaffName: actor.fullName,
      attributedStaffAlias: staffFlags?.publicAlias ?? null
    };
  }

  async transitionTicket(
    caller: CallerContext,
    input: { ticketId: string; toStatus: TicketStatus }
  ): Promise<Ticket> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);
    const ticket = state.tickets.find((t) => t.id === input.ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');

    const fromStatus = ticket.status;
    const { incrementsReopenCount } = validateTicketTransition({
      fromStatus,
      toStatus: input.toStatus,
      actorRole: actor.role,
      actorId: actor.id,
      ticketCustomerId: ticket.customerId,
      assignedEmployeeId: ticket.assignedEmployeeId
    });

    const now = new Date();
    const nowIso = now.toISOString();
    ticket.status = input.toStatus;

    let eventType: TicketEvent['event'] = 'status_changed';

    if (incrementsReopenCount) {
      ticket.reopenCount += 1;
      eventType = 'reopened';
      const lastResolvedEv = [...state.activityEvents].find(
        (ev) => ev.ticketId === ticket.id && ev.eventType === 'ticket_resolved'
      );
      state.activityEvents.unshift({
        id: `act-${Date.now()}-treopen`,
        occurredAt: nowIso,
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        eventType: 'ticket_reopened',
        customerId: ticket.customerId,
        conversationId: null,
        ticketId: ticket.id,
        offerId: null,
        messageId: null,
        meta: {
          last_resolved_by: lastResolvedEv?.actorId ?? ticket.assignedEmployeeId
        }
      });
    } else if (input.toStatus === 'resolved') {
      ticket.resolvedAt = nowIso;
      eventType = 'resolved';
      const resolutionSec = Math.max(
        1,
        Math.round((now.getTime() - new Date(ticket.createdAt).getTime()) / 1000)
      );
      const creditedEmpId = ticket.assignedEmployeeId ?? actor.id;
      state.activityEvents.unshift({
        id: `act-${Date.now()}-tresolve`,
        occurredAt: nowIso,
        actorId: creditedEmpId,
        actorName: actor.fullName,
        actorRole: actor.role,
        eventType: 'ticket_resolved',
        customerId: ticket.customerId,
        conversationId: null,
        ticketId: ticket.id,
        offerId: null,
        messageId: null,
        meta: {
          credited_employee_id: creditedEmpId,
          resolution_seconds: resolutionSec
        }
      });
    } else if (input.toStatus === 'closed') {
      ticket.closedAt = nowIso;
      eventType = 'closed';
    }

    state.ticketEvents.push({
      id: `tev-${Date.now()}-trans`,
      ticketId: ticket.id,
      actorId: actor.id,
      actorDisplayName: actor.role === 'customer' ? actor.fullName : 'John Rambo Support',
      event: eventType,
      fromValue: fromStatus,
      toValue: input.toStatus,
      createdAt: nowIso
    });

    saveState(state);
    return actor.role === 'customer'
      ? stripStaffIdentityFromTicketForCustomer(state, ticket)
      : { ...ticket };
  }

  async autoCloseResolvedTickets(nowIso?: string): Promise<number> {
    const state = getState();
    const refTime = nowIso ? new Date(nowIso) : new Date();
    const cutoffMs = state.appSettings.ticketAutoCloseDays * 24 * 3600_000;
    let closedCount = 0;

    for (const ticket of state.tickets) {
      if (ticket.status === 'resolved' && ticket.resolvedAt) {
        const elapsed = refTime.getTime() - new Date(ticket.resolvedAt).getTime();
        if (elapsed >= cutoffMs) {
          ticket.status = 'closed';
          ticket.closedAt = refTime.toISOString();
          closedCount++;
          state.ticketEvents.push({
            id: `tev-${Date.now()}-autoclose-${ticket.id}`,
            ticketId: ticket.id,
            actorId: 'boss-1',
            actorDisplayName: 'System Auto-Close',
            event: 'closed',
            fromValue: 'resolved',
            toValue: 'closed',
            createdAt: refTime.toISOString()
          });
        }
      }
    }

    if (closedCount > 0) saveState(state);
    return closedCount;
  }

  async getComplaintChatRoomByTicket(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatRoom | null> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);
    const room = (state.complaintChatRooms ?? []).find((r) => r.ticketId === ticketId);
    if (!room) return null;
    if (!room.memberIds.includes(actor.id)) {
      return null;
    }
    return { ...room };
  }

  async listComplaintChatMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatMessage[]> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);
    const room = (state.complaintChatRooms ?? []).find((r) => r.ticketId === ticketId);
    if (!room) return [];
    if (!room.memberIds.includes(actor.id)) {
      throw new Error(
        'FORBIDDEN: Only the 3 complaint chat room members (Boss, reported Employee, and Customer) can access this private room.'
      );
    }
    return (state.complaintChatMessages ?? [])
      .filter((m) => m.roomId === room.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({ ...m }));
  }

  async sendComplaintChatMessage(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<ComplaintChatMessage> {
    const state = getState();
    const actor = assertActiveCaller(state, caller);
    const room = (state.complaintChatRooms ?? []).find((r) => r.ticketId === input.ticketId);
    if (!room) {
      throw new Error('NOT_FOUND: Complaint chat room not found for this ticket.');
    }
    if (!room.memberIds.includes(actor.id)) {
      throw new Error(
        'FORBIDDEN: Only the 3 complaint chat room members (Boss, reported Employee, and Customer) can post in this private room.'
      );
    }

    const cleanBody = input.body.trim();
    if (!cleanBody) {
      throw new Error('INVALID_MESSAGE: Message body cannot be empty.');
    }

    const nowIso = new Date().toISOString();
    const displayName =
      actor.role === 'boss'
        ? `${actor.fullName} (Main Admin / Boss)`
        : actor.role === 'employee'
          ? `${room.employeeAlias} (Employee)`
          : `${actor.fullName} (Customer)`;

    const msg: ComplaintChatMessage = {
      id: `ccmsg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      roomId: room.id,
      ticketId: room.ticketId,
      senderId: actor.id,
      senderRole: actor.role,
      senderDisplayName: displayName,
      body: cleanBody,
      createdAt: nowIso
    };

    if (!state.complaintChatMessages) state.complaintChatMessages = [];
    state.complaintChatMessages.push(msg);

    for (const memberId of room.memberIds) {
      if (memberId === actor.id) continue;
      state.notifications.unshift({
        id: `notif-${Date.now()}-${memberId}-ccmsg`,
        recipientId: memberId,
        type: 'complaint_chat_message',
        title: `New message in Complaint Room (TKT-${room.ticketNo})`,
        body: cleanBody.slice(0, 100),
        link:
          memberId === room.bossId
            ? `/boss/tickets?ticketId=${room.ticketId}`
            : memberId === room.employeeId
              ? `/employee/tickets?ticketId=${room.ticketId}`
              : `/tickets?ticketId=${room.ticketId}`,
        payload: { ticketId: room.ticketId, roomId: room.id },
        readAt: null,
        createdAt: nowIso
      });
    }

    saveState(state);
    return { ...msg };
  }

  async listStaffThreads(caller: CallerContext): Promise<StaffThread[]> {
    const state = getState();
    // Decision 8: Customers have no access. Boss and all active employees can read all threads.
    assertStaff(state, caller);
    return state.staffThreads.map((t) => ({ ...t }));
  }

  async listStaffThreadMessages(
    caller: CallerContext,
    threadId: string
  ): Promise<StaffThreadMessage[]> {
    const state = getState();
    assertStaff(state, caller);
    if (threadId !== 'sthread-group') {
      const thread = state.staffThreads.find((t) => t.id === threadId);
      if (!thread) throw new Error('NOT_FOUND: Staff thread not found.');
    }
    return state.staffThreadMessages
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({ ...m }));
  }

  async sendStaffThreadMessage(
    caller: CallerContext,
    input: { threadId: string; body: string }
  ): Promise<StaffThreadMessage> {
    const state = getState();
    const staff = assertStaff(state, caller);

    const nowIso = new Date().toISOString();
    const cleanBody = input.body.trim();
    const sp = state.staffProfiles.find((s) => s.userId === staff.id);

    // Group chat between all employees and boss ('sthread-group')
    if (input.threadId === 'sthread-group') {
      const senderLabel =
        staff.role === 'boss'
          ? staff.fullName
          : sp?.publicAlias
            ? `${staff.fullName} (${sp.publicAlias})`
            : staff.fullName;

      const groupMsg: StaffThreadMessage = {
        id: `stm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        threadId: 'sthread-group',
        senderId: staff.id,
        senderName: senderLabel,
        senderRole: staff.role === 'boss' ? 'boss' : 'employee',
        body: cleanBody,
        createdAt: nowIso
      };
      state.staffThreadMessages.push(groupMsg);
      saveState(state);
      return { ...groupMsg };
    }

    const thread = state.staffThreads.find((t) => t.id === input.threadId);
    if (!thread) throw new Error('NOT_FOUND: Staff thread not found.');

    // JR Family: Every active employee and Boss can message every other employee and Boss.
    const msg: StaffThreadMessage = {
      id: `stm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      threadId: thread.id,
      senderId: staff.id,
      senderName: staff.fullName,
      senderRole: staff.role === 'boss' ? 'boss' : 'employee',
      body: cleanBody,
      createdAt: nowIso
    };
    state.staffThreadMessages.push(msg);
    thread.lastMessageAt = nowIso;
    thread.lastMessagePreview = cleanBody.slice(0, 120);

    saveState(state);
    return { ...msg };
  }

  async listStaffAnnouncements(caller: CallerContext): Promise<StaffAnnouncement[]> {
    const state = getState();
    assertStaff(state, caller);
    return state.staffAnnouncements.map((a) => ({
      ...a,
      acks: a.acks.map((ack) => ({ ...ack }))
    }));
  }

  async createStaffAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; priority: AnnouncementPriority }
  ): Promise<StaffAnnouncement> {
    const state = getState();
    // Decision 9: Only the boss can post on the staff channel.
    const boss = assertBoss(state, caller);
    const nowIso = new Date().toISOString();
    const ann: StaffAnnouncement = {
      id: `sann-${Date.now()}`,
      authorId: boss.id,
      authorName: boss.fullName,
      title: input.title.trim(),
      body: input.body.trim(),
      priority: input.priority,
      createdAt: nowIso,
      acks: []
    };
    state.staffAnnouncements.unshift(ann);

    // Notify all active employees
    for (const emp of state.profiles.filter((p) => p.role === 'employee' && p.status === 'active')) {
      state.notifications.unshift({
        id: `notif-${Date.now()}-${emp.id}`,
        recipientId: emp.id,
        type: 'staff_announcement',
        title: `[${input.priority.toUpperCase()}] ${ann.title}`,
        body: ann.body.slice(0, 100),
        link: '/employee/announcements',
        payload: { announcementId: ann.id },
        readAt: null,
        createdAt: nowIso
      });
    }

    saveState(state);
    return { ...ann, acks: [] };
  }

  async acknowledgeStaffPost(
    caller: CallerContext,
    announcementId: string
  ): Promise<StaffAnnouncementAck> {
    const state = getState();
    const staff = assertActiveCaller(state, caller);
    if (staff.role !== 'employee') {
      throw new Error('FORBIDDEN: Only employees acknowledge staff channel posts.');
    }

    const ann = state.staffAnnouncements.find((a) => a.id === announcementId);
    if (!ann) throw new Error('NOT_FOUND: Staff announcement not found.');

    const existing = ann.acks.find((ack) => ack.employeeId === staff.id);
    if (existing) {
      return { ...existing };
    }

    const ack: StaffAnnouncementAck = {
      announcementId: ann.id,
      employeeId: staff.id,
      employeeName: staff.fullName,
      acknowledgedAt: new Date().toISOString()
    };
    ann.acks.push(ack);
    saveState(state);
    return { ...ack };
  }

  async listCustomerAnnouncements(caller: CallerContext): Promise<CustomerAnnouncement[]> {
    const state = getState();
    assertActiveCaller(state, caller);
    return [...state.customerAnnouncements].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }

  async createCustomerAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; pinned: boolean }
  ): Promise<CustomerAnnouncement> {
    const state = getState();
    if (!hasStaffFlag(state, caller, 'canPostCustomerAnnouncements')) {
      throw new Error('FORBIDDEN: Caller lacks can_post_customer_announcements permission.');
    }

    const nowIso = new Date().toISOString();
    const ann: CustomerAnnouncement = {
      id: `cann-${Date.now()}`,
      authorId: caller.userId,
      title: input.title.trim(),
      body: input.body.trim(),
      pinned: input.pinned,
      publishedAt: nowIso
    };
    state.customerAnnouncements.unshift(ann);
    saveState(state);
    return { ...ann };
  }

  async listStories(caller: CallerContext, includeExpiredForStaff = false): Promise<Story[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const nowMs = Date.now();

    return state.stories
      .filter((s) => {
        const isLive = new Date(s.expiresAt).getTime() > nowMs;
        if (p.role === 'customer') return isLive;
        return includeExpiredForStaff ? true : isLive;
      })
      .map((s) => {
        const viewsForStory = state.storyViews.filter((v) => v.storyId === s.id);
        return {
          ...s,
          viewCount: viewsForStory.length,
          viewedByCaller: viewsForStory.some((v) => v.customerId === p.id)
        };
      });
  }

  async createStory(
    caller: CallerContext,
    input: {
      kind: StoryKind;
      caption: string;
      mediaPath?: string | null;
      bgStyle?: string;
      expiresAt?: string;
    }
  ): Promise<Story> {
    const state = getState();
    if (!hasStaffFlag(state, caller, 'canPublishStories')) {
      throw new Error('FORBIDDEN: Caller lacks can_publish_stories permission.');
    }

    const nowIso = new Date().toISOString();
    const expiresIso =
      input.expiresAt ?? new Date(Date.now() + 24 * 3600_000).toISOString();

    const story: Story = {
      id: `story-${Date.now()}`,
      authorId: caller.userId,
      kind: input.kind,
      mediaPath: input.mediaPath ?? null,
      caption: input.caption.trim(),
      bgStyle: input.bgStyle ?? 'from-violet-900 via-indigo-950 to-slate-950',
      createdAt: nowIso,
      expiresAt: expiresIso,
      viewCount: 0,
      viewedByCaller: false
    };
    state.stories.unshift(story);
    saveState(state);
    return { ...story };
  }

  async recordStoryView(caller: CallerContext, storyId: string): Promise<void> {
    const state = getState();
    const customer = assertCustomer(state, caller);
    const story = state.stories.find((s) => s.id === storyId);
    if (!story || new Date(story.expiresAt).getTime() <= Date.now()) {
      throw new Error('NOT_FOUND: Story is expired or unavailable.');
    }

    const already = state.storyViews.find(
      (v) => v.storyId === storyId && v.customerId === customer.id
    );
    if (!already) {
      state.storyViews.push({
        storyId,
        customerId: customer.id,
        customerName: customer.fullName,
        viewedAt: new Date().toISOString()
      });
      saveState(state);
    }
  }

  async purgeExpiredStories(nowIso?: string): Promise<number> {
    const state = getState();
    const cutoff = nowIso ? new Date(nowIso).getTime() : Date.now();
    const beforeCount = state.stories.length;
    state.stories = state.stories.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
    const purged = beforeCount - state.stories.length;
    if (purged > 0) saveState(state);
    return purged;
  }

  async listNotifications(caller: CallerContext): Promise<AppNotification[]> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    return state.notifications
      .filter((n) => n.recipientId === p.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((n) => ({ ...n }));
  }

  async markNotificationRead(caller: CallerContext, notificationId: string): Promise<void> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const notif = state.notifications.find(
      (n) => n.id === notificationId && n.recipientId === p.id
    );
    if (notif && !notif.readAt) {
      notif.readAt = new Date().toISOString();
      saveState(state);
    }
  }

  async markAllNotificationsRead(caller: CallerContext): Promise<void> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const nowIso = new Date().toISOString();
    for (const n of state.notifications) {
      if (n.recipientId === p.id && !n.readAt) {
        n.readAt = nowIso;
      }
    }
    saveState(state);
  }

  async savePushSubscription(
    caller: CallerContext,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
  ): Promise<PushSubscriptionRecord> {
    const state = getState();
    const p = assertActiveCaller(state, caller);
    const existing = state.pushSubscriptions.find((s) => s.endpoint === input.endpoint);
    if (existing) {
      existing.userId = p.id;
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      saveState(state);
      return { ...existing };
    }
    const rec: PushSubscriptionRecord = {
      id: `push-${Date.now()}`,
      userId: p.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      createdAt: new Date().toISOString()
    };
    state.pushSubscriptions.push(rec);
    saveState(state);
    return { ...rec };
  }

  async getEmployeePerformance(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<EmployeePerformanceMetrics[]> {
    const state = getState();
    const p = assertStaff(state, caller);
    const allEmployees = getEmployeesWithFlagsFromState(state);

    // Permission Matrix: Employees see only their own numbers; Boss sees all employees & filters
    const effectiveFilter: PerformanceQueryFilter =
      p.role === 'employee'
        ? { ...filter, employeeId: p.id }
        : { ...filter };

    return calculateEmployeeMetrics({
      employees: allEmployees,
      activityEvents: state.activityEvents,
      ticketEvents: state.ticketEvents,
      tickets: state.tickets,
      filter: effectiveFilter
    });
  }

  async listActivityEvents(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<ActivityEvent[]> {
    const state = getState();
    const p = assertStaff(state, caller);

    const startMs = filter?.startDateIso ? new Date(filter.startDateIso).getTime() : null;
    const endMs = filter?.endDateIso ? new Date(filter.endDateIso).getTime() : null;

    return state.activityEvents
      .filter((ev) => {
        if (p.role === 'employee' && ev.actorId !== p.id) return false;
        if (filter?.employeeId && ev.actorId !== filter.employeeId) return false;
        const t = new Date(ev.occurredAt).getTime();
        if (startMs !== null && !Number.isNaN(startMs) && t < startMs) return false;
        if (endMs !== null && !Number.isNaN(endMs) && t > endMs) return false;
        return true;
      })
      .map((ev) => ({ ...ev }));
  }

  async exportPerformanceCsv(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<string> {
    const state = getState();
    const boss = assertBoss(state, caller);
    const rows = await this.getEmployeePerformance(caller, filter);

    const headers = [
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

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.employeeId,
          `"${r.employeeName.replace(/"/g, '""')}"`,
          `"${r.publicAlias.replace(/"/g, '""')}"`,
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

    state.auditLogs.unshift({
      id: `aud-${Date.now()}-export`,
      actorId: boss.id,
      actorName: boss.fullName,
      action: 'export_performance_csv',
      entity: 'activity_events',
      entityId: 'performance_csv',
      beforeMeta: null,
      afterMeta: { filter: filter ?? {}, rowCount: rows.length },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString()
    });
    saveState(state);

    return lines.join('\n');
  }

  async listAuditLogs(caller: CallerContext): Promise<AuditLogEntry[]> {
    const state = getState();
    assertBoss(state, caller);
    return state.auditLogs.map((a) => ({ ...a }));
  }
}
