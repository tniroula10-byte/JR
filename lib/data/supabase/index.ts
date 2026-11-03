/**
 * Supabase Data Repository Adapter (`lib/data/supabase/index.ts`)
 * Every method runs against PostgreSQL with the caller's own session, so RLS applies.
 * Multi-step writes go through SECURITY DEFINER RPCs (`supabase/migrations/00003_live_data_layer.sql`).
 * Customers read sanitized `c_*` RPCs that never contain staff ids (Decision 4).
 * The service-role client is used only for Auth admin calls and `srv_*` functions.
 * There is no mock fallback: errors surface instead of silently serving demo data.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { buildPerformanceCsv, calculateEmployeeMetrics } from '@/lib/analytics/metrics';
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
  StaffProfile,
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

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST rows are untyped */
type Row = Record<string, any>;

const SUPPORT_NAME = 'John Rambo Support';
const GROUP_THREAD_KEY = 'sthread-group';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'DATABASE_ERROR: Unexpected empty response.');
}

async function rpc<T = any>(
  client: ServerClient | ReturnType<typeof createSupabaseAdminClient>,
  fn: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

async function rows<T = Row>(query: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) fail(error);
  return data ?? [];
}

function byId<T extends Row>(list: T[], key = 'id'): Map<string, T> {
  return new Map(list.map((r) => [r[key] as string, r]));
}

function mapProfileRow(data: Row): Profile {
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

function mapStaffProfile(r: Row): StaffProfile {
  return {
    userId: r.user_id,
    publicAlias: r.public_alias,
    customerSelectable: r.customer_selectable,
    acceptsTickets: r.accepts_tickets,
    canManageProducts: r.can_manage_products,
    canPublishStories: r.can_publish_stories,
    canPostCustomerAnnouncements: r.can_post_customer_announcements,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapProduct(r: Row): Product {
  return {
    id: r.id,
    gameName: r.game_name,
    title: r.title,
    pointsQty: r.points_qty,
    description: r.description,
    imagePath: r.image_path,
    pricePaise: Number(r.price_paise),
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapOfferCamel(o: Row): Offer {
  return {
    ...(o as Offer),
    offeredPricePaise: Number(o.offeredPricePaise),
    listedPricePaise: Number(o.listedPricePaise),
    counterPricePaise: o.counterPricePaise === null ? null : Number(o.counterPricePaise)
  };
}

const INVALID_CREDENTIALS: PasswordAuthResult = {
  ok: false,
  code: 'INVALID_CREDENTIALS',
  error: 'Invalid email or password.'
};

/** Directory of staff/customer names, readable by staff via RLS. */
interface Directory {
  profiles: Map<string, Row>;
  aliases: Map<string, string>;
}

async function loadDirectory(supabase: ServerClient): Promise<Directory> {
  const [profiles, staff] = await Promise.all([
    rows(supabase.from('profiles').select('id, full_name, email, role')),
    rows(supabase.from('staff_profiles').select('user_id, public_alias'))
  ]);
  return {
    profiles: byId(profiles),
    aliases: new Map(staff.map((s) => [s.user_id as string, s.public_alias as string]))
  };
}

function nameOf(dir: Directory, id: string | null | undefined): string | null {
  return id ? (dir.profiles.get(id)?.full_name ?? null) : null;
}

function aliasOf(dir: Directory, id: string | null | undefined): string | null {
  return id ? (dir.aliases.get(id) ?? null) : null;
}

function mapStaffOffer(o: Row, dir: Directory, gameNames: Map<string, string>): Offer {
  return {
    id: o.id,
    productId: o.product_id,
    customerId: o.customer_id,
    customerName: nameOf(dir, o.customer_id) ?? undefined,
    conversationId: o.conversation_id,
    offeredPricePaise: Number(o.offered_price_paise),
    listedPricePaise: Number(o.listed_price_paise),
    productTitle: o.product_title,
    gameName: gameNames.get(o.product_id),
    status: o.status,
    counterPricePaise: o.counter_price_paise === null ? null : Number(o.counter_price_paise),
    staffNote: o.staff_note,
    handledBy: o.handled_by,
    handledByName: nameOf(dir, o.handled_by),
    createdAt: o.created_at,
    updatedAt: o.updated_at
  };
}

function mapStaffConversation(c: Row, dir: Directory): Conversation {
  const customer = dir.profiles.get(c.customer_id);
  return {
    id: c.id,
    customerId: c.customer_id,
    customerName: customer?.full_name ?? 'Customer',
    customerEmail: customer?.email ?? '',
    handledBy: c.handled_by,
    handledByName: nameOf(dir, c.handled_by),
    handledByAlias: aliasOf(dir, c.handled_by),
    awaitingStaff: c.awaiting_staff,
    lastMessageAt: c.last_message_at,
    lastMessagePreview: c.last_message_preview,
    customerLastReadAt: c.customer_last_read_at,
    staffLastReadAt: c.staff_last_read_at,
    customerUnreadCount: c.customer_unread_count,
    staffUnreadCount: c.staff_unread_count,
    createdAt: c.created_at
  };
}

function mapStaffTicket(t: Row, dir: Directory): Ticket {
  return {
    id: t.id,
    ticketNo: t.ticket_no,
    customerId: t.customer_id,
    customerName: nameOf(dir, t.customer_id) ?? undefined,
    subject: t.subject,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assignedEmployeeId: t.assigned_employee_id,
    assignedEmployeeName: nameOf(dir, t.assigned_employee_id),
    assignedEmployeeAlias: aliasOf(dir, t.assigned_employee_id),
    requestedEmployeeId: t.requested_employee_id,
    requestedEmployeeAlias: aliasOf(dir, t.requested_employee_id),
    reopenCount: t.reopen_count,
    createdAt: t.created_at,
    firstResponseAt: t.first_response_at,
    resolvedAt: t.resolved_at,
    closedAt: t.closed_at
  };
}

function mapCustomerMessage(
  m: Row,
  customerName: string,
  offers: Map<string, Offer>
): CustomerMessageView {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderKind: m.sender_kind,
    senderDisplayName:
      m.sender_kind === 'staff' ? SUPPORT_NAME : m.sender_kind === 'system' ? 'System' : customerName,
    customerSenderId: m.sender_kind === 'customer' ? m.customer_sender_id : null,
    type: m.type,
    body: m.body,
    offerId: m.offer_id,
    offerSnapshot: m.offer_id ? (offers.get(m.offer_id) ?? null) : null,
    clientMsgId: m.client_msg_id,
    createdAt: m.created_at
  };
}

function mapTicketMessage(m: Row, customerName: string): CustomerTicketMessageView {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    senderKind: m.sender_kind,
    senderDisplayName:
      m.sender_kind === 'staff' ? SUPPORT_NAME : m.sender_kind === 'system' ? 'System' : customerName,
    customerSenderId: m.sender_kind === 'customer' ? m.customer_sender_id : null,
    body: m.body,
    createdAt: m.created_at
  };
}

function inRange(iso: string, filter?: PerformanceQueryFilter): boolean {
  const t = new Date(iso).getTime();
  if (filter?.startDateIso && t < new Date(filter.startDateIso).getTime()) return false;
  if (filter?.endDateIso && t > new Date(filter.endDateIso).getTime()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SupabaseDataRepository implements DataRepository {
  readonly mode = 'supabase' as const;

  private async groupThreadId(supabase: ServerClient): Promise<string> {
    const { data, error } = await supabase
      .from('staff_threads')
      .select('id')
      .eq('is_group', true)
      .maybeSingle();
    if (error || !data) fail(error ?? { message: 'NOT_FOUND: Staff group thread missing.' });
    return data.id as string;
  }

  private async resolveThreadId(supabase: ServerClient, threadId: string): Promise<string> {
    return threadId === GROUP_THREAD_KEY ? this.groupThreadId(supabase) : threadId;
  }

  private async customerOffersById(supabase: ServerClient): Promise<Map<string, Offer>> {
    const list = (await rpc<Row[]>(supabase, 'c_list_offers')).map(mapOfferCamel);
    return new Map(list.map((o) => [o.id, o]));
  }

  private async staffOffersById(
    supabase: ServerClient,
    dir: Directory,
    ids: string[]
  ): Promise<Map<string, Offer>> {
    if (ids.length === 0) return new Map();
    const [offers, products] = await Promise.all([
      rows(supabase.from('offers').select('*').in('id', ids)),
      rows(supabase.from('products').select('id, game_name'))
    ]);
    const games = new Map(products.map((p) => [p.id as string, p.game_name as string]));
    return new Map(offers.map((o) => [o.id as string, mapStaffOffer(o, dir, games)]));
  }

  // ---- Auth & Profile ------------------------------------------------------

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

  async listAllProfiles(_caller: CallerContext): Promise<Profile[]> {
    const supabase = await createSupabaseServerClient();
    const list = await rows(supabase.from('profiles').select('*').order('created_at'));
    return list.map(mapProfileRow);
  }

  async listEmployeesWithFlags(_caller: CallerContext): Promise<EmployeeWithFlags[]> {
    const supabase = await createSupabaseServerClient();
    const [profiles, staff] = await Promise.all([
      rows(supabase.from('profiles').select('*').eq('role', 'employee').order('created_at')),
      rows(supabase.from('staff_profiles').select('*'))
    ]);
    const flags = byId(staff, 'user_id');
    return profiles
      .filter((p) => flags.has(p.id))
      .map((p) => ({ ...mapProfileRow(p), staffProfile: mapStaffProfile(flags.get(p.id)!) }));
  }

  async getSelectableStaffAliases(caller: CallerContext): Promise<SelectableStaffAlias[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      const list = await rpc<Row[]>(supabase, 'get_selectable_staff_aliases');
      return list.map((r) => ({ staffId: r.selection_key, publicAlias: r.public_alias }));
    }
    const employees = await this.listEmployeesWithFlags(caller);
    return employees
      .filter(
        (e) =>
          e.status === 'active' && e.staffProfile.customerSelectable && e.staffProfile.acceptsTickets
      )
      .map((e) => ({ staffId: e.id, publicAlias: e.staffProfile.publicAlias }));
  }

  async listReportableStaffAliases(_caller: CallerContext): Promise<SelectableStaffAlias[]> {
    const supabase = await createSupabaseServerClient();
    const list = await rpc<Row[]>(supabase, 'list_reportable_staff_aliases');
    return list.map((r) => ({ staffId: r.selection_key, publicAlias: r.public_alias }));
  }

  async updateCustomerOwnProfile(
    caller: CallerContext,
    input: { fullName: string; email: string; phone: string }
  ): Promise<Profile> {
    const supabase = await createSupabaseServerClient();
    const updated = await rpc<Row>(supabase, 'update_own_profile', {
      p_full_name: input.fullName,
      p_phone: input.phone
    });

    const newEmail = input.email.trim().toLowerCase();
    if (newEmail && newEmail !== String(updated.email).toLowerCase()) {
      // Supabase emails a confirmation link; profiles.email syncs once the change is confirmed
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) {
        throw new Error(`EMAIL_CHANGE_FAILED: ${error.message}`);
      }
    }
    return mapProfileRow(updated);
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
    input: { targetUserId: string; newPassword: string; newUsername?: string }
  ): Promise<Profile> {
    const cleanPassword = input.newPassword.trim();
    if (!cleanPassword) {
      throw new Error('INVALID_PASSWORD: Password cannot be empty.');
    }

    const admin = createSupabaseAdminClient();
    const { data: target } = await admin
      .from('profiles')
      .select('role')
      .eq('id', input.targetUserId)
      .maybeSingle();
    if (!target) {
      throw new Error('NOT_FOUND: Target user not found.');
    }
    // Basic password format is compulsory for Employees and Customers, NOT for BOKA (boss)
    if (target.role !== 'boss') {
      const formatCheck = validateBasicPasswordFormat(cleanPassword);
      if (!formatCheck.valid) {
        throw new Error(formatCheck.error);
      }
    }

    // srv_set_username re-checks that the caller is the active Boss before anything changes
    const updated = await rpc<Row>(admin, 'srv_set_username', {
      p_actor: caller.userId,
      p_target: input.targetUserId,
      p_username: input.newUsername ?? null
    });

    const { error } = await admin.auth.admin.updateUserById(input.targetUserId, {
      password: cleanPassword
    });
    if (error) {
      throw new Error(`PASSWORD_UPDATE_FAILED: ${error.message}`);
    }
    return mapProfileRow(updated);
  }

  // ---- Invitations & User Management ----------------------------------------

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
    const admin = createSupabaseAdminClient();
    const email = input.email.trim().toLowerCase();
    const password = input.initialPassword?.trim() || undefined;

    if (password) {
      const formatCheck = validateBasicPasswordFormat(password);
      if (!formatCheck.valid) {
        throw new Error(formatCheck.error);
      }
    }

    // Fail fast on role rules before creating an Auth user (srv_provision_invite re-checks)
    if (caller.role === 'customer') {
      throw new Error('FORBIDDEN: Customers cannot invite anyone.');
    }
    if (caller.role === 'employee' && input.intendedRole !== 'customer') {
      throw new Error('FORBIDDEN: Employees can invite customers only (never employees or a boss).');
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      ...(password ? { password } : {}),
      // Staff vouch for the address; customers still prove ownership with the emailed code
      email_confirm: true
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? '';
      throw new Error(
        /already.*registered|exists/i.test(msg)
          ? 'CONFLICT: A user with this email already exists.'
          : `INVITE_FAILED: ${msg}`
      );
    }

    let result: Row;
    try {
      result = await rpc<Row>(admin, 'srv_provision_invite', {
        p_actor: caller.userId,
        p_user_id: created.user.id,
        p_email: email,
        p_full_name: input.fullName,
        p_phone: input.phone ?? null,
        p_role: input.intendedRole,
        p_public_alias: input.publicAlias ?? null,
        p_username: input.username ?? null,
        p_has_password: Boolean(password)
      });
    } catch (err) {
      // Roll back the Auth user so a failed invite leaves nothing behind
      await admin.auth.admin.deleteUser(created.user.id);
      throw err;
    }

    if (!password) {
      // Sends the 6-digit code the customer enters on "Customer OTP Setup"
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    }

    const inv = result.invitation as Row;
    return {
      profile: mapProfileRow(result.profile as Row),
      invitation: {
        id: inv.id,
        email: inv.email,
        intendedRole: inv.intended_role,
        fullName: inv.full_name,
        phone: inv.phone,
        invitedBy: inv.invited_by,
        invitedByName: result.invitedByName as string,
        status: inv.status,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        acceptedAt: inv.accepted_at
      }
    };
  }

  async listInvitations(_caller: CallerContext): Promise<Invitation[]> {
    const supabase = await createSupabaseServerClient();
    const [invites, dir] = await Promise.all([
      rows(supabase.from('invitations').select('*').order('created_at', { ascending: false })),
      loadDirectory(supabase)
    ]);
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      intendedRole: i.intended_role,
      fullName: i.full_name,
      phone: i.phone,
      invitedBy: i.invited_by,
      invitedByName: nameOf(dir, i.invited_by) ?? undefined,
      status: i.status,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
      acceptedAt: i.accepted_at
    }));
  }

  async listPendingCustomers(_caller: CallerContext): Promise<Profile[]> {
    const supabase = await createSupabaseServerClient();
    const list = await rows(
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'customer')
        .eq('status', 'pending_approval')
        .order('created_at')
    );
    return list.map(mapProfileRow);
  }

  async reviewPendingUser(
    _caller: CallerContext,
    input: { targetUserId: string; decision: 'approve' | 'reject'; note?: string }
  ): Promise<{ profile: Profile; emailNotice: OutboundEmailNotice }> {
    const supabase = await createSupabaseServerClient();
    const res = await rpc<Row>(supabase, 'review_pending_user', {
      p_target: input.targetUserId,
      p_decision: input.decision,
      p_note: input.note ?? null
    });
    return {
      profile: mapProfileRow(res.profile),
      emailNotice: res.emailNotice as OutboundEmailNotice
    };
  }

  async listSentEmails(_caller: CallerContext): Promise<OutboundEmailNotice[]> {
    const supabase = await createSupabaseServerClient();
    const list = await rows(
      supabase.from('outbound_emails').select('*').order('sent_at', { ascending: false }).limit(200)
    );
    return list.map((e) => ({
      id: e.id,
      to: e.to_email,
      subject: e.subject,
      body: e.body,
      kind: e.kind,
      sentAt: e.sent_at
    }));
  }

  async setUserStatus(
    _caller: CallerContext,
    targetUserId: string,
    newStatus: UserStatus
  ): Promise<Profile> {
    const supabase = await createSupabaseServerClient();
    return mapProfileRow(
      await rpc<Row>(supabase, 'set_user_status', { p_target: targetUserId, p_status: newStatus })
    );
  }

  async updateStaffFlags(
    _caller: CallerContext,
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
    const supabase = await createSupabaseServerClient();
    const sp = await rpc<Row>(supabase, 'update_staff_flags', {
      p_employee_id: input.employeeId,
      p_public_alias: input.publicAlias,
      p_customer_selectable: input.customerSelectable,
      p_accepts_tickets: input.acceptsTickets,
      p_can_manage_products: input.canManageProducts,
      p_can_publish_stories: input.canPublishStories,
      p_can_post_customer_announcements: input.canPostCustomerAnnouncements
    });
    const profile = await this.getProfileById(input.employeeId);
    if (!profile) throw new Error('NOT_FOUND: Employee not found.');
    return { ...profile, staffProfile: mapStaffProfile(sp) };
  }

  // ---- App Settings -----------------------------------------------------------

  async getAppSettings(_caller: CallerContext): Promise<AppSettings> {
    const supabase = await createSupabaseServerClient();
    const settings = await rpc<AppSettings | null>(supabase, 'get_app_settings');
    if (!settings) throw new Error('FORBIDDEN_SUSPENDED: Account is not active.');
    return settings;
  }

  async updateAppSettings(
    _caller: CallerContext,
    input: Partial<Omit<AppSettings, 'updatedBy' | 'updatedAt'>>
  ): Promise<AppSettings> {
    const supabase = await createSupabaseServerClient();
    return rpc<AppSettings>(supabase, 'update_app_settings', { p_patch: input });
  }

  // ---- Products -----------------------------------------------------------------

  async listProducts(_caller: CallerContext): Promise<Product[]> {
    const supabase = await createSupabaseServerClient();
    // RLS: customers only ever receive 'available' rows
    const list = await rows(
      supabase.from('products').select('*').order('created_at', { ascending: false })
    );
    return list.map(mapProduct);
  }

  async getProductById(_caller: CallerContext, productId: string): Promise<Product | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (error || !data) return null;
    return mapProduct(data);
  }

  async upsertProduct(
    _caller: CallerContext,
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
    const supabase = await createSupabaseServerClient();
    return mapProduct(
      await rpc<Row>(supabase, 'upsert_product', {
        p_id: input.id ?? null,
        p_game_name: input.gameName,
        p_title: input.title,
        p_points_qty: input.pointsQty,
        p_description: input.description,
        p_image_path: input.imagePath ?? null,
        p_price_paise: input.pricePaise,
        p_status: input.status
      })
    );
  }

  // ---- Customer Chat & Attribution ---------------------------------------------

  async listConversations(caller: CallerContext): Promise<Conversation[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      const conv = await rpc<Conversation | null>(supabase, 'c_get_conversation');
      return conv ? [conv] : [];
    }
    const [list, dir] = await Promise.all([
      rows(
        supabase
          .from('conversations')
          .select('*')
          .order('last_message_at', { ascending: false, nullsFirst: false })
      ),
      loadDirectory(supabase)
    ]);
    return list.map((c) => mapStaffConversation(c, dir));
  }

  async getCustomerConversation(
    caller: CallerContext,
    conversationId?: string
  ): Promise<Conversation | null> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      const conv = await rpc<Conversation | null>(supabase, 'c_get_conversation');
      if (conv && conversationId && conv.id !== conversationId) {
        throw new Error('FORBIDDEN: Conversation outside caller scope.');
      }
      return conv;
    }
    if (!conversationId) return null;
    const [{ data, error }, dir] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
      loadDirectory(supabase)
    ]);
    if (error) fail(error);
    if (!data) throw new Error('FORBIDDEN: Conversation outside caller scope.');
    return mapStaffConversation(data, dir);
  }

  async listCustomerMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<CustomerMessageView[]> {
    const supabase = await createSupabaseServerClient();
    const messages = await rows(
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at')
    );

    if (caller.role === 'customer') {
      const [offers, me] = await Promise.all([
        this.customerOffersById(supabase),
        this.getProfileById(caller.userId)
      ]);
      return messages.map((m) => mapCustomerMessage(m, me?.fullName ?? 'Customer', offers));
    }

    const conv = await this.getCustomerConversation(caller, conversationId);
    const dir = await loadDirectory(supabase);
    const offers = await this.staffOffersById(
      supabase,
      dir,
      messages.map((m) => m.offer_id).filter(Boolean)
    );
    return messages.map((m) => mapCustomerMessage(m, conv?.customerName ?? 'Customer', offers));
  }

  async listStaffMessages(
    caller: CallerContext,
    conversationId: string
  ): Promise<StaffMessageView[]> {
    if (caller.role === 'customer') {
      throw new Error('FORBIDDEN: Staff authority required.');
    }
    const supabase = await createSupabaseServerClient();
    const base = await this.listCustomerMessages(caller, conversationId);
    const staffIds = base.filter((m) => m.senderKind === 'staff').map((m) => m.id);
    const [attrs, dir] = await Promise.all([
      staffIds.length
        ? rows(supabase.from('message_attribution').select('*').in('message_id', staffIds))
        : Promise.resolve([] as Row[]),
      loadDirectory(supabase)
    ]);
    const attrBy = byId(attrs, 'message_id');
    return base.map((m) => {
      const staffId = (attrBy.get(m.id)?.staff_id as string | undefined) ?? null;
      return {
        ...m,
        attributedStaffId: staffId,
        attributedStaffName: nameOf(dir, staffId),
        attributedStaffAlias: aliasOf(dir, staffId)
      };
    });
  }

  async sendCustomerMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<CustomerMessageView> {
    const supabase = await createSupabaseServerClient();
    const msg = await rpc<Row>(supabase, 'send_customer_message', {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_client_msg_id: input.clientMsgId
    });
    const me = await this.getProfileById(caller.userId);
    return mapCustomerMessage(msg, me?.fullName ?? 'Customer', new Map());
  }

  async sendStaffMessage(
    caller: CallerContext,
    input: { conversationId: string; body: string; clientMsgId: string }
  ): Promise<StaffMessageView> {
    const supabase = await createSupabaseServerClient();
    const msg = await rpc<Row>(supabase, 'send_staff_message', {
      p_conversation_id: input.conversationId,
      p_body: input.body,
      p_client_msg_id: input.clientMsgId
    });
    const dir = await loadDirectory(supabase);
    return {
      ...mapCustomerMessage(msg, '', new Map()),
      attributedStaffId: caller.userId,
      attributedStaffName: nameOf(dir, caller.userId),
      attributedStaffAlias: aliasOf(dir, caller.userId)
    };
  }

  async reassignConversationHandler(
    caller: CallerContext,
    conversationId: string,
    employeeId: string | null
  ): Promise<Conversation> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'reassign_conversation', {
      p_conversation_id: conversationId,
      p_employee_id: employeeId
    });
    return (await this.getCustomerConversation(caller, conversationId))!;
  }

  async markConversationRead(_caller: CallerContext, conversationId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'mark_conversation_read', { p_conversation_id: conversationId });
  }

  // ---- Price Offers -----------------------------------------------------------------

  async listOffers(caller: CallerContext): Promise<Offer[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return (await rpc<Row[]>(supabase, 'c_list_offers')).map(mapOfferCamel);
    }
    const [offers, products, dir] = await Promise.all([
      rows(supabase.from('offers').select('*').order('created_at', { ascending: false })),
      rows(supabase.from('products').select('id, game_name')),
      loadDirectory(supabase)
    ]);
    const games = new Map(products.map((p) => [p.id as string, p.game_name as string]));
    return offers.map((o) => mapStaffOffer(o, dir, games));
  }

  async listOfferEvents(caller: CallerContext, offerId: string): Promise<OfferEvent[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return rpc<OfferEvent[]>(supabase, 'c_list_offer_events', { p_offer_id: offerId });
    }
    const list = await rows(
      supabase.from('offer_events').select('*').eq('offer_id', offerId).order('created_at')
    );
    return list.map((e) => ({
      id: e.id,
      offerId: e.offer_id,
      actorId: e.actor_id,
      event: e.event,
      meta: e.meta ?? {},
      createdAt: e.created_at
    }));
  }

  async submitOffer(
    caller: CallerContext,
    input: { productId: string; offeredPricePaise: number; clientMsgId: string }
  ): Promise<{ offer: Offer; message: CustomerMessageView }> {
    const supabase = await createSupabaseServerClient();
    const res = await rpc<Row>(supabase, 'submit_offer', {
      p_product_id: input.productId,
      p_amount_paise: input.offeredPricePaise,
      p_client_msg_id: input.clientMsgId
    });
    const offer = mapOfferCamel(res.offer);
    const me = await this.getProfileById(caller.userId);
    return {
      offer,
      message: mapCustomerMessage(res.message, me?.fullName ?? 'Customer', new Map([[offer.id, offer]]))
    };
  }

  async respondToOffer(
    _caller: CallerContext,
    input: {
      offerId: string;
      action: 'counter' | 'accept' | 'reject';
      counterPricePaise?: number;
      note?: string;
    }
  ): Promise<Offer> {
    const supabase = await createSupabaseServerClient();
    const row = await rpc<Row>(supabase, 'respond_to_offer', {
      p_offer_id: input.offerId,
      p_action: input.action,
      p_counter_price_paise: input.counterPricePaise ?? null,
      p_note: input.note ?? null
    });
    const dir = await loadDirectory(supabase);
    const offers = await this.staffOffersById(supabase, dir, [row.id]);
    return offers.get(row.id)!;
  }

  async withdrawOffer(_caller: CallerContext, offerId: string): Promise<Offer> {
    const supabase = await createSupabaseServerClient();
    return mapOfferCamel(await rpc<Row>(supabase, 'withdraw_offer', { p_offer_id: offerId }));
  }

  async acceptCounterOffer(_caller: CallerContext, offerId: string): Promise<Offer> {
    const supabase = await createSupabaseServerClient();
    return mapOfferCamel(await rpc<Row>(supabase, 'accept_counter_offer', { p_offer_id: offerId }));
  }

  // ---- Support Tickets ----------------------------------------------------------------

  async listTickets(caller: CallerContext): Promise<Ticket[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return rpc<Ticket[]>(supabase, 'c_list_tickets');
    }
    const [list, dir] = await Promise.all([
      rows(supabase.from('tickets').select('*').order('created_at', { ascending: false })),
      loadDirectory(supabase)
    ]);
    return list.map((t) => mapStaffTicket(t, dir));
  }

  async getTicketById(caller: CallerContext, ticketId: string): Promise<Ticket | null> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      const mine = await rpc<Ticket[]>(supabase, 'c_list_tickets');
      return mine.find((t) => t.id === ticketId) ?? null;
    }
    const [{ data, error }, dir] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle(),
      loadDirectory(supabase)
    ]);
    if (error) fail(error);
    return data ? mapStaffTicket(data, dir) : null;
  }

  async listCustomerTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<CustomerTicketMessageView[]> {
    const supabase = await createSupabaseServerClient();
    const ticket = await this.getTicketById(caller, ticketId);
    if (!ticket) throw new Error('NOT_FOUND: Ticket not found.');
    const list = await rows(
      supabase.from('ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at')
    );
    return list.map((m) => mapTicketMessage(m, ticket.customerName ?? 'Customer'));
  }

  async listStaffTicketMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<StaffTicketMessageView[]> {
    if (caller.role === 'customer') {
      throw new Error('FORBIDDEN: Staff authority required.');
    }
    const supabase = await createSupabaseServerClient();
    const base = await this.listCustomerTicketMessages(caller, ticketId);
    const staffIds = base.filter((m) => m.senderKind === 'staff').map((m) => m.id);
    const [attrs, dir] = await Promise.all([
      staffIds.length
        ? rows(
            supabase
              .from('ticket_message_attribution')
              .select('*')
              .in('ticket_message_id', staffIds)
          )
        : Promise.resolve([] as Row[]),
      loadDirectory(supabase)
    ]);
    const attrBy = byId(attrs, 'ticket_message_id');
    return base.map((m) => {
      const staffId = (attrBy.get(m.id)?.staff_id as string | undefined) ?? null;
      return {
        ...m,
        attributedStaffId: staffId,
        attributedStaffName: nameOf(dir, staffId),
        attributedStaffAlias: aliasOf(dir, staffId)
      };
    });
  }

  async listTicketEvents(caller: CallerContext, ticketId: string): Promise<TicketEvent[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return rpc<TicketEvent[]>(supabase, 'c_list_ticket_events', { p_ticket_id: ticketId });
    }
    const [list, dir] = await Promise.all([
      rows(supabase.from('ticket_events').select('*').eq('ticket_id', ticketId).order('created_at')),
      loadDirectory(supabase)
    ]);
    return list.map((e) => ({
      id: e.id,
      ticketId: e.ticket_id,
      actorId: e.actor_id,
      actorDisplayName: nameOf(dir, e.actor_id) ?? SUPPORT_NAME,
      event: e.event,
      fromValue: e.from_value,
      toValue: e.to_value,
      createdAt: e.created_at
    }));
  }

  async createTicket(
    _caller: CallerContext,
    input: {
      subject: string;
      description: string;
      category: string;
      priority: TicketPriority;
      requestedEmployeeId?: string | null;
    }
  ): Promise<Ticket> {
    const supabase = await createSupabaseServerClient();
    return rpc<Ticket>(supabase, 'create_ticket', {
      p_subject: input.subject,
      p_description: input.description,
      p_category: input.category,
      p_priority: input.priority,
      // Customers select by public alias; staff ids never reach the browser
      p_requested_employee_alias: input.requestedEmployeeId ?? null
    });
  }

  async assignTicket(
    caller: CallerContext,
    input: { ticketId: string; employeeId: string }
  ): Promise<Ticket> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'assign_ticket', {
      p_ticket_id: input.ticketId,
      p_employee_id: input.employeeId
    });
    return (await this.getTicketById(caller, input.ticketId))!;
  }

  async replyTicket(
    caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<CustomerTicketMessageView | StaffTicketMessageView> {
    const supabase = await createSupabaseServerClient();
    const msg = await rpc<Row>(supabase, 'reply_ticket', {
      p_ticket_id: input.ticketId,
      p_body: input.body
    });
    const me = await this.getProfileById(caller.userId);
    const view = mapTicketMessage(msg, me?.fullName ?? 'Customer');
    if (caller.role === 'customer') return view;
    return {
      ...view,
      attributedStaffId: caller.userId,
      attributedStaffName: me?.fullName ?? null,
      attributedStaffAlias: (await loadDirectory(supabase)).aliases.get(caller.userId) ?? null
    };
  }

  async transitionTicket(
    caller: CallerContext,
    input: { ticketId: string; toStatus: TicketStatus }
  ): Promise<Ticket> {
    const supabase = await createSupabaseServerClient();
    const res = await rpc<Row>(supabase, 'transition_ticket', {
      p_ticket_id: input.ticketId,
      p_to_status: input.toStatus
    });
    if (caller.role === 'customer') return res as Ticket;
    return (await this.getTicketById(caller, input.ticketId))!;
  }

  async autoCloseResolvedTickets(_nowIso?: string): Promise<number> {
    const admin = createSupabaseAdminClient();
    return rpc<number>(admin, 'srv_auto_close_resolved_tickets');
  }

  async getComplaintChatRoomByTicket(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatRoom | null> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return rpc<ComplaintChatRoom | null>(supabase, 'c_get_complaint_room', {
        p_ticket_id: ticketId
      });
    }
    const [{ data, error }, dir] = await Promise.all([
      supabase.from('complaint_chat_rooms').select('*').eq('ticket_id', ticketId).maybeSingle(),
      loadDirectory(supabase)
    ]);
    if (error) fail(error);
    if (!data) return null;
    const { data: tkt } = await supabase
      .from('tickets')
      .select('ticket_no')
      .eq('id', ticketId)
      .maybeSingle();
    return {
      id: data.id,
      ticketId: data.ticket_id,
      ticketNo: tkt?.ticket_no ?? 0,
      customerId: data.customer_id,
      customerName: nameOf(dir, data.customer_id) ?? 'Customer',
      employeeId: data.employee_id,
      employeeName: nameOf(dir, data.employee_id) ?? '',
      employeeAlias: aliasOf(dir, data.employee_id) ?? '',
      bossId: data.boss_id,
      bossName: nameOf(dir, data.boss_id) ?? 'Boss',
      memberIds: [data.boss_id, data.employee_id, data.customer_id],
      createdAt: data.created_at
    };
  }

  async listComplaintChatMessages(
    caller: CallerContext,
    ticketId: string
  ): Promise<ComplaintChatMessage[]> {
    const supabase = await createSupabaseServerClient();
    if (caller.role === 'customer') {
      return rpc<ComplaintChatMessage[]>(supabase, 'c_list_complaint_messages', {
        p_ticket_id: ticketId
      });
    }
    const room = await this.getComplaintChatRoomByTicket(caller, ticketId);
    if (!room) {
      // RLS hides rooms from non-members: tell members-only rooms apart from "no room"
      const { count } = await createSupabaseAdminClient()
        .from('complaint_chat_rooms')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticketId);
      if (count) {
        throw new Error(
          'FORBIDDEN: Only the 3 complaint chat room members (Boss, reported Employee, and Customer) can access this private room.'
        );
      }
      return [];
    }
    const [list, dir] = await Promise.all([
      rows(
        supabase.from('complaint_chat_messages').select('*').eq('room_id', room.id).order('created_at')
      ),
      loadDirectory(supabase)
    ]);
    return list.map((m) => {
      const role = dir.profiles.get(m.sender_id)?.role;
      return {
        id: m.id,
        roomId: m.room_id,
        ticketId: m.ticket_id,
        senderId: m.sender_id,
        senderRole: role,
        senderDisplayName:
          m.sender_id === room.bossId
            ? `${room.bossName} (Main Admin / Boss)`
            : m.sender_id === room.employeeId
              ? `${room.employeeAlias} (Employee)`
              : `${room.customerName} (Customer)`,
        body: m.body,
        createdAt: m.created_at
      };
    });
  }

  async sendComplaintChatMessage(
    _caller: CallerContext,
    input: { ticketId: string; body: string }
  ): Promise<ComplaintChatMessage> {
    const supabase = await createSupabaseServerClient();
    return rpc<ComplaintChatMessage>(supabase, 'send_complaint_message', {
      p_ticket_id: input.ticketId,
      p_body: input.body
    });
  }

  // ---- Boss-Employee Threads & Staff Channel -----------------------------------------

  async listStaffThreads(_caller: CallerContext): Promise<StaffThread[]> {
    const supabase = await createSupabaseServerClient();
    const [threads, dir] = await Promise.all([
      rows(
        supabase
          .from('staff_threads')
          .select('*')
          .eq('is_group', false)
          .order('last_message_at', { ascending: false, nullsFirst: false })
      ),
      loadDirectory(supabase)
    ]);
    return threads.map((t) => ({
      id: t.id,
      employeeId: t.employee_id,
      employeeName: nameOf(dir, t.employee_id) ?? '',
      employeeAlias: aliasOf(dir, t.employee_id) ?? t.title ?? '',
      lastMessageAt: t.last_message_at,
      lastMessagePreview: t.last_message_preview,
      createdAt: t.created_at
    }));
  }

  private mapThreadMessage(m: Row, dir: Directory, threadKey: string): StaffThreadMessage {
    const sender = dir.profiles.get(m.sender_id);
    const alias = aliasOf(dir, m.sender_id);
    const isBoss = sender?.role === 'boss';
    return {
      id: m.id,
      threadId: threadKey,
      senderId: m.sender_id,
      senderName:
        threadKey === GROUP_THREAD_KEY && !isBoss && alias
          ? `${sender?.full_name ?? ''} (${alias})`
          : (sender?.full_name ?? ''),
      senderRole: isBoss ? 'boss' : 'employee',
      body: m.body,
      createdAt: m.created_at
    };
  }

  async listStaffThreadMessages(
    _caller: CallerContext,
    threadId: string
  ): Promise<StaffThreadMessage[]> {
    const supabase = await createSupabaseServerClient();
    const realId = await this.resolveThreadId(supabase, threadId);
    const [list, dir] = await Promise.all([
      rows(
        supabase.from('staff_thread_messages').select('*').eq('thread_id', realId).order('created_at')
      ),
      loadDirectory(supabase)
    ]);
    return list.map((m) => this.mapThreadMessage(m, dir, threadId));
  }

  async sendStaffThreadMessage(
    _caller: CallerContext,
    input: { threadId: string; body: string }
  ): Promise<StaffThreadMessage> {
    const supabase = await createSupabaseServerClient();
    const realId = await this.resolveThreadId(supabase, input.threadId);
    const msg = await rpc<Row>(supabase, 'send_staff_thread_message', {
      p_thread_id: realId,
      p_body: input.body
    });
    return this.mapThreadMessage(msg, await loadDirectory(supabase), input.threadId);
  }

  async listStaffAnnouncements(_caller: CallerContext): Promise<StaffAnnouncement[]> {
    const supabase = await createSupabaseServerClient();
    const [anns, acks, dir] = await Promise.all([
      rows(supabase.from('staff_announcements').select('*').order('created_at', { ascending: false })),
      rows(supabase.from('staff_announcement_acks').select('*').order('acknowledged_at')),
      loadDirectory(supabase)
    ]);
    return anns.map((a) => ({
      id: a.id,
      authorId: a.author_id,
      authorName: nameOf(dir, a.author_id) ?? '',
      title: a.title,
      body: a.body,
      priority: a.priority,
      createdAt: a.created_at,
      acks: acks
        .filter((k) => k.announcement_id === a.id)
        .map((k) => ({
          announcementId: k.announcement_id,
          employeeId: k.employee_id,
          employeeName: nameOf(dir, k.employee_id) ?? '',
          acknowledgedAt: k.acknowledged_at
        }))
    }));
  }

  async createStaffAnnouncement(
    caller: CallerContext,
    input: { title: string; body: string; priority: AnnouncementPriority }
  ): Promise<StaffAnnouncement> {
    const supabase = await createSupabaseServerClient();
    const a = await rpc<Row>(supabase, 'create_staff_announcement', {
      p_title: input.title,
      p_body: input.body,
      p_priority: input.priority
    });
    const me = await this.getProfileById(caller.userId);
    return {
      id: a.id,
      authorId: a.author_id,
      authorName: me?.fullName ?? '',
      title: a.title,
      body: a.body,
      priority: a.priority,
      createdAt: a.created_at,
      acks: []
    };
  }

  async acknowledgeStaffPost(
    caller: CallerContext,
    announcementId: string
  ): Promise<StaffAnnouncementAck> {
    const supabase = await createSupabaseServerClient();
    const ack = await rpc<Row>(supabase, 'acknowledge_staff_post', {
      p_announcement_id: announcementId
    });
    const me = await this.getProfileById(caller.userId);
    return {
      announcementId: ack.announcement_id,
      employeeId: ack.employee_id,
      employeeName: me?.fullName ?? '',
      acknowledgedAt: ack.acknowledged_at
    };
  }

  // ---- Customer Announcements & Stories ----------------------------------------------

  async listCustomerAnnouncements(_caller: CallerContext): Promise<CustomerAnnouncement[]> {
    const supabase = await createSupabaseServerClient();
    return rpc<CustomerAnnouncement[]>(supabase, 'list_customer_announcements');
  }

  async createCustomerAnnouncement(
    _caller: CallerContext,
    input: { title: string; body: string; pinned: boolean }
  ): Promise<CustomerAnnouncement> {
    const supabase = await createSupabaseServerClient();
    return rpc<CustomerAnnouncement>(supabase, 'create_customer_announcement', {
      p_title: input.title,
      p_body: input.body,
      p_pinned: input.pinned
    });
  }

  async listStories(_caller: CallerContext, includeExpiredForStaff = false): Promise<Story[]> {
    const supabase = await createSupabaseServerClient();
    return rpc<Story[]>(supabase, 'list_stories', { p_include_expired: includeExpiredForStaff });
  }

  async createStory(
    _caller: CallerContext,
    input: {
      kind: StoryKind;
      caption: string;
      mediaPath?: string | null;
      bgStyle?: string;
      expiresAt?: string;
    }
  ): Promise<Story> {
    const supabase = await createSupabaseServerClient();
    return rpc<Story>(supabase, 'create_story', {
      p_kind: input.kind,
      p_caption: input.caption,
      p_media_path: input.mediaPath ?? null,
      p_bg_style: input.bgStyle ?? null
    });
  }

  async recordStoryView(_caller: CallerContext, storyId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'record_story_view', { p_story_id: storyId });
  }

  async purgeExpiredStories(_nowIso?: string): Promise<number> {
    // Expired stories are hidden by list_stories(); rows are kept (no hard deletes).
    // Removing expired media files from Storage is handled with the upload work (step 6).
    return 0;
  }

  // ---- Notifications & Push -------------------------------------------------------------

  async listNotifications(_caller: CallerContext): Promise<AppNotification[]> {
    const supabase = await createSupabaseServerClient();
    const list = await rows(
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
    );
    return list.map((n) => ({
      id: n.id,
      recipientId: n.recipient_id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      payload: n.payload ?? {},
      readAt: n.read_at,
      createdAt: n.created_at
    }));
  }

  async markNotificationRead(_caller: CallerContext, notificationId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'mark_notifications_read', { p_notification_id: notificationId });
  }

  async markAllNotificationsRead(_caller: CallerContext): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'mark_notifications_read', { p_notification_id: null });
  }

  async savePushSubscription(
    caller: CallerContext,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
  ): Promise<PushSubscriptionRecord> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: caller.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent ?? null
        },
        { onConflict: 'endpoint' }
      )
      .select('*')
      .single();
    if (error || !data) fail(error);
    return {
      id: data.id,
      userId: data.user_id,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.user_agent,
      createdAt: data.created_at
    };
  }

  // ---- Performance Analytics & Audit Log ------------------------------------------------

  async getEmployeePerformance(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<EmployeePerformanceMetrics[]> {
    if (caller.role === 'customer') {
      throw new Error('FORBIDDEN: Staff authority required.');
    }
    const supabase = await createSupabaseServerClient();
    const [employees, activityEvents, ticketEventRows, ticketRows, dir] = await Promise.all([
      this.listEmployeesWithFlags(caller),
      this.listActivityEvents(caller),
      rows(supabase.from('ticket_events').select('*')),
      rows(supabase.from('tickets').select('*')),
      loadDirectory(supabase)
    ]);
    const ticketEvents: TicketEvent[] = ticketEventRows.map((e) => ({
      id: e.id,
      ticketId: e.ticket_id,
      actorId: e.actor_id,
      actorDisplayName: nameOf(dir, e.actor_id) ?? '',
      event: e.event,
      fromValue: e.from_value,
      toValue: e.to_value,
      createdAt: e.created_at
    }));

    // Permission Matrix: Employees see only their own numbers; Boss sees all employees & filters
    const effectiveFilter: PerformanceQueryFilter =
      caller.role === 'employee' ? { ...filter, employeeId: caller.userId } : { ...filter };

    return calculateEmployeeMetrics({
      employees,
      activityEvents,
      ticketEvents,
      tickets: ticketRows.map((t) => mapStaffTicket(t, dir)),
      filter: effectiveFilter
    });
  }

  async listActivityEvents(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<ActivityEvent[]> {
    if (caller.role === 'customer') {
      throw new Error('FORBIDDEN: Staff authority required.');
    }
    const supabase = await createSupabaseServerClient();
    // RLS: Boss sees all events, employees only their own
    let query = supabase.from('activity_events').select('*').order('occurred_at', { ascending: false });
    if (filter?.employeeId) query = query.eq('actor_id', filter.employeeId);
    const [list, dir] = await Promise.all([rows(query), loadDirectory(supabase)]);
    return list
      .filter((e) => inRange(e.occurred_at, filter))
      .map((e) => ({
        id: e.id,
        occurredAt: e.occurred_at,
        actorId: e.actor_id,
        actorName: nameOf(dir, e.actor_id) ?? undefined,
        actorRole: e.actor_role,
        eventType: e.event_type,
        customerId: e.customer_id,
        conversationId: e.conversation_id,
        ticketId: e.ticket_id,
        offerId: e.offer_id,
        messageId: e.message_id,
        meta: e.meta ?? {}
      }));
  }

  async exportPerformanceCsv(
    caller: CallerContext,
    filter?: PerformanceQueryFilter
  ): Promise<string> {
    if (caller.role !== 'boss') {
      throw new Error('FORBIDDEN: Boss authority required.');
    }
    const rowsOut = await this.getEmployeePerformance(caller, filter);
    const supabase = await createSupabaseServerClient();
    await rpc(supabase, 'log_performance_export', {
      p_filter: filter ?? {},
      p_row_count: rowsOut.length
    });
    return buildPerformanceCsv(rowsOut);
  }

  async listAuditLogs(_caller: CallerContext): Promise<AuditLogEntry[]> {
    const supabase = await createSupabaseServerClient();
    const [list, dir] = await Promise.all([
      rows(supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)),
      loadDirectory(supabase)
    ]);
    return list.map((a) => ({
      id: a.id,
      actorId: a.actor_id,
      actorName: nameOf(dir, a.actor_id) ?? undefined,
      action: a.action,
      entity: a.entity,
      entityId: a.entity_id,
      beforeMeta: a.before_meta,
      afterMeta: a.after_meta,
      ip: a.ip,
      createdAt: a.created_at
    }));
  }
}
