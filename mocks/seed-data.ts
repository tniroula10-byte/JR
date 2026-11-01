/**
 * Clean Initial Dataset (`mocks/seed-data.ts`)
 * Staff:
 * - Boss: BOKA (`boss-1`)
 * - Employee 1: GUZ (`emp-1`)
 * - Employee 2: NOX (`emp-2`)
 * - Employee 3: BSTURN (`emp-3`)
 * - Employee 4: ANKY (`emp-4`)
 * All demo stories, offers, tickets, messages, and announcements removed.
 * US Time (California PT) and US Dollars ($).
 */

import type {
  ActivityEvent,
  AppNotification,
  AppSettings,
  AuditLogEntry,
  ComplaintChatMessage,
  ComplaintChatRoom,
  Conversation,
  CustomerAnnouncement,
  EmployeeWithFlags,
  Invitation,
  MessageAttribution,
  Offer,
  OfferEvent,
  OutboundEmailNotice,
  Product,
  Profile,
  PushSubscriptionRecord,
  StaffAnnouncement,
  StaffProfile,
  StaffThread,
  StaffThreadMessage,
  Story,
  StoryView,
  Ticket,
  TicketEvent
} from '@/lib/data/types';

export interface RawMessageRecord {
  id: string;
  conversationId: string;
  senderKind: 'customer' | 'staff' | 'system';
  customerSenderId: string | null;
  type: 'text' | 'offer' | 'system';
  body: string;
  offerId: string | null;
  clientMsgId: string;
  createdAt: string;
}

export interface RawTicketMessageRecord {
  id: string;
  ticketId: string;
  senderKind: 'customer' | 'staff' | 'system';
  customerSenderId: string | null;
  body: string;
  createdAt: string;
}

export interface RawTicketAttributionRecord {
  ticketMessageId: string;
  staffId: string;
  createdAt: string;
}

export interface SpinBonusRecord {
  id: string;
  customerId: string;
  dateKeyCalifornia: string;
  rewardPoints: number;
  rewardLabel: string;
  spunAt: string;
}

export interface MockDatabaseState {
  profiles: Profile[];
  staffProfiles: StaffProfile[];
  appSettings: AppSettings;
  invitations: Invitation[];
  products: Product[];
  conversations: Conversation[];
  messages: RawMessageRecord[];
  messageAttributions: MessageAttribution[];
  offers: Offer[];
  offerEvents: OfferEvent[];
  tickets: Ticket[];
  ticketMessages: RawTicketMessageRecord[];
  ticketMessageAttributions: RawTicketAttributionRecord[];
  ticketEvents: TicketEvent[];
  complaintChatRooms: ComplaintChatRoom[];
  complaintChatMessages: ComplaintChatMessage[];
  customerPasswords: Record<string, string>;
  sentEmails?: OutboundEmailNotice[];
  spinBonuses?: SpinBonusRecord[];
  staffThreads: StaffThread[];
  staffThreadMessages: StaffThreadMessage[];
  staffAnnouncements: StaffAnnouncement[];
  customerAnnouncements: CustomerAnnouncement[];
  stories: Story[];
  storyViews: StoryView[];
  notifications: AppNotification[];
  pushSubscriptions: PushSubscriptionRecord[];
  activityEvents: ActivityEvent[];
  auditLogs: AuditLogEntry[];
}

export function createInitialMockState(): MockDatabaseState {
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  const bossProfile: Profile = {
    id: 'boss-1',
    role: 'boss',
    status: 'active',
    username: 'BOKA10',
    fullName: 'BOKA',
    email: 'boka@johnrambo.us',
    phone: '+13105550001',
    avatarPath: null,
    invitedBy: null,
    createdAt: hoursAgo(720),
    lastSeenAt: hoursAgo(0.1)
  };

  const employeeProfiles: Profile[] = [
    {
      id: 'emp-1',
      role: 'employee',
      status: 'active',
      username: 'GUZ',
      fullName: 'GUZ',
      email: 'guz@johnrambo.us',
      phone: '+13105550011',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(650),
      lastSeenAt: hoursAgo(0.2)
    },
    {
      id: 'emp-2',
      role: 'employee',
      status: 'active',
      username: 'NOX',
      fullName: 'NOX',
      email: 'nox@johnrambo.us',
      phone: '+13105550012',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(640),
      lastSeenAt: hoursAgo(0.5)
    },
    {
      id: 'emp-3',
      role: 'employee',
      status: 'active',
      username: 'BSTURN',
      fullName: 'BSTURN',
      email: 'bsturn@johnrambo.us',
      phone: '+13105550013',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(630),
      lastSeenAt: hoursAgo(1.2)
    },
    {
      id: 'emp-4',
      role: 'employee',
      status: 'active',
      username: 'ANKY',
      fullName: 'ANKY',
      email: 'anky@johnrambo.us',
      phone: '+13105550014',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(620),
      lastSeenAt: hoursAgo(0.8)
    }
  ];

  const staffProfiles: StaffProfile[] = [
    {
      userId: 'boss-1',
      publicAlias: 'BOKA',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: true,
      canPublishStories: true,
      canPostCustomerAnnouncements: true,
      createdAt: hoursAgo(720),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-1',
      publicAlias: 'GUZ',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: true,
      canPublishStories: true,
      canPostCustomerAnnouncements: true,
      createdAt: hoursAgo(650),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-2',
      publicAlias: 'NOX',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: false,
      canPublishStories: true,
      canPostCustomerAnnouncements: false,
      createdAt: hoursAgo(640),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-3',
      publicAlias: 'BSTURN',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: false,
      canPublishStories: false,
      canPostCustomerAnnouncements: false,
      createdAt: hoursAgo(630),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-4',
      publicAlias: 'ANKY',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: true,
      canPublishStories: false,
      canPostCustomerAnnouncements: true,
      createdAt: hoursAgo(620),
      updatedAt: hoursAgo(24)
    }
  ];

  const customerProfiles: Profile[] = [
    {
      id: 'cust-1',
      role: 'customer',
      status: 'active',
      username: 'member1',
      fullName: 'Member 1',
      email: 'member1@johnrambo.us',
      phone: '+13105550101',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(200),
      lastSeenAt: hoursAgo(0.4)
    },
    {
      id: 'cust-2',
      role: 'customer',
      status: 'active',
      username: 'member2',
      fullName: 'Member 2',
      email: 'member2@johnrambo.us',
      phone: '+13105550102',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(180),
      lastSeenAt: hoursAgo(0.8)
    },
    {
      id: 'cust-3',
      role: 'customer',
      status: 'active',
      username: 'CUSTOMER1',
      fullName: 'Customer 1',
      email: 'customer1@johnrambo.us',
      phone: '+13105550103',
      avatarPath: null,
      invitedBy: 'boss-1',
      approvedBy: 'boss-1',
      approvedAt: hoursAgo(150),
      createdAt: hoursAgo(150),
      lastSeenAt: hoursAgo(0.5)
    }
  ];

  const suspendedProfile: Profile = {
    id: 'cust-suspended',
    role: 'customer',
    status: 'suspended',
    fullName: 'Suspended Account',
    email: 'suspended@johnrambo.us',
    phone: '+13105550999',
    avatarPath: null,
    invitedBy: 'boss-1',
    createdAt: hoursAgo(400),
    lastSeenAt: hoursAgo(100)
  };

  const products: Product[] = [
    {
      id: 'prod-1',
      gameName: 'JR Vault',
      title: '25,000 Points Package',
      pointsQty: 25000,
      description: 'Standard virtual game-points allocation.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 18500,
      status: 'available',
      createdBy: 'boss-1',
      createdAt: hoursAgo(300),
      updatedAt: hoursAgo(24)
    },
    {
      id: 'prod-hidden',
      gameName: 'Internal Draft',
      title: 'Hidden Package',
      pointsQty: 500000,
      description: 'Internal staff-only draft listing.',
      imagePath: null,
      pricePaise: 150000,
      status: 'hidden',
      createdBy: 'boss-1',
      createdAt: hoursAgo(100),
      updatedAt: hoursAgo(2)
    }
  ];

  const conversations: Conversation[] = [
    {
      id: 'conv-1',
      customerId: 'cust-1',
      customerName: 'Member 1',
      customerEmail: 'member1@johnrambo.us',
      handledBy: 'emp-1',
      handledByName: 'GUZ',
      handledByAlias: 'GUZ',
      awaitingStaff: false,
      lastMessageAt: null,
      lastMessagePreview: null,
      customerLastReadAt: null,
      staffLastReadAt: null,
      customerUnreadCount: 0,
      staffUnreadCount: 0,
      createdAt: hoursAgo(200)
    },
    {
      id: 'conv-2',
      customerId: 'cust-2',
      customerName: 'Member 2',
      customerEmail: 'member2@johnrambo.us',
      handledBy: 'emp-2',
      handledByName: 'NOX',
      handledByAlias: 'NOX',
      awaitingStaff: false,
      lastMessageAt: null,
      lastMessagePreview: null,
      customerLastReadAt: null,
      staffLastReadAt: null,
      customerUnreadCount: 0,
      staffUnreadCount: 0,
      createdAt: hoursAgo(180)
    },
    {
      id: 'conv-3',
      customerId: 'cust-3',
      customerName: 'Customer 1',
      customerEmail: 'customer1@johnrambo.us',
      handledBy: 'emp-1',
      handledByName: 'GUZ',
      handledByAlias: 'GUZ',
      awaitingStaff: false,
      lastMessageAt: null,
      lastMessagePreview: null,
      customerLastReadAt: null,
      staffLastReadAt: null,
      customerUnreadCount: 0,
      staffUnreadCount: 0,
      createdAt: hoursAgo(150)
    }
  ];

  const staffThreads: StaffThread[] = [
    {
      id: 'sthread-boss',
      employeeId: 'boss-1',
      employeeName: 'BOKA',
      employeeAlias: 'BOSS',
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: hoursAgo(720)
    },
    {
      id: 'sthread-1',
      employeeId: 'emp-1',
      employeeName: 'GUZ',
      employeeAlias: 'GUZ',
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: hoursAgo(650)
    },
    {
      id: 'sthread-2',
      employeeId: 'emp-2',
      employeeName: 'NOX',
      employeeAlias: 'NOX',
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: hoursAgo(640)
    },
    {
      id: 'sthread-3',
      employeeId: 'emp-3',
      employeeName: 'BSTURN',
      employeeAlias: 'BSTURN',
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: hoursAgo(630)
    },
    {
      id: 'sthread-4',
      employeeId: 'emp-4',
      employeeName: 'ANKY',
      employeeAlias: 'ANKY',
      lastMessageAt: null,
      lastMessagePreview: null,
      createdAt: hoursAgo(620)
    }
  ];

  return {
    profiles: [bossProfile, ...employeeProfiles, ...customerProfiles, suspendedProfile],
    staffProfiles,
    appSettings: {
      employeeInboxScope: 'all',
      customerCanPickEmployee: false,
      ticketAutoCloseDays: 7,
      offerSanityMaxPaise: 100_000_000,
      businessHoursOnly: false,
      updatedBy: 'boss-1',
      updatedAt: hoursAgo(24)
    },
    invitations: [],
    products,
    conversations,
    messages: [],
    messageAttributions: [],
    offers: [],
    offerEvents: [],
    tickets: [],
    ticketMessages: [],
    ticketMessageAttributions: [],
    ticketEvents: [],
    complaintChatRooms: [],
    complaintChatMessages: [],
    customerPasswords: {
      'boss-1': 'Bokasuri10@',
      'emp-1': 'chotabhim',
      'emp-2': 'NOX',
      'emp-3': 'BSTURN',
      'emp-4': 'ANKY',
      'cust-1': 'initialPassword123',
      'cust-2': 'Member20@',
      'cust-3': 'Customer10@'
    },
    sentEmails: [],
    spinBonuses: [],
    staffThreads,
    staffThreadMessages: [],
    staffAnnouncements: [],
    customerAnnouncements: [],
    stories: [],
    storyViews: [],
    notifications: [],
    pushSubscriptions: [],
    activityEvents: [],
    auditLogs: []
  };
}

export function getEmployeesWithFlagsFromState(state: MockDatabaseState): EmployeeWithFlags[] {
  return state.profiles
    .filter((p) => p.role === 'employee')
    .map((emp) => {
      const sp = state.staffProfiles.find((s) => s.userId === emp.id) ?? {
        userId: emp.id,
        publicAlias: emp.fullName,
        customerSelectable: true,
        acceptsTickets: true,
        canManageProducts: false,
        canPublishStories: false,
        canPostCustomerAnnouncements: false,
        createdAt: emp.createdAt,
        updatedAt: emp.createdAt
      };
      return {
        ...emp,
        staffProfile: sp
      };
    });
}
