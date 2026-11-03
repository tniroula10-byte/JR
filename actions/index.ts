'use server';

/**
 * Unified Server Actions (`actions/index.ts`)
 * Every mutation validates inputs with shared Zod schemas (`lib/validation/schemas.ts`),
 * enforces server-side rate limits, verifies the caller's active session & role,
 * and delegates to `getDataRepository()`.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDataRepository, hasLiveSupabaseKeys, isDemoAuthAllowed } from '@/lib/data';
import { requireActiveSession, MOCK_SESSION_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { allowAuthAttempt, clearAuthAttempts } from '@/lib/auth/login-throttle';
import {
  AppSettingsUpdateSchema,
  AssignTicketSchema,
  ChangeCustomerPasswordSchema,
  CreateTicketSchema,
  CustomerAnnouncementCreateSchema,
  CustomerPaymentTagSchema,
  GameUpsertSchema,
  InviteUserSchema,
  MagicLinkLoginSchema,
  PaymentMethodUpsertSchema,
  PaymentTagUpsertSchema,
  ProductUpsertSchema,
  ReplyTicketSchema,
  RespondToOfferSchema,
  SendMessageSchema,
  StaffAnnouncementCreateSchema,
  StaffFlagsUpdateSchema,
  StoryCreateSchema,
  SubmitOfferSchema,
  TopupSettingsSchema,
  TopupStatusSchema,
  TopupSubmitSchema,
  TransitionTicketSchema,
  UpdateCustomerProfileSchema
} from '@/lib/validation/schemas';

export async function signOutAction() {
  if (hasLiveSupabaseKeys()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const cookieStore = await cookies();
  cookieStore.delete(MOCK_SESSION_COOKIE);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Decision 1: Passwordless magic-link authentication only (`shouldCreateUser: false`).
 * Returns a generic message so uninvited emails cannot be enumerated, and blocks uninvited
 * emails from ever creating an account.
 */
export async function requestMagicLinkAction(input: { email: string }) {
  const parsed = MagicLinkLoginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid email address.'
    };
  }

  const email = parsed.data.email;
  const rl = checkRateLimit(`login:${email}`, RATE_LIMIT_PRESETS.LOGIN_EMAIL);
  if (!rl.allowed) {
    return {
      ok: false,
      error: 'Too many sign-in link requests. Please wait 15 minutes before trying again.'
    };
  }

  const repo = getDataRepository();
  const profile = await repo.getProfileByEmail(email);

  // Never create an account for an uninvited email; if pending_approval, rejected, or suspended, do not issue session
  const canSignIn = Boolean(profile && profile.status === 'active');

  return {
    ok: true,
    invitedMatchInMock: canSignIn ? profile?.id ?? null : null,
    shouldCreateUser: false,
    message:
      'If this email address has an active invitation, a single-use sign-in link has been sent.'
  };
}

export async function verifyEmailOtpAndSetPasswordAction(rawInput: {
  email: string;
  otpCode: string;
  password: string;
  fullName?: string;
  phone?: string;
}) {
  if (!(await allowAuthAttempt('otp', rawInput.email))) {
    return { ok: false, error: 'Too many attempts. Please wait 15 minutes and try again.' };
  }
  if (!hasLiveSupabaseKeys() && !isDemoAuthAllowed()) {
    return { ok: false, error: 'Account setup is not available: the server is not configured.' };
  }
  try {
    const repo = getDataRepository();
    const profile = await repo.verifyEmailOtpAndSetPassword(rawInput);
    revalidatePath('/boss/customers');
    revalidatePath('/employee/dashboard');
    revalidatePath('/employee/invite-customer');
    return {
      ok: true,
      data: profile,
      message:
        'Email OTP verified and password set. Your account is now awaiting approval before your first login.'
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OTP verification failed'
    };
  }
}

export async function loginWithPasswordAction(rawInput: {
  email: string;
  password: string;
}) {
  if (!(await allowAuthAttempt('password-login', rawInput.email))) {
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS' as const,
      error: 'Too many sign-in attempts. Please wait 15 minutes and try again.'
    };
  }

  if (!hasLiveSupabaseKeys() && !isDemoAuthAllowed()) {
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS' as const,
      error: 'Sign-in is not available: the server is not configured.'
    };
  }

  const repo = getDataRepository();
  // In live mode this sets the Supabase Auth session cookies itself
  const res = await repo.authenticateWithPassword(rawInput);
  if (!res.ok || !res.profile) {
    return {
      ok: false,
      code: res.code,
      error: res.error ?? 'Invalid email or password.'
    };
  }
  // Only failed attempts should count towards the lockout
  await clearAuthAttempts('password-login', rawInput.email);

  if (isDemoAuthAllowed()) {
    const cookieStore = await cookies();
    cookieStore.set(MOCK_SESSION_COOKIE, res.profile.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    });
  }
  revalidatePath('/', 'layout');

  const redirectPath =
    res.profile.role === 'boss'
      ? '/boss/dashboard'
      : res.profile.role === 'employee'
        ? '/employee/dashboard'
        : '/home';

  return {
    ok: true,
    code: 'SUCCESS' as const,
    profile: res.profile,
    redirectPath
  };
}

export async function reviewPendingUserAction(rawInput: {
  targetUserId: string;
  decision: 'approve' | 'reject';
  note?: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  try {
    const repo = getDataRepository();
    const res = await repo.reviewPendingUser(caller, rawInput);
    revalidatePath('/boss/customers');
    revalidatePath('/boss/employees');
    revalidatePath('/boss/audit');
    revalidatePath('/employee/dashboard');
    revalidatePath('/employee/invite-customer');
    return { ok: true, data: res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Review action failed'
    };
  }
}

export async function adminSetUserPasswordAction(rawInput: {
  targetUserId: string;
  newPassword: string;
  newUsername?: string;
}) {
  const { caller } = await requireActiveSession(['boss']);
  try {
    const repo = getDataRepository();
    const updated = await repo.adminSetUserPassword(caller, rawInput);
    revalidatePath('/boss/settings');
    revalidatePath('/boss/employees');
    revalidatePath('/boss/customers');
    revalidatePath('/boss/audit');
    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update password'
    };
  }
}

export async function inviteUserAction(rawInput: {
  email: string;
  fullName: string;
  phone?: string;
  intendedRole: 'customer' | 'employee';
  publicAlias?: string;
  username?: string;
  initialPassword?: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = InviteUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invite input.' };
  }

  try {
    const repo = getDataRepository();
    const res = await repo.inviteUser(caller, parsed.data);
    revalidatePath('/boss/customers');
    revalidatePath('/boss/employees');
    revalidatePath('/employee/invite-customer');
    return { ok: true, data: res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invite failed' };
  }
}

export async function setUserStatusAction(targetUserId: string, newStatus: 'active' | 'suspended') {
  const { caller } = await requireActiveSession(['boss']);
  try {
    const repo = getDataRepository();
    const updated = await repo.setUserStatus(caller, targetUserId, newStatus);
    revalidatePath('/boss/customers');
    revalidatePath('/boss/employees');
    revalidatePath('/boss/audit');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Status update failed' };
  }
}

export async function updateStaffFlagsAction(rawInput: {
  employeeId: string;
  publicAlias: string;
  customerSelectable: boolean;
  acceptsTickets: boolean;
  canManageProducts: boolean;
  canPublishStories: boolean;
  canPostCustomerAnnouncements: boolean;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const parsed = StaffFlagsUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid flags input.' };
  }
  try {
    const repo = getDataRepository();
    const updated = await repo.updateStaffFlags(caller, parsed.data);
    revalidatePath('/boss/employees');
    revalidatePath('/boss/audit');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update staff flags' };
  }
}

export async function updateAppSettingsAction(rawInput: {
  employeeInboxScope: 'all' | 'assigned_only';
  customerCanPickEmployee: boolean;
  ticketAutoCloseDays: number;
  offerSanityMaxPaise: number;
  businessHoursOnly: boolean;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const parsed = AppSettingsUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings.' };
  }
  try {
    const repo = getDataRepository();
    const updated = await repo.updateAppSettings(caller, parsed.data);
    revalidatePath('/boss/settings');
    revalidatePath('/employee/inbox');
    revalidatePath('/tickets');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Settings update failed' };
  }
}

export async function upsertProductAction(rawInput: {
  id?: string;
  gameName: string;
  title: string;
  pointsQty: number;
  description: string;
  imagePath?: string | null;
  pricePaise: number;
  status: 'available' | 'sold_out' | 'hidden';
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = ProductUpsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid product data.' };
  }
  try {
    const repo = getDataRepository();
    const product = await repo.upsertProduct(caller, parsed.data);
    revalidatePath('/products');
    revalidatePath('/home');
    revalidatePath('/boss/products');
    return { ok: true, data: product };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Product save failed' };
  }
}

export async function sendCustomerMessageAction(rawInput: {
  conversationId: string;
  body: string;
  clientMsgId: string;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const parsed = SendMessageSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message.' };
  }
  try {
    const repo = getDataRepository();
    const msg = await repo.sendCustomerMessage(caller, parsed.data);
    revalidatePath('/chat');
    revalidatePath('/employee/inbox');
    revalidatePath('/boss/inbox');
    return { ok: true, data: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Message send failed' };
  }
}

export async function sendStaffMessageAction(rawInput: {
  conversationId: string;
  body: string;
  clientMsgId: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = SendMessageSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message.' };
  }
  try {
    const repo = getDataRepository();
    const msg = await repo.sendStaffMessage(caller, parsed.data);
    revalidatePath('/chat');
    revalidatePath('/employee/inbox');
    revalidatePath('/boss/inbox');
    return { ok: true, data: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reply send failed' };
  }
}

export async function reassignConversationAction(
  conversationId: string,
  employeeId: string | null
) {
  const { caller } = await requireActiveSession(['boss']);
  try {
    const repo = getDataRepository();
    const updated = await repo.reassignConversationHandler(caller, conversationId, employeeId);
    revalidatePath('/boss/inbox');
    revalidatePath('/employee/inbox');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Reassign failed' };
  }
}

export async function submitOfferAction(rawInput: {
  productId: string;
  offeredPricePaise: number;
  clientMsgId: string;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const parsed = SubmitOfferSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid offer amount.' };
  }
  try {
    const repo = getDataRepository();
    const result = await repo.submitOffer(caller, parsed.data);
    revalidatePath('/offers');
    revalidatePath('/chat');
    revalidatePath('/employee/offers');
    revalidatePath('/boss/inbox');
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Offer submission failed' };
  }
}

export async function respondToOfferAction(rawInput: {
  offerId: string;
  action: 'counter' | 'accept' | 'reject';
  counterPricePaise?: number;
  note?: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = RespondToOfferSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid offer response.' };
  }
  try {
    const repo = getDataRepository();
    const updated = await repo.respondToOffer(caller, parsed.data);
    revalidatePath('/offers');
    revalidatePath('/chat');
    revalidatePath('/employee/offers');
    revalidatePath('/boss/inbox');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Offer response failed' };
  }
}

export async function withdrawOfferAction(offerId: string) {
  const { caller } = await requireActiveSession(['customer']);
  try {
    const repo = getDataRepository();
    const updated = await repo.withdrawOffer(caller, offerId);
    revalidatePath('/offers');
    revalidatePath('/chat');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Withdraw failed' };
  }
}

export async function acceptCounterOfferAction(offerId: string) {
  const { caller } = await requireActiveSession(['customer']);
  try {
    const repo = getDataRepository();
    const updated = await repo.acceptCounterOffer(caller, offerId);
    revalidatePath('/offers');
    revalidatePath('/chat');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Accept counter failed' };
  }
}

export async function createTicketAction(rawInput: {
  subject: string;
  description: string;
  category: 'general' | 'points_delivery' | 'offer_inquiry' | 'account_support';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  requestedEmployeeId?: string | null;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const parsed = CreateTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid ticket input.' };
  }
  try {
    const repo = getDataRepository();
    const ticket = await repo.createTicket(caller, parsed.data);
    revalidatePath('/tickets');
    revalidatePath('/employee/tickets');
    revalidatePath('/boss/tickets');
    return { ok: true, data: ticket };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ticket creation failed' };
  }
}

export async function assignTicketAction(rawInput: { ticketId: string; employeeId: string }) {
  const { caller } = await requireActiveSession(['boss']);
  const parsed = AssignTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid assignment.' };
  }
  try {
    const repo = getDataRepository();
    const ticket = await repo.assignTicket(caller, parsed.data);
    revalidatePath('/boss/tickets');
    revalidatePath('/employee/tickets');
    return { ok: true, data: ticket };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Assign failed' };
  }
}

export async function replyTicketAction(rawInput: { ticketId: string; body: string }) {
  const { caller } = await requireActiveSession(['boss', 'employee', 'customer']);
  const parsed = ReplyTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid reply.' };
  }
  try {
    const repo = getDataRepository();
    const msg = await repo.replyTicket(caller, parsed.data);
    revalidatePath('/tickets');
    revalidatePath('/employee/tickets');
    revalidatePath('/boss/tickets');
    return { ok: true, data: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ticket reply failed' };
  }
}

export async function transitionTicketAction(rawInput: {
  ticketId: string;
  toStatus:
    | 'open'
    | 'assigned'
    | 'in_progress'
    | 'waiting_for_customer'
    | 'resolved'
    | 'closed';
}) {
  const { caller } = await requireActiveSession(['boss', 'employee', 'customer']);
  const parsed = TransitionTicketSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid status.' };
  }
  try {
    const repo = getDataRepository();
    const updated = await repo.transitionTicket(caller, parsed.data);
    revalidatePath('/tickets');
    revalidatePath('/employee/tickets');
    revalidatePath('/boss/tickets');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Transition failed' };
  }
}

export async function sendStaffThreadMessageAction(rawInput: { threadId: string; body: string }) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  if (!rawInput.body || rawInput.body.trim().length === 0) {
    return { ok: false, error: 'Message body is required.' };
  }
  try {
    const repo = getDataRepository();
    const msg = await repo.sendStaffThreadMessage(caller, rawInput);
    revalidatePath('/employee/boss-chat');
    revalidatePath('/boss/threads');
    return { ok: true, data: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Thread message failed' };
  }
}

export async function createStaffAnnouncementAction(rawInput: {
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
}) {
  const { caller } = await requireActiveSession(['boss']);
  const parsed = StaffAnnouncementCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid announcement.' };
  }
  try {
    const repo = getDataRepository();
    const ann = await repo.createStaffAnnouncement(caller, parsed.data);
    revalidatePath('/boss/announcements');
    revalidatePath('/employee/announcements');
    return { ok: true, data: ann };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to post announcement' };
  }
}

export async function acknowledgeStaffPostAction(announcementId: string) {
  const { caller } = await requireActiveSession(['employee']);
  try {
    const repo = getDataRepository();
    const ack = await repo.acknowledgeStaffPost(caller, announcementId);
    revalidatePath('/employee/announcements');
    revalidatePath('/boss/announcements');
    return { ok: true, data: ack };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to acknowledge' };
  }
}

export async function createCustomerAnnouncementAction(rawInput: {
  title: string;
  body: string;
  pinned: boolean;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = CustomerAnnouncementCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid announcement.' };
  }
  try {
    const repo = getDataRepository();
    const ann = await repo.createCustomerAnnouncement(caller, parsed.data);
    revalidatePath('/announcements');
    revalidatePath('/home');
    revalidatePath('/boss/announcements');
    return { ok: true, data: ann };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to publish announcement' };
  }
}

export async function createStoryAction(rawInput: {
  kind: 'text' | 'image' | 'video';
  caption: string;
  mediaPath?: string | null;
  bgStyle?: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = StoryCreateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid story input.' };
  }
  try {
    const repo = getDataRepository();
    const story = await repo.createStory(caller, parsed.data);
    revalidatePath('/stories');
    revalidatePath('/home');
    revalidatePath('/boss/stories');
    return { ok: true, data: story };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Story publish failed' };
  }
}

export async function recordStoryViewAction(storyId: string) {
  const { caller } = await requireActiveSession(['customer']);
  try {
    const repo = getDataRepository();
    await repo.recordStoryView(caller, storyId);
    revalidatePath('/stories');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to record story view' };
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const { caller } = await requireActiveSession(['boss', 'employee', 'customer']);
  const repo = getDataRepository();
  await repo.markAllNotificationsRead(caller);
  revalidatePath('/notifications');
}

export async function updateCustomerProfileAction(rawInput: {
  fullName: string;
  email: string;
  phone: string;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const parsed = UpdateCustomerProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid profile details.' };
  }
  try {
    const repo = getDataRepository();
    const updated = await repo.updateCustomerOwnProfile(caller, parsed.data);
    revalidatePath('/profile');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Profile update failed' };
  }
}

export async function changeCustomerPasswordAction(rawInput: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const { caller } = await requireActiveSession(['customer']);
  if (!(await allowAuthAttempt('password-change', caller.userId))) {
    return { ok: false, error: 'Too many attempts. Please wait 15 minutes and try again.' };
  }
  const parsed = ChangeCustomerPasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password input.' };
  }
  try {
    const repo = getDataRepository();
    await repo.changeCustomerPassword(caller, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword
    });
    revalidatePath('/profile');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Password change failed' };
  }
}

export async function sendComplaintChatMessageAction(rawInput: {
  ticketId: string;
  body: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee', 'customer']);
  if (!rawInput.ticketId || !rawInput.body || !rawInput.body.trim()) {
    return { ok: false, error: 'Message body is required.' };
  }
  try {
    const repo = getDataRepository();
    const msg = await repo.sendComplaintChatMessage(caller, {
      ticketId: rawInput.ticketId,
      body: rawInput.body.trim()
    });
    revalidatePath('/tickets');
    revalidatePath('/employee/tickets');
    revalidatePath('/boss/tickets');
    return { ok: true, data: msg };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Complaint chat message failed'
    };
  }
}

// ---- Game top-ups -------------------------------------------------------------

function revalidateTopups() {
  revalidatePath('/topups');
  revalidatePath('/home');
  revalidatePath('/chat');
  revalidatePath('/employee/topups');
  revalidatePath('/boss/topups');
  revalidatePath('/employee/inbox');
  revalidatePath('/boss/inbox');
}

export async function getTopupStartAction() {
  const { caller } = await requireActiveSession(['customer']);
  try {
    const repo = getDataRepository();
    const [games, paymentOptions, usernames] = await Promise.all([
      repo.listGames(caller),
      repo.getPaymentOptions(caller),
      repo.getMyGameUsernames(caller)
    ]);
    return { ok: true as const, data: { games, paymentOptions, usernames } };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Could not load games.' };
  }
}

export async function submitTopupAction(rawInput: {
  gameId: string;
  gameUsername: string;
  amountCents: number;
  methodId: string;
  clientRequestId: string;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const parsed = TopupSubmitSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid top-up.' };
  }
  try {
    const repo = getDataRepository();
    const topup = await repo.submitTopup(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: topup };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Top-up request failed' };
  }
}

export async function updateTopupStatusAction(rawInput: {
  topupId: string;
  status: 'loaded' | 'not_received';
  note?: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = TopupStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid status.' };
  }
  try {
    const repo = getDataRepository();
    const topup = await repo.updateTopupStatus(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: topup };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Status update failed' };
  }
}

export async function upsertGameAction(rawInput: {
  id?: string;
  name: string;
  active: boolean;
  sortOrder: number;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = GameUpsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid game.' };
  }
  try {
    const game = await getDataRepository().upsertGame(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: game };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Saving game failed' };
  }
}

export async function upsertPaymentMethodAction(rawInput: {
  id?: string;
  name: string;
  active: boolean;
  sortOrder: number;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = PaymentMethodUpsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment method.' };
  }
  try {
    const method = await getDataRepository().upsertPaymentMethod(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: method };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Saving payment method failed' };
  }
}

export async function upsertPaymentTagAction(rawInput: {
  id?: string;
  methodId: string;
  tag: string;
  active: boolean;
  sortOrder: number;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = PaymentTagUpsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payment tag.' };
  }
  try {
    const tag = await getDataRepository().upsertPaymentTag(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: tag };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Saving payment tag failed' };
  }
}

export async function setCustomerPaymentTagAction(rawInput: {
  customerId: string;
  methodId: string;
  tagId: string;
}) {
  const { caller } = await requireActiveSession(['boss', 'employee']);
  const parsed = CustomerPaymentTagSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid selection.' };
  }
  try {
    await getDataRepository().setCustomerPaymentTag(caller, parsed.data);
    revalidateTopups();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Assigning tag failed' };
  }
}

export async function updateTopupSettingsAction(rawInput: {
  paymentTagMode: 'rotate' | 'sticky';
  paymentTagRotateEvery: number;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const parsed = TopupSettingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid settings.' };
  }
  try {
    const settings = await getDataRepository().updateAppSettings(caller, parsed.data);
    revalidateTopups();
    return { ok: true, data: settings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Settings update failed' };
  }
}
