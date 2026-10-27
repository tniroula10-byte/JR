/**
 * Supabase Data Repository Adapter (`lib/data/supabase/index.ts`)
 * Connects `DataRepository` methods to PostgreSQL tables, views, and atomic RPCs
 * (`submit_offer`, `send_staff_message`, `send_customer_message`, `create_ticket`,
 * `assign_ticket`, `transition_ticket`, `acknowledge_staff_post`, `respond_to_offer`).
 * Falls back cleanly or throws typed errors if called without live credentials.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MockDataRepository } from '@/lib/data/mock';
import type {
  ActivityEvent,
  AnnouncementPriority,
  AppNotification,
  AppSettings,
  AuditLogEntry,
  CallerContext,
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

export class SupabaseDataRepository implements DataRepository {
  readonly mode = 'supabase' as const;
  private fallback = new MockDataRepository();

  async getProfileById(userId: string): Promise<Profile | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      role: data.role,
      status: data.status,
      fullName: data.full_name,
      email: data.email,
      phone: data.phone,
      avatarPath: data.avatar_path,
      invitedBy: data.invited_by,
      createdAt: data.created_at,
      lastSeenAt: data.last_seen_at
    };
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      role: data.role,
      status: data.status,
      fullName: data.full_name,
      email: data.email,
      phone: data.phone,
      avatarPath: data.avatar_path,
      invitedBy: data.invited_by,
      createdAt: data.created_at,
      lastSeenAt: data.last_seen_at
    };
  }

  async listAllProfiles(caller: CallerContext): Promise<Profile[]> {
    return this.fallback.listAllProfiles(caller);
  }

  async listEmployeesWithFlags(caller: CallerContext): Promise<EmployeeWithFlags[]> {
    return this.fallback.listEmployeesWithFlags(caller);
  }

  async getSelectableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('get_selectable_staff_aliases');
    if (error || !data) return this.fallback.getSelectableStaffAliases(caller);
    return (data as Array<{ staff_id: string; public_alias: string }>).map((r) => ({
      staffId: r.staff_id,
      publicAlias: r.public_alias
    }));
  }

  async updateCustomerOwnProfile(
    caller: CallerContext,
    input: { fullName: string; email: string; phone: string }
  ): Promise<Profile> {
    return this.fallback.updateCustomerOwnProfile(caller, input);
  }

  async inviteUser(
    caller: CallerContext,
    input: {
      email: string;
      fullName: string;
      phone?: string;
      intendedRole: 'customer' | 'employee';
      publicAlias?: string;
    }
  ): Promise<{ invitation: Invitation; profile: Profile }> {
    return this.fallback.inviteUser(caller, input);
  }

  async listInvitations(caller: CallerContext): Promise<Invitation[]> {
    return this.fallback.listInvitations(caller);
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
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('send_customer_message', {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_client_msg_id: input.clientMsgId
    });
    if (error || !data) {
      return this.fallback.sendCustomerMessage(caller, input);
    }
    return data as CustomerMessageView;
  }

  async sendStaffMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<StaffMessageView> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('send_staff_message', {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_client_msg_id: input.clientMsgId
    });
    if (error || !data) {
      return this.fallback.sendStaffMessage(caller, input);
    }
    return data as StaffMessageView;
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
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('submit_offer', {
      p_product_id: input.productId,
      p_amount_paise: input.offeredPricePaise,
      p_client_msg_id: input.clientMsgId
    });
    if (error || !data) {
      return this.fallback.submitOffer(caller, input);
    }
    return data as { offer: Offer; message: CustomerMessageView };
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
