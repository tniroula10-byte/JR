/**
 * Shared Zod Validation Schemas (`lib/validation/schemas.ts`)
 * Used across client forms, Server Actions, API routes, and unit tests.
 */
import { z } from 'zod';

export const E164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must start with + and the country code (e.g., +14155550199)');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

export const MagicLinkLoginSchema = z.object({
  email: EmailSchema
});

export const InviteUserSchema = z.object({
  email: EmailSchema,
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(80),
  phone: E164PhoneSchema.optional().or(z.literal('')),
  intendedRole: z.enum(['customer', 'employee']),
  publicAlias: z.string().trim().min(2).max(40).optional(),
  username: z.string().trim().min(2).max(40).optional(),
  initialPassword: z.string().trim().min(2).max(128).optional()
});

export const UpdateCustomerProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name is too short').max(80, 'Name is too long'),
  email: EmailSchema,
  phone: E164PhoneSchema
});

export const BASIC_PASSWORD_RULE_TEXT =
  'Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character (e.g. Abcd123@).';

export function validateBasicPasswordFormat(password: string): {
  valid: boolean;
  error?: string;
} {
  if (
    !password ||
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return {
      valid: false,
      error: `INVALID_PASSWORD: ${BASIC_PASSWORD_RULE_TEXT}`
    };
  }
  return { valid: true };
}

export const BasicPasswordSchema = z
  .string()
  .min(8, BASIC_PASSWORD_RULE_TEXT)
  .max(128, 'Password is too long')
  .refine((val) => validateBasicPasswordFormat(val).valid, {
    message: BASIC_PASSWORD_RULE_TEXT
  });

export const ChangeCustomerPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: BasicPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password')
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword']
  });

export const SubmitOfferSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  offeredPricePaise: z
    .number()
    .int('Offer must be in integer paise')
    .min(100, 'Minimum offer is ₹1 (100 paise)')
    .max(100_000_000, 'Offer exceeds sanity cap of ₹10,00,000'),
  clientMsgId: z.string().min(4).max(120)
});

export const RespondToOfferSchema = z
  .object({
    offerId: z.string().min(1),
    action: z.enum(['counter', 'accept', 'reject']),
    counterPricePaise: z.number().int().positive().max(100_000_000).optional(),
    note: z.string().trim().max(500).optional()
  })
  .refine(
    (data) => (data.action === 'counter' ? typeof data.counterPricePaise === 'number' && data.counterPricePaise >= 100 : true),
    { message: 'Counter offer requires a valid counter price in paise', path: ['counterPricePaise'] }
  );

export const SendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
  clientMsgId: z.string().min(4).max(120)
});

export const CreateTicketSchema = z.object({
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(140),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(4000),
  category: z.enum(['general', 'points_delivery', 'offer_inquiry', 'account_support']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  requestedEmployeeId: z.string().optional().nullable()
});

export const ReplyTicketSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1, 'Reply cannot be empty').max(3000)
});

export const TransitionTicketSchema = z.object({
  ticketId: z.string().min(1),
  toStatus: z.enum([
    'open',
    'assigned',
    'in_progress',
    'waiting_for_customer',
    'resolved',
    'closed'
  ])
});

export const AssignTicketSchema = z.object({
  ticketId: z.string().min(1),
  employeeId: z.string().min(1)
});

export const ProductUpsertSchema = z.object({
  id: z.string().optional(),
  gameName: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(120),
  pointsQty: z.number().int().positive().max(1_000_000_000),
  description: z.string().trim().min(5).max(2000),
  imagePath: z.string().trim().max(500).optional().nullable(),
  pricePaise: z.number().int().min(100).max(100_000_000),
  status: z.enum(['available', 'sold_out', 'hidden'])
});

export const StaffFlagsUpdateSchema = z.object({
  employeeId: z.string().min(1),
  publicAlias: z.string().trim().min(2).max(40),
  customerSelectable: z.boolean(),
  acceptsTickets: z.boolean(),
  canManageProducts: z.boolean(),
  canPublishStories: z.boolean(),
  canPostCustomerAnnouncements: z.boolean()
});

export const AppSettingsUpdateSchema = z.object({
  employeeInboxScope: z.enum(['all', 'assigned_only']),
  customerCanPickEmployee: z.boolean(),
  ticketAutoCloseDays: z.number().int().min(1).max(90),
  offerSanityMaxPaise: z.number().int().min(100_00).max(500_000_000),
  businessHoursOnly: z.boolean()
});

export const StaffAnnouncementCreateSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(5).max(3000),
  priority: z.enum(['normal', 'important', 'urgent'])
});

export const CustomerAnnouncementCreateSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(5).max(3000),
  pinned: z.boolean().default(false)
});

export const StoryCreateSchema = z.object({
  kind: z.enum(['text', 'image', 'video']),
  caption: z.string().trim().min(2).max(500),
  mediaPath: z.string().trim().max(500).optional().nullable(),
  bgStyle: z.string().trim().max(120).default('from-violet-900 via-indigo-950 to-slate-950')
});

export const UploadSignRequestSchema = z.object({
  bucket: z.enum(['product-media', 'story-media', 'avatars']),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  byteSize: z.number().int().positive().max(15 * 1024 * 1024)
}).refine(
  (data) => {
    if (data.mimeType === 'video/mp4') {
      return data.bucket === 'story-media' && data.byteSize <= 15 * 1024 * 1024;
    }
    return data.byteSize <= 5 * 1024 * 1024;
  },
  { message: 'Images must be <= 5 MB and videos <= 15 MB (story-media only)' }
);

// ---- Game top-ups -------------------------------------------------------------

export const GameUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Game name is required.').max(60),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999)
});

export const PaymentMethodUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Payment method name is required.').max(40),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999)
});

export const PaymentTagUpsertSchema = z.object({
  id: z.string().optional(),
  methodId: z.string().min(1),
  tag: z.string().trim().min(1, 'Payment tag is required.').max(80),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(999)
});

export const CustomerPaymentTagSchema = z.object({
  customerId: z.string().min(1),
  methodId: z.string().min(1),
  tagId: z.string().min(1)
});

export const TopupSubmitSchema = z.object({
  gameId: z.string().min(1),
  gameUsername: z.string().trim().min(1, 'Enter your username for this game.').max(80),
  amountCents: z.number().int().min(100, 'Minimum top-up is $1.').max(500_000_000),
  methodId: z.string().min(1, 'Choose a payment method.'),
  clientRequestId: z.string().min(8).max(80)
});

export const TopupStatusSchema = z.object({
  topupId: z.string().min(1),
  status: z.enum(['loaded', 'not_received']),
  note: z.string().trim().max(500).optional()
});

export const TopupSettingsSchema = z.object({
  paymentTagMode: z.enum(['rotate', 'sticky']),
  paymentTagRotateEvery: z.number().int().min(1).max(100)
});
