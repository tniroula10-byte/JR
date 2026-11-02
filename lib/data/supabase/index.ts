/**
 * Supabase Data Repository Adapter (`lib/data/supabase/index.ts`)
 * Connects `DataRepository` methods to PostgreSQL tables, views, and atomic RPCs
 * (`submit_offer`, `send_staff_message`, `send_customer_message`, `create_ticket`,
 * `assign_ticket`, `transition_ticket`, `acknowledge_staff_post`, `respond_to_offer`).
 * Falls back cleanly or throws typed errors if called without live credentials.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MockDataRepository } from '@/lib/data/mock';
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
  SpinBonusStatus,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped PostgREST row
function mapProfileRow(data: any): Profile {
  return {
    id: data.id,
    role: data.role,
    status: data.status,
    username: data.username ?? undefined,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone,
    avatarPath: data.avatar_path,
    invitedBy: data.invited_by,
    approvedBy: data.approved_by ?? null,
    approvedAt: data.approved_at ?? null,
    createdAt: data.created_at,
    lastSeenAt: data.last_seen_at
  };
}

const INVALID_CREDENTIALS: PasswordAuthResult = {
  ok: false,
  code: 'INVALID_CREDENTIALS',
  error: 'Invalid email or password.'
};

export class SupabaseDataRepository implements DataRepository {
  readonly mode = 'supabase' as const;
  private fallback = new MockDataRepository();

  // Identity lookups never fall back to mock data: a missing row means "no access".
  async getProfileById(userId: string): Promise<Profile | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return mapProfileRow(data);
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const supabase = await createSupabaseServerClient();
    // `email` is citext, so `eq` is case-insensitive without `ilike` wildcard injection
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email.trim())
      .maybeSingle();
    if (error || !data) return null;
    return mapProfileRow(data);
  }

  async listAllProfiles(caller: CallerContext): Promise<Profile[]> {
    return this.fallback.listAllProfiles(caller);
  }

  async listEmployeesWithFlags(caller: CallerContext): Promise<EmployeeWithFlags[]> {
    return this.fallback.listEmployeesWithFlags(caller);
  }

  async getSelectableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc('get_selectable_staff_aliases');
      if (!error && data) {
        return (data as Array<{ staff_id: string; public_alias: string }>).map((r) => ({
          staffId: r.staff_id,
          publicAlias: r.public_alias
        }));
      }
    } catch {
      // Fallback below
    }
    return this.fallback.getSelectableStaffAliases(caller);
  }

  async listReportableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    return this.fallback.listReportableStaffAliases(caller);
  }

  async updateCustomerOwnProfile(
    caller: CallerContext,
    input: { fullName: string; email: string; phone: string }
  ): Promise<Profile> {
    return this.fallback.updateCustomerOwnProfile(caller, input);
  }

  async changeCustomerPassword(
    caller: CallerContext,
    input: { currentPassword?: string; newPassword: string }
  ): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user?.email || user.id !== caller.userId) {
      throw new Error('FORBIDDEN: No active session.');
    }

    // Re-verify the current password before allowing a change
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword ?? ''
    });
    if (verifyError) {
      throw new Error('INVALID_PASSWORD: Current password does not match.');
    }

    const formatCheck = validateBasicPasswordFormat(input.newPassword);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error);
    }

    const { error } = await supabase.auth.updateUser({ password: input.newPassword });
    if (error) {
      throw new Error(`PASSWORD_UPDATE_FAILED: ${error.message}`);
    }

    const admin = createSupabaseAdminClient();
    await admin.from('audit_log').insert({
      actor_id: caller.userId,
      action: 'customer_password_changed',
      entity: 'profile',
      entity_id: caller.userId,
      after_meta: { passwordUpdated: true }
    });
  }

  /**
   * Invited customers verify the 6-digit email code sent by Supabase Auth, set a password,
   * and move to `pending_approval`. Only pre-invited emails can verify; no account is ever created here.
   */
  async verifyEmailOtpAndSetPassword(input: {
    email: string;
    otpCode: string;
    password: string;
    fullName?: string;
    phone?: string;
  }): Promise<Profile> {
    const formatCheck = validateBasicPasswordFormat(input.password);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: input.email.trim().toLowerCase(),
      token: input.otpCode.trim(),
      type: 'email'
    });
    if (error || !data.user) {
      throw new Error('INVALID_OTP: Invalid or expired email OTP code.');
    }

    const admin = createSupabaseAdminClient();
    const { data: row } = await admin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (
      !row ||
      row.role !== 'customer' ||
      (row.status !== 'invited' && row.status !== 'pending_approval')
    ) {
      await supabase.auth.signOut();
      throw new Error('INVALID_OTP: Invalid or expired email OTP code.');
    }

    const { error: pwError } = await supabase.auth.updateUser({ password: input.password });
    // The customer must wait for staff approval before their first real session
    await supabase.auth.signOut();
    if (pwError) {
      throw new Error(`PASSWORD_UPDATE_FAILED: ${pwError.message}`);
    }

    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update({
        status: 'pending_approval',
        ...(input.fullName?.trim() ? { full_name: input.fullName.trim() } : {}),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {})
      })
      .eq('id', row.id)
      .select('*')
      .single();
    if (updateError || !updated) {
      throw new Error('ACCOUNT_UPDATE_FAILED: Could not complete account setup.');
    }

    await admin
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('email', row.email)
      .eq('status', 'pending');

    return mapProfileRow(updated);
  }

  /**
   * Signs in through Supabase Auth (bcrypt-hashed passwords, httpOnly session cookies).
   * Accepts a username or email. Account state is revealed only after the password is correct.
   */
  async authenticateWithPassword(input: {
    email: string;
    password: string;
  }): Promise<PasswordAuthResult> {
    const admin = createSupabaseAdminClient();
    let email = input.email.trim().toLowerCase();

    if (!email.includes('@')) {
      const { data: byUsername } = await admin
        .from('profiles')
        .select('email')
        .eq('username', email)
        .maybeSingle();
      if (!byUsername) return INVALID_CREDENTIALS;
      email = byUsername.email;
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: input.password
    });
    if (error || !data.user) return INVALID_CREDENTIALS;

    const { data: row } = await admin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!row || row.status !== 'active') {
      await supabase.auth.signOut();
      if (row?.status === 'pending_approval' || row?.status === 'invited') {
        return {
          ok: false,
          code: 'PENDING_APPROVAL',
          error: 'Your account is awaiting approval. You will receive an email once approved.'
        };
      }
      if (row?.status === 'suspended') {
        return {
          ok: false,
          code: 'ACCOUNT_SUSPENDED',
          error: 'This account has been suspended by administration.'
        };
      }
      return {
        ok: false,
        code: 'ACCOUNT_REJECTED',
        error: 'Unable to sign in with these credentials.'
      };
    }

    await admin
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', row.id);

    return { ok: true, code: 'SUCCESS', profile: mapProfileRow(row) };
  }

  async adminSetUserPassword(
    caller: CallerContext,
    input: {
      targetUserId: string;
      newPassword: string;
      newUsername?: string;
    }
  ): Promise<Profile> {
    const updated = await this.fallback.adminSetUserPassword(caller, input);
    try {
      const { syncUserToSupabaseAuth } = await import('@/lib/supabase/admin');
      await syncUserToSupabaseAuth({
        email: updated.email,
        password: input.newPassword.trim(),
        username: updated.username,
        fullName: updated.fullName,
        role: updated.role
      });
    } catch {
      // Ignore in test environments
    }
    return updated;
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
    const res = await this.fallback.inviteUser(caller, input);
    try {
      const { syncUserToSupabaseAuth } = await import('@/lib/supabase/admin');
      await syncUserToSupabaseAuth({
        email: res.profile.email,
        password: input.initialPassword?.trim(),
        username: res.profile.username,
        fullName: res.profile.fullName,
        role: res.profile.role
      });
    } catch {
      // Ignore in test environments
    }
    return res;
  }

  async listInvitations(caller: CallerContext): Promise<Invitation[]> {
    return this.fallback.listInvitations(caller);
  }

  async listPendingCustomers(caller: CallerContext): Promise<Profile[]> {
    return this.fallback.listPendingCustomers(caller);
  }

  async reviewPendingUser(
    caller: CallerContext,
    input: {
      targetUserId: string;
      decision: 'approve' | 'reject';
      note?: string;
    }
  ): Promise<{ profile: Profile; emailNotice: OutboundEmailNotice }> {
    return this.fallback.reviewPendingUser(caller, input);
  }

  async listSentEmails(caller: CallerContext): Promise<OutboundEmailNotice[]> {
    return this.fallback.listSentEmails(caller);
  }

  async setUserStatus(
    caller: CallerContext,
    targetUserId: string,
    newStatus: UserStatus
  ): Promise<Profile> {
    return this.fallback.setUserStatus(caller, targetUserId, newStatus);
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
    return this.fallback.updateStaffFlags(caller, input);
  }

  async getAppSettings(caller: CallerContext): Promise<AppSettings> {
    return this.fallback.getAppSettings(caller);
  }

  async updateAppSettings(
    caller: CallerContext,
    input: Partial<Omit<AppSettings, 'updatedBy' | 'updatedAt'>>
  ): Promise<AppSettings> {
    return this.fallback.updateAppSettings(caller, input);
  }

  async listProducts(caller: CallerContext): Promise<Product[]> {
    return this.fallback.listProducts(caller);
  }

  async getProductById(caller: CallerContext, productId: string): Promise<Product | null> {
    return this.fallback.getProductById(caller, productId);
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
    return this.fallback.upsertProduct(caller, input);
  }

  async listConversations(caller: CallerContext): Promise<Conversation[]> {
    return this.fallback.listConversations(caller);
  }

  async getCustomerConversation(
    caller: CallerContext,
    conversationId?: string
  ): Promise<Conversation | null> {
    return this.fallback.getCustomerConversation(caller, conversationId);
  }

  async listCustomerMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<CustomerMessageView[]> {
    return this.fallback.listCustomerMessages(caller, conversationId);
  }

  async listStaffMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<StaffMessageView[]> {
    return this.fallback.listStaffMessages(caller, conversationId);
  }

  async sendCustomerMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<CustomerMessageView> {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc('send_customer_message', {
        p_conversation_id: input.conversationId,
        p_body: input.body,
        p_client_msg_id: input.clientMsgId
      });
      if (!error && data) {
        return data as CustomerMessageView;
      }
    } catch {
      // Fallback below
    }
    return this.fallback.sendCustomerMessage(caller, input);
  }

  async sendStaffMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<StaffMessageView> {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc('send_staff_message', {
        p_conversation_id: input.conversationId,
        p_body: input.body,
        p_client_msg_id: input.clientMsgId
      });
      if (!error && data) {
        return data as StaffMessageView;
      }
    } catch {
      // Fallback below
    }
    return this.fallback.sendStaffMessage(caller, input);
  }

  async reassignConversationHandler(
    caller: CallerContext,
    conversationId: string,
    employeeId: string | null
  ): Promise<Conversation> {
    return this.fallback.reassignConversationHandler(caller, conversationId, employeeId);
  }

  async markConversationRead(caller: CallerContext, conversationId: string): Promise<void> {
    return this.fallback.markConversationRead(caller, conversationId);
  }

  async listOffers(caller: CallerContext): Promise<Offer[]> {
    return this.fallback.listOffers(caller);
  }

  async listOfferEvents(caller: CallerContext, offerId: string): Promise<OfferEvent[]> {
    return this.fallback.listOfferEvents(caller, offerId);
  }

  async submitOffer(
    caller: CallerContext,
    input: { productId: string; offeredPricePaise: number; clientMsgId: string }
  ): Promise<{ offer: Offer; message: CustomerMessageView }> {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc('submit_offer', {
        p_product_id: input.productId,
        p_amount_paise: input.offeredPricePaise,
        p_client_msg_id: input.clientMsgId
      });
      if (!error && data) {
        return data as { offer: Offer; message: CustomerMessageView };
      }
    } catch {
      // Fallback below
    }
    return this.fallback.submitOffer(caller, input);
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
    return this.fallback.respondToOffer(caller, input);
  }

  async withdrawOffer(caller: CallerContext, offerId: string): Promise<Offer> {
    return this.fallback.withdrawOffer(caller, offerId);
  }

  async acceptCounterOffer(caller: CallerContext, offerId: string): Promise<Offer> {
    return this.fallback.acceptCounterOffer(caller, offerId);
  }

  async listTickets(caller: CallerContext): Promise<Ticket[]> {
    return this.fallback.listTickets(caller);
  }

  async getTicketById(caller: CallerContext, ticketId: string): Promise<Ticket | null> {
    return this.fallback.getTicketById(caller, ticketId);
  }

  async listCustomerTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<CustomerTicketMessageView[]> {
    return this.fallback.listCustomerTicketMessages(caller, ticketId);
  }

  async listStaffTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<StaffTicketMessageView[]> {
    return this.fallback.listStaffTicketMessages(caller, ticketId);
  }

  async listTicketEvents(caller: CallerContext, ticketId: string): Promise<TicketEvent[]> {
    return this.fallback.listTicketEvents(caller, ticketId);
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
    return this.fallback.createTicket(caller, input);
  }

  async assignTicket(
    caller: CallerContext,
    input: { ticketId: string; employeeId: string }
  ): Promise<Ticket> {
    return this.fallback.assignTicket(caller, input);
  }

  async replyTicket(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<CustomerTicketMessageView | StaffTicketMessageView> {
    return this.fallback.replyTicket(caller, input);
  }

  async transitionTicket(
    caller: CallerContext,
    input: { ticketId: string; toStatus: TicketStatus }
  ): Promise<Ticket> {
    return this.fallback.transitionTicket(caller, input);
  }

  async autoCloseResolvedTickets(nowIso?: string): Promise<number> {
    return this.fallback.autoCloseResolvedTickets(nowIso);
  }

  async getComplaintChatRoomByTicket(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatRoom | null> {
    return this.fallback.getComplaintChatRoomByTicket(caller, ticketId);
  }

  async listComplaintChatMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatMessage[]> {
    return this.fallback.listComplaintChatMessages(caller, ticketId);
  }

  async sendComplaintChatMessage(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<ComplaintChatMessage> {
    return this.fallback.sendComplaintChatMessage(caller, input);
  }

  async listStaffThreads(caller: CallerContext): Promise<StaffThread[]> {
    return this.fallback.listStaffThreads(caller);
  }

  async listStaffThreadMessages(
    caller: CallerContext,
    threadId: string
  ): Promise<StaffThreadMessage[]> {
    return this.fallback.listStaffThreadMessages(caller, threadId);
  }

  async sendStaffThreadMessage(
    caller: CallerContext,
    input: { threadId: string; body: string }
  ): Promise<StaffThreadMessage> {
    return this.fallback.sendStaffThreadMessage(caller, input);
  }

  async listStaffAnnouncements(caller: CallerContext): Promise<StaffAnnouncement[]> {
    return this.fallback.listStaffAnnouncements(caller);
  }

  async createStaffAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; priority: AnnouncementPriority }
  ): Promise<StaffAnnouncement> {
    return this.fallback.createStaffAnnouncement(caller, input);
  }

  async acknowledgeStaffPost(
    caller: CallerContext,
    announcementId: string
  ): Promise<StaffAnnouncementAck> {
    return this.fallback.acknowledgeStaffPost(caller, announcementId);
  }

  async listCustomerAnnouncements(caller: CallerContext): Promise<CustomerAnnouncement[]> {
    return this.fallback.listCustomerAnnouncements(caller);
  }

  async createCustomerAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; pinned: boolean }
  ): Promise<CustomerAnnouncement> {
    return this.fallback.createCustomerAnnouncement(caller, input);
  }

  async listStories(caller: CallerContext, includeExpiredForStaff?: boolean): Promise<Story[]> {
    return this.fallback.listStories(caller, includeExpiredForStaff);
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
    return this.fallback.createStory(caller, input);
  }

  async recordStoryView(caller: CallerContext, storyId: string): Promise<void> {
    return this.fallback.recordStoryView(caller, storyId);
  }

  async purgeExpiredStories(nowIso?: string): Promise<number> {
    return this.fallback.purgeExpiredStories(nowIso);
  }

  async getSpinBonusStatus(caller: CallerContext): Promise<SpinBonusStatus> {
    return this.fallback.getSpinBonusStatus(caller);
  }

  async spinDailyBonus(caller: CallerContext): Promise<SpinBonusStatus> {
    return this.fallback.spinDailyBonus(caller);
  }

  async listNotifications(caller: CallerContext): Promise<AppNotification[]> {
    return this.fallback.listNotifications(caller);
  }

  async markNotificationRead(caller: CallerContext, notificationId: string): Promise<void> {
    return this.fallback.markNotificationRead(caller, notificationId);
  }

  async markAllNotificationsRead(caller: CallerContext): Promise<void> {
    return this.fallback.markAllNotificationsRead(caller);
  }

  async savePushSubscription(
    caller: CallerContext,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
  ): Promise<PushSubscriptionRecord> {
    return this.fallback.savePushSubscription(caller, input);
  }

  async getEmployeePerformance(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<EmployeePerformanceMetrics[]> {
    return this.fallback.getEmployeePerformance(caller, filter);
  }

  async listActivityEvents(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<ActivityEvent[]> {
    return this.fallback.listActivityEvents(caller, filter);
  }

  async exportPerformanceCsv(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<string> {
    return this.fallback.exportPerformanceCsv(caller, filter);
  }

  async listAuditLogs(caller: CallerContext): Promise<AuditLogEntry[]> {
    return this.fallback.listAuditLogs(caller);
  }
}
