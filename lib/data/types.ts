/**
 * Typed Data Repository Domain Models & Interfaces (`lib/data/types.ts`)
 * Decision 14: All data access goes through a typed repository interface in `lib/data/`
 * with two adapters: `mock` and `supabase`.
 */

export type UserRole = 'boss' | 'employee' | 'customer';
export type UserStatus = 'invited' | 'pending_approval' | 'active' | 'rejected' | 'suspended';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type InboxScopeMode = 'all' | 'assigned_only';
export type ProductStatus = 'available' | 'sold_out' | 'hidden';
export type SenderKind = 'customer' | 'staff' | 'system';
export type MessageType = 'text' | 'offer' | 'system';
export type OfferStatus = 'pending' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
export type OfferEventType = 'submitted' | 'viewed' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_for_customer'
  | 'resolved'
  | 'closed';
export type TicketEventType =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'status_changed'
  | 'replied'
  | 'reopened'
  | 'resolved'
  | 'closed';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type StoryKind = 'text' | 'image' | 'video';

export interface Profile {
  id: string;
  role: UserRole;
  status: UserStatus;
  username?: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarPath: string | null;
  invitedBy: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface OutboundEmailNotice {
  id: string;
  to: string;
  subject: string;
  body: string;
  kind: 'customer_approved' | 'customer_rejected' | 'employee_approved' | 'employee_rejected';
  sentAt: string;
}

export interface PasswordAuthResult {
  ok: boolean;
  code:
    | 'SUCCESS'
    | 'INVALID_CREDENTIALS'
    | 'PENDING_APPROVAL'
    | 'ACCOUNT_REJECTED'
    | 'ACCOUNT_SUSPENDED';
  error?: string;
  profile?: Profile;
}

export interface StaffProfile {
  userId: string;
  publicAlias: string;
  customerSelectable: boolean;
  acceptsTickets: boolean;
  canManageProducts: boolean;
  canPublishStories: boolean;
  canPostCustomerAnnouncements: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeWithFlags extends Profile {
  staffProfile: StaffProfile;
}

/**
 * Restricted public alias view returned to customers when `customer_can_pick_employee = true`.
 * Decision 7: Never exposes real name, email, or avatar.
 */
export interface SelectableStaffAlias {
  staffId: string;
  publicAlias: string;
}

export interface AppSettings {
  employeeInboxScope: InboxScopeMode;
  customerCanPickEmployee: boolean;
  ticketAutoCloseDays: number;
  offerSanityMaxPaise: number;
  businessHoursOnly: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  intendedRole: 'customer' | 'employee';
  fullName: string;
  phone: string | null;
  invitedBy: string;
  invitedByName?: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface Product {
  id: string;
  gameName: string;
  title: string;
  pointsQty: number;
  description: string;
  imagePath: string | null;
  pricePaise: number;
  status: ProductStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  handledBy: string | null;
  handledByName?: string | null;
  handledByAlias?: string | null;
  awaitingStaff: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  customerLastReadAt: string | null;
  staffLastReadAt: string | null;
  customerUnreadCount: number;
  staffUnreadCount: number;
  createdAt: string;
}

/**
 * Customer-facing message payload.
 * Decision 4: Customers NEVER receive staff user id, name, email, or avatar.
 */
export interface CustomerMessageView {
  id: string;
  conversationId: string;
  senderKind: SenderKind;
  senderDisplayName: string; // Always "John Rambo Support" when senderKind === 'staff'
  customerSenderId: string | null;
  type: MessageType;
  body: string;
  offerId: string | null;
  offerSnapshot?: Offer | null;
  clientMsgId: string;
  createdAt: string;
}

/**
 * Staff-facing message payload (joins `message_attribution`).
 */
export interface StaffMessageView extends CustomerMessageView {
  attributedStaffId: string | null;
  attributedStaffName: string | null;
  attributedStaffAlias: string | null;
}

export interface MessageAttribution {
  messageId: string;
  staffId: string;
  createdAt: string;
}

export interface Offer {
  id: string;
  productId: string;
  customerId: string;
  customerName?: string;
  conversationId: string;
  offeredPricePaise: number;
  listedPricePaise: number;
  productTitle: string;
  gameName?: string;
  status: OfferStatus;
  counterPricePaise: number | null;
  staffNote: string | null;
  handledBy: string | null; // Hidden/nulled when serialized to customer
  handledByName?: string | null; // Staff-only
  createdAt: string;
  updatedAt: string;
}

export interface OfferEvent {
  id: string;
  offerId: string;
  actorId: string;
  event: OfferEventType;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNo: number;
  customerId: string;
  customerName?: string;
  subject: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedEmployeeId: string | null; // Hidden or alias-only for customer
  assignedEmployeeName?: string | null; // Staff-only
  assignedEmployeeAlias?: string | null;
  requestedEmployeeId: string | null;
  requestedEmployeeAlias?: string | null;
  reopenCount: number;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface CustomerTicketMessageView {
  id: string;
  ticketId: string;
  senderKind: SenderKind;
  senderDisplayName: string; // Always "John Rambo Support" when senderKind === 'staff'
  customerSenderId: string | null;
  body: string;
  createdAt: string;
}

export interface StaffTicketMessageView extends CustomerTicketMessageView {
  attributedStaffId: string | null;
  attributedStaffName: string | null;
  attributedStaffAlias: string | null;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId: string;
  actorDisplayName: string; // "John Rambo Support" for customers if staff actor
  event: TicketEventType;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

export interface ComplaintChatRoom {
  id: string;
  ticketId: string;
  ticketNo: number;
  customerId: string;
  customerName: string;
  employeeId: string;
  employeeName: string;
  employeeAlias: string;
  bossId: string;
  bossName: string;
  memberIds: [string, string, string];
  createdAt: string;
}

export interface ComplaintChatMessage {
  id: string;
  roomId: string;
  ticketId: string;
  senderId: string;
  senderRole: UserRole;
  senderDisplayName: string;
  body: string;
  createdAt: string;
}

export interface StaffThread {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeAlias: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
}

export interface StaffThreadMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: 'boss' | 'employee';
  body: string;
  createdAt: string;
}

export interface StaffAnnouncement {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  createdAt: string;
  acks: StaffAnnouncementAck[];
}

export interface StaffAnnouncementAck {
  announcementId: string;
  employeeId: string;
  employeeName: string;
  acknowledgedAt: string;
}

export interface CustomerAnnouncement {
  id: string;
  authorId: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
}

export interface Story {
  id: string;
  authorId: string;
  kind: StoryKind;
  mediaPath: string | null;
  caption: string;
  bgStyle: string;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewedByCaller: boolean;
}

export interface StoryView {
  storyId: string;
  customerId: string;
  customerName?: string;
  viewedAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  link: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  occurredAt: string;
  actorId: string;
  actorName?: string;
  actorRole: UserRole;
  eventType: string;
  customerId: string | null;
  conversationId: string | null;
  ticketId: string | null;
  offerId: string | null;
  messageId: string | null;
  meta: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName?: string;
  action: string;
  entity: string;
  entityId: string;
  beforeMeta: Record<string, unknown> | null;
  afterMeta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface EmployeePerformanceMetrics {
  employeeId: string;
  employeeName: string;
  publicAlias: string;
  chatMessagesSent: number;
  ticketRepliesSent: number;
  chatFirstResponseAvgSec: number | null;
  chatFirstResponseMedianSec: number | null;
  chatFirstResponseP90Sec: number | null;
  ticketFirstResponseAvgSec: number | null;
  ticketFirstResponseMedianSec: number | null;
  ticketFirstResponseP90Sec: number | null;
  ticketResolutionAvgSec: number | null;
  ticketResolutionMedianSec: number | null;
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsPending: number;
  ticketsReopened: number;
  offersHandledTotal: number;
  offersAccepted: number;
  offersCountered: number;
  offersRejected: number;
  conversationsHandled: number;
}

export interface PerformanceQueryFilter {
  employeeId?: string;
  startDateIso?: string;
  endDateIso?: string;
  businessHoursOnly?: boolean;
}

/**
 * Caller Context passed to every Repository method so permissions and RLS rules
 * are strictly enforced in both Mock and Supabase adapters.
 */
export interface CallerContext {
  userId: string;
  role: UserRole;
  status: UserStatus;
}

export interface DataRepository {
  readonly mode: 'mock' | 'supabase';

  // Auth & Profile
  getProfileById(userId: string): Promise<Profile | null>;
  getProfileByEmail(email: string): Promise<Profile | null>;
  listAllProfiles(caller: CallerContext): Promise<Profile[]>;
  listEmployeesWithFlags(caller: CallerContext): Promise<EmployeeWithFlags[]>;
  getSelectableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]>;
  listReportableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]>;
  updateCustomerOwnProfile(
    caller: CallerContext,
    input: { fullName: string; email: string; phone: string }
  ): Promise<Profile>;
  changeCustomerPassword(
    caller: CallerContext,
    input: { currentPassword?: string; newPassword: string }
  ): Promise<void>;
  verifyEmailOtpAndSetPassword(input: {
    email: string;
    otpCode: string;
    password: string;
    fullName?: string;
    phone?: string;
  }): Promise<Profile>;
  authenticateWithPassword(input: {
    email: string;
    password: string;
  }): Promise<PasswordAuthResult>;
  adminSetUserPassword(
    caller: CallerContext,
    input: {
      targetUserId: string;
      newPassword: string;
      newUsername?: string;
    }
  ): Promise<Profile>;

  // Invitations & User Management
  inviteUser(
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
  ): Promise<{ invitation: Invitation; profile: Profile }>;
  listInvitations(caller: CallerContext): Promise<Invitation[]>;
  listPendingCustomers(caller: CallerContext): Promise<Profile[]>;
  reviewPendingUser(
    caller: CallerContext,
    input: {
      targetUserId: string;
      decision: 'approve' | 'reject';
      note?: string;
    }
  ): Promise<{ profile: Profile; emailNotice: OutboundEmailNotice }>;
  listSentEmails(caller: CallerContext): Promise<OutboundEmailNotice[]>;
  setUserStatus(
    caller: CallerContext,
    targetUserId: string,
    newStatus: UserStatus
  ): Promise<Profile>;
  updateStaffFlags(
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
  ): Promise<EmployeeWithFlags>;

  // App Settings
  getAppSettings(caller: CallerContext): Promise<AppSettings>;
  updateAppSettings(
    caller: CallerContext,
    input: Partial<Omit<AppSettings, 'updatedBy' | 'updatedAt'>>
  ): Promise<AppSettings>;

  // Products
  listProducts(caller: CallerContext): Promise<Product[]>;
  getProductById(caller: CallerContext, productId: string): Promise<Product | null>;
  upsertProduct(
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
  ): Promise<Product>;

  // Customer Chat & Attribution
  listConversations(caller: CallerContext): Promise<Conversation[]>;
  getCustomerConversation(caller: CallerContext, conversationId?: string): Promise<Conversation | null>;
  listCustomerMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<CustomerMessageView[]>;
  listStaffMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<StaffMessageView[]>;
  sendCustomerMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<CustomerMessageView>;
  sendStaffMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<StaffMessageView>;
  reassignConversationHandler(
    caller: CallerContext,
    conversationId: string,
    employeeId: string | null
  ): Promise<Conversation>;
  markConversationRead(caller: CallerContext, conversationId: string): Promise<void>;

  // Price Offers
  listOffers(caller: CallerContext): Promise<Offer[]>;
  listOfferEvents(caller: CallerContext, offerId: string): Promise<OfferEvent[]>;
  submitOffer(
    caller: CallerContext,
    input: { productId: string; offeredPricePaise: number; clientMsgId: string }
  ): Promise<{ offer: Offer; message: CustomerMessageView }>;
  respondToOffer(
    caller: CallerContext,
    input: {
      offerId: string;
      action: 'counter' | 'accept' | 'reject';
      counterPricePaise?: number;
      note?: string;
    }
  ): Promise<Offer>;
  withdrawOffer(caller: CallerContext, offerId: string): Promise<Offer>;
  acceptCounterOffer(caller: CallerContext, offerId: string): Promise<Offer>;

  // Support Tickets
  listTickets(caller: CallerContext): Promise<Ticket[]>;
  getTicketById(caller: CallerContext, ticketId: string): Promise<Ticket | null>;
  listCustomerTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<CustomerTicketMessageView[]>;
  listStaffTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<StaffTicketMessageView[]>;
  listTicketEvents(caller: CallerContext, ticketId: string): Promise<TicketEvent[]>;
  createTicket(
    caller: CallerContext,
    input: {
      subject: string;
      description: string;
      category: string;
      priority: TicketPriority;
      requestedEmployeeId?: string | null;
    }
  ): Promise<Ticket>;
  assignTicket(
    caller: CallerContext,
    input: { ticketId: string; employeeId: string }
  ): Promise<Ticket>;
  replyTicket(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<CustomerTicketMessageView | StaffTicketMessageView>;
  transitionTicket(
    caller: CallerContext,
    input: { ticketId: string; toStatus: TicketStatus }
  ): Promise<Ticket>;
  autoCloseResolvedTickets(nowIso?: string): Promise<number>;
  getComplaintChatRoomByTicket(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatRoom | null>;
  listComplaintChatMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatMessage[]>;
  sendComplaintChatMessage(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<ComplaintChatMessage>;

  // Boss-Employee Threads & Staff Channel
  listStaffThreads(caller: CallerContext): Promise<StaffThread[]>;
  listStaffThreadMessages(
    caller: CallerContext,
    threadId: string
  ): Promise<StaffThreadMessage[]>;
  sendStaffThreadMessage(
    caller: CallerContext,
    input: { threadId: string; body: string }
  ): Promise<StaffThreadMessage>;
  listStaffAnnouncements(caller: CallerContext): Promise<StaffAnnouncement[]>;
  createStaffAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; priority: AnnouncementPriority }
  ): Promise<StaffAnnouncement>;
  acknowledgeStaffPost(
    caller: CallerContext,
    announcementId: string
  ): Promise<StaffAnnouncementAck>;

  // Customer Announcements & Stories
  listCustomerAnnouncements(caller: CallerContext): Promise<CustomerAnnouncement[]>;
  createCustomerAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; pinned: boolean }
  ): Promise<CustomerAnnouncement>;
  listStories(caller: CallerContext, includeExpiredForStaff?: boolean): Promise<Story[]>;
  createStory(
    caller: CallerContext,
    input: {
      kind: StoryKind;
      caption: string;
      mediaPath?: string | null;
      bgStyle?: string;
      expiresAt?: string;
    }
  ): Promise<Story>;
  recordStoryView(caller: CallerContext, storyId: string): Promise<void>;
  purgeExpiredStories(nowIso?: string): Promise<number>;

  // Notifications & Push
  listNotifications(caller: CallerContext): Promise<AppNotification[]>;
  markNotificationRead(caller: CallerContext, notificationId: string): Promise<void>;
  markAllNotificationsRead(caller: CallerContext): Promise<void>;
  savePushSubscription(
    caller: CallerContext,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
  ): Promise<PushSubscriptionRecord>;

  // Performance Analytics & Audit Log
  getEmployeePerformance(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<EmployeePerformanceMetrics[]>;
  listActivityEvents(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<ActivityEvent[]>;
  exportPerformanceCsv(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<string>;
  listAuditLogs(caller: CallerContext): Promise<AuditLogEntry[]>;
}
