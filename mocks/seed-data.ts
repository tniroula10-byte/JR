/**
 * Realistic Pre-Seeded Dataset (`mocks/seed-data.ts`)
 * Capacity at launch: 20 active accounts (1 boss, 4 employees, 15 customers) + 1 suspended test account.
 */

import type {
  ActivityEvent,
  AppNotification,
  AppSettings,
  AuditLogEntry,
  Conversation,
  CustomerAnnouncement,
  EmployeeWithFlags,
  Invitation,
  MessageAttribution,
  Offer,
  OfferEvent,
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
  const now = new Date('2026-10-28T00:00:00.000Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const hoursAhead = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();

  const bossProfile: Profile = {
    id: 'boss-1',
    role: 'boss',
    status: 'active',
    fullName: 'Col. Rajesh Rathore (Boss)',
    email: 'boss@johnrambo.in',
    phone: '+919800000001',
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
      fullName: 'Vikram Singh',
      email: 'vikram@johnrambo.in',
      phone: '+919800000011',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(650),
      lastSeenAt: hoursAgo(0.2)
    },
    {
      id: 'emp-2',
      role: 'employee',
      status: 'active',
      fullName: 'Ananya Deshmukh',
      email: 'ananya@johnrambo.in',
      phone: '+919800000012',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(640),
      lastSeenAt: hoursAgo(0.5)
    },
    {
      id: 'emp-3',
      role: 'employee',
      status: 'active',
      fullName: 'Rohan Kulkarni',
      email: 'rohan@johnrambo.in',
      phone: '+919800000013',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(630),
      lastSeenAt: hoursAgo(1.2)
    },
    {
      id: 'emp-4',
      role: 'employee',
      status: 'active',
      fullName: 'Priya Nair',
      email: 'priya@johnrambo.in',
      phone: '+919800000014',
      avatarPath: null,
      invitedBy: 'boss-1',
      createdAt: hoursAgo(620),
      lastSeenAt: hoursAgo(0.8)
    }
  ];

  const staffProfiles: StaffProfile[] = [
    {
      userId: 'boss-1',
      publicAlias: 'Command',
      customerSelectable: false,
      acceptsTickets: true,
      canManageProducts: true,
      canPublishStories: true,
      canPostCustomerAnnouncements: true,
      createdAt: hoursAgo(720),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-1',
      publicAlias: 'Maverick',
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
      publicAlias: 'Valkyrie',
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
      publicAlias: 'Ghost',
      customerSelectable: false,
      acceptsTickets: true,
      canManageProducts: false,
      canPublishStories: false,
      canPostCustomerAnnouncements: false,
      createdAt: hoursAgo(630),
      updatedAt: hoursAgo(24)
    },
    {
      userId: 'emp-4',
      publicAlias: 'Phoenix',
      customerSelectable: true,
      acceptsTickets: true,
      canManageProducts: true,
      canPublishStories: false,
      canPostCustomerAnnouncements: true,
      createdAt: hoursAgo(620),
      updatedAt: hoursAgo(24)
    }
  ];

  const customerNames = [
    'Aarav Mehta',
    'Kabir Sharma',
    'Ishaan Verma',
    'Zoya Khan',
    'Riya Patel',
    'Devansh Gupta',
    'Neha Reddy',
    'Siddharth Joshi',
    'Tanvi Malhotra',
    'Arjun Nair',
    'Karan Bansal',
    'Meera Iyer',
    'Harshita Rao',
    'Yashvardhan Chauhan',
    'Pranav Kapoor'
  ];

  const customerProfiles: Profile[] = customerNames.map((name, idx) => {
    const num = idx + 1;
    const slug = name.toLowerCase().replace(/\s+/g, '.');
    return {
      id: `cust-${num}`,
      role: 'customer',
      status: 'active',
      fullName: name,
      email: `${slug}@gamer.in`,
      phone: `+9198111000${String(num).padStart(2, '0')}`,
      avatarPath: null,
      invitedBy: num <= 10 ? 'boss-1' : 'emp-1',
      createdAt: hoursAgo(500 - num * 12),
      lastSeenAt: hoursAgo(num * 0.4)
    };
  });

  const suspendedProfile: Profile = {
    id: 'cust-suspended',
    role: 'customer',
    status: 'suspended',
    fullName: 'Suspended Trader',
    email: 'suspended@gamer.in',
    phone: '+919899999999',
    avatarPath: null,
    invitedBy: 'boss-1',
    createdAt: hoursAgo(400),
    lastSeenAt: hoursAgo(100)
  };

  const products: Product[] = [
    {
      id: 'prod-1',
      gameName: 'Valorant India Vault',
      title: 'Valorant 25,000 VP Sovereign Bundle Credits',
      pointsQty: 25000,
      description:
        'Instant regional transfer of 25,000 Valorant Points for high-tier skin bundles and Battlepass unlocks. Verified Riot ID transfer after offer confirmation.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 1850000, // ₹18,500
      status: 'available',
      createdBy: 'boss-1',
      createdAt: hoursAgo(300),
      updatedAt: hoursAgo(24)
    },
    {
      id: 'prod-2',
      gameName: 'BGMI Royal Syndicate',
      title: 'BGMI 60,000 UC Mythic Forge Pack',
      pointsQty: 60000,
      description:
        'Bulk Unknown Cash (UC) package tailored for X-Suit upgrades, M416 Glacier lab materials, and clan tournament crates.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 4200000, // ₹42,000
      status: 'available',
      createdBy: 'boss-1',
      createdAt: hoursAgo(280),
      updatedAt: hoursAgo(12)
    },
    {
      id: 'prod-3',
      gameName: 'EA Sports FC 26 Ultimate',
      title: '1,50,000 FC Points Founders Reserve',
      pointsQty: 150000,
      description:
        'High-roller FC Points allocation for Icon Promo Packs and Team of the Year drafts. Submit your rupee offer to negotiate bulk pricing.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 9500000, // ₹95,000
      status: 'available',
      createdBy: 'emp-1',
      createdAt: hoursAgo(240),
      updatedAt: hoursAgo(10)
    },
    {
      id: 'prod-4',
      gameName: 'Genshin Impact Celestia',
      title: '32,400 Genesis Crystals Archon Tier',
      pointsQty: 32400,
      description:
        'UID top-up allocation for C6 Banner pulls and signature weapon refinements. Delivered with official receipt log.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 2450000, // ₹24,500
      status: 'available',
      createdBy: 'boss-1',
      createdAt: hoursAgo(200),
      updatedAt: hoursAgo(8)
    },
    {
      id: 'prod-5',
      gameName: 'Call of Duty Mobile',
      title: '50,000 COD Points Mythic Drop Reserve',
      pointsQty: 50000,
      description:
        'Full Mythic weapon draw + max upgrade cards package. Currently out of stock pending next syndicate replenishment.',
      imagePath: '/icons/icon-512.svg',
      pricePaise: 3600000, // ₹36,000
      status: 'sold_out',
      createdBy: 'boss-1',
      createdAt: hoursAgo(190),
      updatedAt: hoursAgo(6)
    },
    {
      id: 'prod-hidden',
      gameName: 'Internal Vault Test',
      title: 'Unreleased 5,00,000 Obsidian Points (Hidden Draft)',
      pointsQty: 500000,
      description:
        'Internal staff-only draft listing. Must never be visible to any customer query or API call.',
      imagePath: null,
      pricePaise: 15000000, // ₹1,50,000
      status: 'hidden',
      createdBy: 'boss-1',
      createdAt: hoursAgo(100),
      updatedAt: hoursAgo(2)
    }
  ];

  const conversations: Conversation[] = customerProfiles.map((cust, idx) => {
    const num = idx + 1;
    if (num === 1) {
      return {
        id: 'conv-1',
        customerId: 'cust-1',
        customerName: cust.fullName,
        customerEmail: cust.email,
        handledBy: 'emp-1',
        handledByName: 'Vikram Singh',
        handledByAlias: 'Maverick',
        awaitingStaff: false,
        lastMessageAt: hoursAgo(0.5),
        lastMessagePreview: 'We have countered your BGMI 60,000 UC offer at ₹39,500.',
        customerLastReadAt: hoursAgo(1),
        staffLastReadAt: hoursAgo(0.4),
        customerUnreadCount: 1,
        staffUnreadCount: 0,
        createdAt: cust.createdAt
      };
    }
    if (num === 2) {
      return {
        id: 'conv-2',
        customerId: 'cust-2',
        customerName: cust.fullName,
        customerEmail: cust.email,
        handledBy: 'emp-2',
        handledByName: 'Ananya Deshmukh',
        handledByAlias: 'Valkyrie',
        awaitingStaff: true,
        lastMessageAt: hoursAgo(0.25),
        lastMessagePreview: 'Can we lock in the 25,000 VP bundle today if I take two packs?',
        customerLastReadAt: hoursAgo(0.25),
        staffLastReadAt: hoursAgo(2),
        customerUnreadCount: 0,
        staffUnreadCount: 1,
        createdAt: cust.createdAt
      };
    }
    return {
      id: `conv-${num}`,
      customerId: cust.id,
      customerName: cust.fullName,
      customerEmail: cust.email,
      handledBy: num % 2 === 0 ? 'emp-3' : null,
      handledByName: num % 2 === 0 ? 'Rohan Kulkarni' : null,
      handledByAlias: num % 2 === 0 ? 'Ghost' : null,
      awaitingStaff: false,
      lastMessageAt: hoursAgo(24 + num),
      lastMessagePreview: 'Welcome to John Rambo private point exchange.',
      customerLastReadAt: hoursAgo(12),
      staffLastReadAt: hoursAgo(12),
      customerUnreadCount: 0,
      staffUnreadCount: 0,
      createdAt: cust.createdAt
    };
  });

  const offers: Offer[] = [
    {
      id: 'offer-1',
      productId: 'prod-2',
      customerId: 'cust-1',
      customerName: 'Aarav Mehta',
      conversationId: 'conv-1',
      offeredPricePaise: 3800000, // ₹38,000
      listedPricePaise: 4200000, // ₹42,000
      productTitle: 'BGMI 60,000 UC Mythic Forge Pack',
      gameName: 'BGMI Royal Syndicate',
      status: 'countered',
      counterPricePaise: 3950000, // ₹39,500
      staffNote: 'Best wholesale syndicate rate for immediate transfer.',
      handledBy: 'emp-1',
      handledByName: 'Vikram Singh',
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(0.5)
    },
    {
      id: 'offer-2',
      productId: 'prod-1',
      customerId: 'cust-2',
      customerName: 'Kabir Sharma',
      conversationId: 'conv-2',
      offeredPricePaise: 1720000, // ₹17,200
      listedPricePaise: 1850000, // ₹18,500
      productTitle: 'Valorant 25,000 VP Sovereign Bundle Credits',
      gameName: 'Valorant India Vault',
      status: 'pending',
      counterPricePaise: null,
      staffNote: null,
      handledBy: null,
      handledByName: null,
      createdAt: hoursAgo(1.5),
      updatedAt: hoursAgo(1.5)
    },
    {
      id: 'offer-3',
      productId: 'prod-4',
      customerId: 'cust-1',
      customerName: 'Aarav Mehta',
      conversationId: 'conv-1',
      offeredPricePaise: 2350000, // ₹23,500
      listedPricePaise: 2450000, // ₹24,500
      productTitle: '32,400 Genesis Crystals Archon Tier',
      gameName: 'Genshin Impact Celestia',
      status: 'accepted',
      counterPricePaise: null,
      staffNote: 'Approved! Coordinate UID transfer in chat.',
      handledBy: 'emp-2',
      handledByName: 'Ananya Deshmukh',
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(47)
    }
  ];

  const offerEvents: OfferEvent[] = [
    {
      id: 'oe-1',
      offerId: 'offer-1',
      actorId: 'cust-1',
      event: 'submitted',
      meta: { offered_price_paise: 3800000, listed_price_paise: 4200000 },
      createdAt: hoursAgo(3)
    },
    {
      id: 'oe-2',
      offerId: 'offer-1',
      actorId: 'emp-1',
      event: 'countered',
      meta: { counter_price_paise: 3950000, note: 'Best wholesale syndicate rate for immediate transfer.' },
      createdAt: hoursAgo(0.5)
    },
    {
      id: 'oe-3',
      offerId: 'offer-2',
      actorId: 'cust-2',
      event: 'submitted',
      meta: { offered_price_paise: 1720000, listed_price_paise: 1850000 },
      createdAt: hoursAgo(1.5)
    },
    {
      id: 'oe-4',
      offerId: 'offer-3',
      actorId: 'cust-1',
      event: 'submitted',
      meta: { offered_price_paise: 2350000, listed_price_paise: 2450000 },
      createdAt: hoursAgo(48)
    },
    {
      id: 'oe-5',
      offerId: 'offer-3',
      actorId: 'emp-2',
      event: 'accepted',
      meta: { accepted_price_paise: 2350000 },
      createdAt: hoursAgo(47)
    }
  ];

  const messages: RawMessageRecord[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderKind: 'customer',
      customerSenderId: 'cust-1',
      type: 'text',
      body: 'Hi team, looking to pick up the BGMI 60,000 UC pack today. Sending my offer now.',
      offerId: null,
      clientMsgId: 'seed-c1-1',
      createdAt: hoursAgo(3.1)
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      senderKind: 'customer',
      customerSenderId: 'cust-1',
      type: 'offer',
      body: 'Submitted an offer of ₹38,000 for BGMI 60,000 UC Mythic Forge Pack (Listed: ₹42,000).',
      offerId: 'offer-1',
      clientMsgId: 'seed-c1-2',
      createdAt: hoursAgo(3.0)
    },
    {
      id: 'msg-3',
      conversationId: 'conv-1',
      senderKind: 'staff',
      customerSenderId: null,
      type: 'text',
      body: 'Hello Aarav! Thanks for reaching out. We reviewed your offer with our inventory desk.',
      offerId: null,
      clientMsgId: 'seed-s1-1',
      createdAt: hoursAgo(2.9)
    },
    {
      id: 'msg-4',
      conversationId: 'conv-1',
      senderKind: 'staff',
      customerSenderId: null,
      type: 'offer',
      body: 'We have countered your BGMI 60,000 UC offer at ₹39,500.',
      offerId: 'offer-1',
      clientMsgId: 'seed-s1-2',
      createdAt: hoursAgo(0.5)
    },
    {
      id: 'msg-5',
      conversationId: 'conv-2',
      senderKind: 'customer',
      customerSenderId: 'cust-2',
      type: 'offer',
      body: 'Submitted an offer of ₹17,200 for Valorant 25,000 VP Sovereign Bundle Credits (Listed: ₹18,500).',
      offerId: 'offer-2',
      clientMsgId: 'seed-c2-1',
      createdAt: hoursAgo(1.5)
    },
    {
      id: 'msg-6',
      conversationId: 'conv-2',
      senderKind: 'customer',
      customerSenderId: 'cust-2',
      type: 'text',
      body: 'Can we lock in the 25,000 VP bundle today if I take two packs?',
      offerId: null,
      clientMsgId: 'seed-c2-2',
      createdAt: hoursAgo(0.25)
    }
  ];

  const messageAttributions: MessageAttribution[] = [
    {
      messageId: 'msg-3',
      staffId: 'emp-1',
      createdAt: hoursAgo(2.9)
    },
    {
      messageId: 'msg-4',
      staffId: 'emp-1',
      createdAt: hoursAgo(0.5)
    }
  ];

  const tickets: Ticket[] = [
    {
      id: 'tkt-1',
      ticketNo: 1001,
      customerId: 'cust-1',
      customerName: 'Aarav Mehta',
      subject: 'UID verification for 32,400 Genesis Crystals delivery',
      description: 'My offer #offer-3 was accepted. Sharing my Asia Server UID 800419283 for batch scheduling.',
      category: 'points_delivery',
      priority: 'high',
      status: 'in_progress',
      assignedEmployeeId: 'emp-1',
      assignedEmployeeName: 'Vikram Singh',
      assignedEmployeeAlias: 'Maverick',
      requestedEmployeeId: 'emp-1',
      requestedEmployeeAlias: 'Maverick',
      reopenCount: 0,
      createdAt: hoursAgo(20),
      firstResponseAt: hoursAgo(19.8),
      resolvedAt: null,
      closedAt: null
    },
    {
      id: 'tkt-2',
      ticketNo: 1002,
      customerId: 'cust-2',
      customerName: 'Kabir Sharma',
      subject: 'Bulk clan pricing inquiry for 3x Valorant bundles',
      description: 'Looking to coordinate point transfers for three clan teammates this weekend.',
      category: 'offer_inquiry',
      priority: 'normal',
      status: 'open',
      assignedEmployeeId: null,
      assignedEmployeeName: null,
      assignedEmployeeAlias: null,
      requestedEmployeeId: null,
      requestedEmployeeAlias: null,
      reopenCount: 0,
      createdAt: hoursAgo(4),
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null
    },
    {
      id: 'tkt-3',
      ticketNo: 1003,
      customerId: 'cust-1',
      customerName: 'Aarav Mehta',
      subject: 'Receipt confirmation for previous FC Points order',
      description: 'Please confirm the transfer reference code for my last FC Points batch.',
      category: 'general',
      priority: 'low',
      status: 'resolved',
      assignedEmployeeId: 'emp-2',
      assignedEmployeeName: 'Ananya Deshmukh',
      assignedEmployeeAlias: 'Valkyrie',
      requestedEmployeeId: null,
      requestedEmployeeAlias: null,
      reopenCount: 0,
      createdAt: hoursAgo(36),
      firstResponseAt: hoursAgo(35.5),
      resolvedAt: hoursAgo(24),
      closedAt: null
    }
  ];

  const ticketMessages: RawTicketMessageRecord[] = [
    {
      id: 'tmsg-1',
      ticketId: 'tkt-1',
      senderKind: 'customer',
      customerSenderId: 'cust-1',
      body: 'My offer #offer-3 was accepted. Sharing my Asia Server UID 800419283 for batch scheduling.',
      createdAt: hoursAgo(20)
    },
    {
      id: 'tmsg-2',
      ticketId: 'tkt-1',
      senderKind: 'staff',
      customerSenderId: null,
      body: 'UID 800419283 verified on Asia server. Your 32,400 Genesis Crystals allocation is queued for the 18:00 IST dispatch window.',
      createdAt: hoursAgo(19.8)
    },
    {
      id: 'tmsg-3',
      ticketId: 'tkt-3',
      senderKind: 'customer',
      customerSenderId: 'cust-1',
      body: 'Please confirm the transfer reference code for my last FC Points batch.',
      createdAt: hoursAgo(36)
    },
    {
      id: 'tmsg-4',
      ticketId: 'tkt-3',
      senderKind: 'staff',
      customerSenderId: null,
      body: 'Reference ID is JR-FC26-99412. Marking this ticket resolved — please click Confirm Resolution if everything looks good!',
      createdAt: hoursAgo(35.5)
    }
  ];

  const ticketMessageAttributions: RawTicketAttributionRecord[] = [
    {
      ticketMessageId: 'tmsg-2',
      staffId: 'emp-1',
      createdAt: hoursAgo(19.8)
    },
    {
      ticketMessageId: 'tmsg-4',
      staffId: 'emp-2',
      createdAt: hoursAgo(35.5)
    }
  ];

  const ticketEvents: TicketEvent[] = [
    {
      id: 'tev-1',
      ticketId: 'tkt-1',
      actorId: 'cust-1',
      actorDisplayName: 'Aarav Mehta',
      event: 'created',
      fromValue: null,
      toValue: 'assigned',
      createdAt: hoursAgo(20)
    },
    {
      id: 'tev-2',
      ticketId: 'tkt-1',
      actorId: 'boss-1',
      actorDisplayName: 'John Rambo Support',
      event: 'assigned',
      fromValue: null,
      toValue: 'emp-1',
      createdAt: hoursAgo(20)
    },
    {
      id: 'tev-3',
      ticketId: 'tkt-1',
      actorId: 'emp-1',
      actorDisplayName: 'John Rambo Support',
      event: 'replied',
      fromValue: 'assigned',
      toValue: 'in_progress',
      createdAt: hoursAgo(19.8)
    },
    {
      id: 'tev-4',
      ticketId: 'tkt-2',
      actorId: 'cust-2',
      actorDisplayName: 'Kabir Sharma',
      event: 'created',
      fromValue: null,
      toValue: 'open',
      createdAt: hoursAgo(4)
    },
    {
      id: 'tev-5',
      ticketId: 'tkt-3',
      actorId: 'boss-1',
      actorDisplayName: 'John Rambo Support',
      event: 'assigned',
      fromValue: null,
      toValue: 'emp-2',
      createdAt: hoursAgo(36)
    },
    {
      id: 'tev-6',
      ticketId: 'tkt-3',
      actorId: 'emp-2',
      actorDisplayName: 'John Rambo Support',
      event: 'resolved',
      fromValue: 'in_progress',
      toValue: 'resolved',
      createdAt: hoursAgo(24)
    }
  ];

  const staffThreads: StaffThread[] = [
    {
      id: 'sthread-1',
      employeeId: 'emp-1',
      employeeName: 'Vikram Singh',
      employeeAlias: 'Maverick',
      lastMessageAt: hoursAgo(1),
      lastMessagePreview: 'Copy that Colonel, holding minimum ₹39,500 on the BGMI 60k pack.',
      createdAt: hoursAgo(650)
    },
    {
      id: 'sthread-2',
      employeeId: 'emp-2',
      employeeName: 'Ananya Deshmukh',
      employeeAlias: 'Valkyrie',
      lastMessageAt: hoursAgo(5),
      lastMessagePreview: 'Genshin Archon batch for Aarav is cleared.',
      createdAt: hoursAgo(640)
    },
    {
      id: 'sthread-3',
      employeeId: 'emp-3',
      employeeName: 'Rohan Kulkarni',
      employeeAlias: 'Ghost',
      lastMessageAt: hoursAgo(12),
      lastMessagePreview: 'Standing by for evening ticket queue.',
      createdAt: hoursAgo(630)
    },
    {
      id: 'sthread-4',
      employeeId: 'emp-4',
      employeeName: 'Priya Nair',
      employeeAlias: 'Phoenix',
      lastMessageAt: hoursAgo(18),
      lastMessagePreview: 'Updated the Diwali weekend announcement draft.',
      createdAt: hoursAgo(620)
    }
  ];

  const staffThreadMessages: StaffThreadMessage[] = [
    {
      id: 'stm-1',
      threadId: 'sthread-1',
      senderId: 'boss-1',
      senderName: 'Col. Rajesh Rathore (Boss)',
      senderRole: 'boss',
      body: 'Vikram, keep the floor on BGMI 60,000 UC at ₹39,500 today. Do not dip below 6% margin.',
      createdAt: hoursAgo(1.5)
    },
    {
      id: 'stm-2',
      threadId: 'sthread-1',
      senderId: 'emp-1',
      senderName: 'Vikram Singh',
      senderRole: 'employee',
      body: 'Copy that Colonel, holding minimum ₹39,500 on the BGMI 60k pack.',
      createdAt: hoursAgo(1.0)
    },
    {
      id: 'stm-3',
      threadId: 'sthread-2',
      senderId: 'boss-1',
      senderName: 'Col. Rajesh Rathore (Boss)',
      senderRole: 'boss',
      body: 'Ananya, great turnaround time on Ticket #1003.',
      createdAt: hoursAgo(5.5)
    },
    {
      id: 'stm-4',
      threadId: 'sthread-2',
      senderId: 'emp-2',
      senderName: 'Ananya Deshmukh',
      senderRole: 'employee',
      body: 'Genshin Archon batch for Aarav is cleared.',
      createdAt: hoursAgo(5.0)
    },
    {
      id: 'stm-5',
      threadId: 'sthread-3',
      senderId: 'emp-3',
      senderName: 'Rohan Kulkarni',
      senderRole: 'employee',
      body: 'Standing by for evening ticket queue.',
      createdAt: hoursAgo(12)
    },
    {
      id: 'stm-6',
      threadId: 'sthread-4',
      senderId: 'emp-4',
      senderName: 'Priya Nair',
      senderRole: 'employee',
      body: 'Updated the Diwali weekend announcement draft.',
      createdAt: hoursAgo(18)
    }
  ];

  const staffAnnouncements: StaffAnnouncement[] = [
    {
      id: 'sann-1',
      authorId: 'boss-1',
      authorName: 'Col. Rajesh Rathore (Boss)',
      title: 'Floor Price Guardrails — Q4 Syndicate Drop',
      body: 'All staff: Maximum discount without Boss counter-signature is 8% off listed paise price. Acknowledge this directive before taking today’s offer queue.',
      priority: 'urgent',
      createdAt: hoursAgo(10),
      acks: [
        {
          announcementId: 'sann-1',
          employeeId: 'emp-1',
          employeeName: 'Vikram Singh',
          acknowledgedAt: hoursAgo(9.5)
        },
        {
          announcementId: 'sann-1',
          employeeId: 'emp-2',
          employeeName: 'Ananya Deshmukh',
          acknowledgedAt: hoursAgo(9.1)
        }
      ]
    },
    {
      id: 'sann-2',
      authorId: 'boss-1',
      authorName: 'Col. Rajesh Rathore (Boss)',
      title: 'Weekend Dispatch Window Schedule',
      body: 'Riot VP and BGMI UC settlements will run every 2 hours between 10:00 IST and 23:00 IST.',
      priority: 'important',
      createdAt: hoursAgo(48),
      acks: [
        {
          announcementId: 'sann-2',
          employeeId: 'emp-1',
          employeeName: 'Vikram Singh',
          acknowledgedAt: hoursAgo(47)
        },
        {
          announcementId: 'sann-2',
          employeeId: 'emp-2',
          employeeName: 'Ananya Deshmukh',
          acknowledgedAt: hoursAgo(46)
        },
        {
          announcementId: 'sann-2',
          employeeId: 'emp-3',
          employeeName: 'Rohan Kulkarni',
          acknowledgedAt: hoursAgo(45)
        },
        {
          announcementId: 'sann-2',
          employeeId: 'emp-4',
          employeeName: 'Priya Nair',
          acknowledgedAt: hoursAgo(44)
        }
      ]
    }
  ];

  const customerAnnouncements: CustomerAnnouncement[] = [
    {
      id: 'cann-1',
      authorId: 'boss-1',
      title: 'Valorant Champions & BGMI Mythic Restock Live',
      body: 'Fresh allocations of 25,000 VP and 60,000 UC packs are now live in the catalog. Submit your best INR offer directly on any product card to start real-time negotiation with John Rambo Support.',
      pinned: true,
      publishedAt: hoursAgo(14)
    },
    {
      id: 'cann-2',
      authorId: 'emp-4',
      title: 'Verified Instant UID Transfers (10:00 – 23:00 IST)',
      body: 'All accepted offers are fulfilled through verified game UID transfers. Open a support ticket anytime if you need priority tournament scheduling.',
      pinned: false,
      publishedAt: hoursAgo(72)
    }
  ];

  const stories: Story[] = [
    {
      id: 'story-1',
      authorId: 'boss-1',
      kind: 'text',
      mediaPath: null,
      caption: '🔥 FLASH DROP: 1,50,000 EA FC 26 Points Founders Reserve now open for private rupee offers!',
      bgStyle: 'from-violet-900 via-indigo-950 to-slate-950',
      createdAt: hoursAgo(4),
      expiresAt: hoursAhead(20),
      viewCount: 2,
      viewedByCaller: false
    },
    {
      id: 'story-2',
      authorId: 'emp-1',
      kind: 'image',
      mediaPath: '/icons/icon-512.svg',
      caption: '⚡ BGMI 60,000 UC Mythic Forge crates restocked — 8 packs remaining today.',
      bgStyle: 'from-purple-900 via-slate-900 to-black',
      createdAt: hoursAgo(6),
      expiresAt: hoursAhead(18),
      viewCount: 1,
      viewedByCaller: false
    },
    {
      id: 'story-expired',
      authorId: 'boss-1',
      kind: 'text',
      mediaPath: null,
      caption: 'Expired Yesterday Flash Sale (Must never appear to customers)',
      bgStyle: 'from-slate-800 to-black',
      createdAt: hoursAgo(30),
      expiresAt: hoursAgo(6),
      viewCount: 5,
      viewedByCaller: false
    }
  ];

  const storyViews: StoryView[] = [
    {
      storyId: 'story-1',
      customerId: 'cust-2',
      customerName: 'Kabir Sharma',
      viewedAt: hoursAgo(2)
    },
    {
      storyId: 'story-1',
      customerId: 'cust-3',
      customerName: 'Ishaan Verma',
      viewedAt: hoursAgo(1)
    },
    {
      storyId: 'story-2',
      customerId: 'cust-2',
      customerName: 'Kabir Sharma',
      viewedAt: hoursAgo(1.5)
    }
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-c1-1',
      recipientId: 'cust-1',
      type: 'offer_countered',
      title: 'Counter Offer from John Rambo Support',
      body: 'John Rambo Support countered your offer on BGMI 60,000 UC Mythic Forge Pack at ₹39,500.',
      link: '/offers',
      payload: { offerId: 'offer-1' },
      readAt: null,
      createdAt: hoursAgo(0.5)
    },
    {
      id: 'notif-c1-2',
      recipientId: 'cust-1',
      type: 'ticket_resolved',
      title: 'Ticket #1003 Marked Resolved',
      body: 'John Rambo Support resolved your ticket "Receipt confirmation for previous FC Points order".',
      link: '/tickets',
      payload: { ticketId: 'tkt-3' },
      readAt: null,
      createdAt: hoursAgo(24)
    },
    {
      id: 'notif-e1-1',
      recipientId: 'emp-1',
      type: 'staff_announcement',
      title: 'Urgent Boss Directive',
      body: 'Floor Price Guardrails — Q4 Syndicate Drop',
      link: '/employee/announcements',
      payload: { announcementId: 'sann-1' },
      readAt: null,
      createdAt: hoursAgo(10)
    },
    {
      id: 'notif-b1-1',
      recipientId: 'boss-1',
      type: 'offer_submitted',
      title: 'New Pending Offer (₹17,200)',
      body: 'Kabir Sharma offered ₹17,200 on Valorant 25,000 VP Sovereign Bundle Credits.',
      link: '/boss/inbox',
      payload: { offerId: 'offer-2' },
      readAt: null,
      createdAt: hoursAgo(1.5)
    }
  ];

  const activityEvents: ActivityEvent[] = [
    {
      id: 'act-1',
      occurredAt: hoursAgo(2.9),
      actorId: 'emp-1',
      actorName: 'Vikram Singh',
      actorRole: 'employee',
      eventType: 'staff_chat_reply',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      ticketId: null,
      offerId: null,
      messageId: 'msg-3',
      meta: { is_first_response: true, first_response_seconds: 360 }
    },
    {
      id: 'act-2',
      occurredAt: hoursAgo(0.5),
      actorId: 'emp-1',
      actorName: 'Vikram Singh',
      actorRole: 'employee',
      eventType: 'staff_chat_reply',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      ticketId: null,
      offerId: 'offer-1',
      messageId: 'msg-4',
      meta: { is_first_response: false }
    },
    {
      id: 'act-3',
      occurredAt: hoursAgo(0.5),
      actorId: 'emp-1',
      actorName: 'Vikram Singh',
      actorRole: 'employee',
      eventType: 'offer_countered',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      ticketId: null,
      offerId: 'offer-1',
      messageId: null,
      meta: { counter_price_paise: 3950000 }
    },
    {
      id: 'act-4',
      occurredAt: hoursAgo(19.8),
      actorId: 'emp-1',
      actorName: 'Vikram Singh',
      actorRole: 'employee',
      eventType: 'staff_ticket_reply',
      customerId: 'cust-1',
      conversationId: null,
      ticketId: 'tkt-1',
      offerId: null,
      messageId: 'tmsg-2',
      meta: { is_first_response: true, first_response_seconds: 720 }
    },
    {
      id: 'act-5',
      occurredAt: hoursAgo(47),
      actorId: 'emp-2',
      actorName: 'Ananya Deshmukh',
      actorRole: 'employee',
      eventType: 'offer_accepted',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      ticketId: null,
      offerId: 'offer-3',
      messageId: null,
      meta: { accepted_price_paise: 2350000 }
    },
    {
      id: 'act-6',
      occurredAt: hoursAgo(35.5),
      actorId: 'emp-2',
      actorName: 'Ananya Deshmukh',
      actorRole: 'employee',
      eventType: 'staff_ticket_reply',
      customerId: 'cust-1',
      conversationId: null,
      ticketId: 'tkt-3',
      offerId: null,
      messageId: 'tmsg-4',
      meta: { is_first_response: true, first_response_seconds: 1800 }
    },
    {
      id: 'act-7',
      occurredAt: hoursAgo(24),
      actorId: 'emp-2',
      actorName: 'Ananya Deshmukh',
      actorRole: 'employee',
      eventType: 'ticket_resolved',
      customerId: 'cust-1',
      conversationId: null,
      ticketId: 'tkt-3',
      offerId: null,
      messageId: null,
      meta: { credited_employee_id: 'emp-2', resolution_seconds: 43200 }
    },
    {
      id: 'act-8',
      occurredAt: hoursAgo(15),
      actorId: 'emp-3',
      actorName: 'Rohan Kulkarni',
      actorRole: 'employee',
      eventType: 'staff_chat_reply',
      customerId: 'cust-4',
      conversationId: 'conv-4',
      ticketId: null,
      offerId: null,
      messageId: null,
      meta: { is_first_response: true, first_response_seconds: 540 }
    }
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      actorId: 'boss-1',
      actorName: 'Col. Rajesh Rathore (Boss)',
      action: 'boss_bootstrap',
      entity: 'profiles',
      entityId: 'boss-1',
      beforeMeta: null,
      afterMeta: { email: 'boss@johnrambo.in', role: 'boss' },
      ip: '127.0.0.1',
      createdAt: hoursAgo(720)
    },
    {
      id: 'aud-2',
      actorId: 'boss-1',
      actorName: 'Col. Rajesh Rathore (Boss)',
      action: 'invite_user',
      entity: 'invitations',
      entityId: 'inv-1',
      beforeMeta: null,
      afterMeta: { email: 'vikram@johnrambo.in', intendedRole: 'employee' },
      ip: '127.0.0.1',
      createdAt: hoursAgo(650)
    },
    {
      id: 'aud-3',
      actorId: 'emp-1',
      actorName: 'Vikram Singh',
      action: 'invite_user',
      entity: 'invitations',
      entityId: 'inv-2',
      beforeMeta: null,
      afterMeta: { email: 'karan.bansal@gamer.in', intendedRole: 'customer' },
      ip: '127.0.0.1',
      createdAt: hoursAgo(360)
    }
  ];

  const invitations: Invitation[] = [
    {
      id: 'inv-1',
      email: 'vikram@johnrambo.in',
      intendedRole: 'employee',
      fullName: 'Vikram Singh',
      phone: '+919800000011',
      invitedBy: 'boss-1',
      invitedByName: 'Col. Rajesh Rathore (Boss)',
      status: 'accepted',
      createdAt: hoursAgo(650),
      expiresAt: hoursAgo(482),
      acceptedAt: hoursAgo(649)
    },
    {
      id: 'inv-2',
      email: 'karan.bansal@gamer.in',
      intendedRole: 'customer',
      fullName: 'Karan Bansal',
      phone: '+919811100011',
      invitedBy: 'emp-1',
      invitedByName: 'Vikram Singh',
      status: 'accepted',
      createdAt: hoursAgo(360),
      expiresAt: hoursAgo(192),
      acceptedAt: hoursAgo(358)
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
    invitations,
    products,
    conversations,
    messages,
    messageAttributions,
    offers,
    offerEvents,
    tickets,
    ticketMessages,
    ticketMessageAttributions,
    ticketEvents,
    staffThreads,
    staffThreadMessages,
    staffAnnouncements,
    customerAnnouncements,
    stories,
    storyViews,
    notifications,
    pushSubscriptions: [],
    activityEvents,
    auditLogs
  };
}

export function getEmployeesWithFlagsFromState(state: MockDatabaseState): EmployeeWithFlags[] {
  return state.profiles
    .filter((p) => p.role === 'employee')
    .map((emp) => {
      const sp = state.staffProfiles.find((s) => s.userId === emp.id) ?? {
        userId: emp.id,
        publicAlias: emp.fullName.split(' ')[0] ?? 'Agent',
        customerSelectable: false,
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
