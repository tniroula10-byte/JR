/**
 * Live Database Integration Suite (`tests/integration/live-db.test.ts`)
 * Runs against a local Supabase stack (`npx supabase start` + `npx supabase db reset`).
 * Every actor signs in for real, so RLS policies and RPC role checks are exercised exactly
 * as in production. Run with: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const PASSWORD = 'Integration#Pass2026';
const RUN = Date.now().toString(36);

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over untyped rows
async function ok(p: PromiseLike<{ data: any; error: { message: string } | null }>): Promise<any> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function denied(p: PromiseLike<{ error: { message: string } | null }>, pattern: RegExp) {
  const { error } = await p;
  expect(error?.message ?? 'no error').toMatch(pattern);
}

/** Creates an Auth user and provisions it exactly like inviteUser() does. */
async function provision(
  actorId: string,
  role: 'employee' | 'customer',
  name: string,
  withPassword = true,
  alias?: string
): Promise<{ id: string; email: string }> {
  const email = `${name.toLowerCase()}-${RUN}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    ...(withPassword ? { password: PASSWORD } : {}),
    email_confirm: true
  });
  if (error || !data.user) throw new Error(error?.message);
  await ok(
    admin.rpc('srv_provision_invite', {
      p_actor: actorId,
      p_user_id: data.user.id,
      p_email: email,
      p_full_name: name,
      p_phone: null,
      p_role: role,
      p_public_alias: alias ?? null,
      p_username: null,
      p_has_password: withPassword
    })
  );
  return { id: data.user.id, email };
}

async function latestOtp(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await res.json()) as { messages: Array<{ ID: string }> };
    if (list.messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0]!.ID}`)).json()) as {
        Text: string;
      };
      const code = msg.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email arrived for ${email}`);
}

const live = Boolean(SERVICE && ANON);

describe.skipIf(!live)('live database: roles, RPCs and RLS', () => {
  let boss: SupabaseClient;
  let bossId: string;
  let e1: SupabaseClient, e2: SupabaseClient, c1: SupabaseClient, c2: SupabaseClient;
  let e1Id: string, e2Id: string, c1Id: string, c2Id: string;
  let productId: string;

  beforeAll(async () => {
    const { data: bossRow } = await admin.from('profiles').select('id, email').eq('role', 'boss').single();
    bossId = bossRow!.id;
    boss = await signIn(bossRow!.email, process.env.BOSS_PASSWORD ?? 'LocalBossPass#2026');
  }, 30_000);

  it('invites: role rules, approval queue, and the emailed 6-digit code flow', async () => {
    const emp1 = await provision(bossId, 'employee', 'Emp1', true, `E1-${RUN}`);
    const emp2 = await provision(bossId, 'employee', 'Emp2', true, `E2-${RUN}`);
    e1Id = emp1.id;
    e2Id = emp2.id;

    // Invited accounts cannot sign in usefully until approved
    const pending = await signIn(emp1.email);
    expect(await ok(pending.from('profiles').select('id'))).toEqual([]);

    await ok(boss.rpc('review_pending_user', { p_target: e1Id, p_decision: 'approve' }));
    await ok(boss.rpc('review_pending_user', { p_target: e2Id, p_decision: 'approve' }));
    e1 = await signIn(emp1.email);
    e2 = await signIn(emp2.email);

    // Employees can invite customers only
    await denied(
      admin.rpc('srv_provision_invite', {
        p_actor: e1Id, p_user_id: crypto.randomUUID(), p_email: `x-${RUN}@test.local`,
        p_full_name: 'Nope', p_phone: null, p_role: 'employee', p_public_alias: null,
        p_username: null, p_has_password: true
      }),
      /Employees can invite customers only/
    );

    const cust1 = await provision(e1Id, 'customer', 'Cust1', true);
    c1Id = cust1.id;
    // Employees cannot approve employees, but can approve customers
    await denied(e1.rpc('review_pending_user', { p_target: e2Id, p_decision: 'approve' }), /BOKA-only/);
    await ok(e1.rpc('review_pending_user', { p_target: c1Id, p_decision: 'approve' }));
    c1 = await signIn(cust1.email);

    // Customer without a password: emailed code -> set password -> pending -> approved
    const cust2 = await provision(bossId, 'customer', 'Cust2', false);
    c2Id = cust2.id;
    await ok(anonClient().auth.signInWithOtp({ email: cust2.email, options: { shouldCreateUser: false } }));
    const code = await latestOtp(cust2.email);
    const otpClient = anonClient();
    await ok(otpClient.auth.verifyOtp({ email: cust2.email, token: code, type: 'email' }));
    await ok(otpClient.auth.updateUser({ password: PASSWORD }));
    await ok(admin.from('profiles').update({ status: 'pending_approval' }).eq('id', c2Id));
    await ok(boss.rpc('review_pending_user', { p_target: c2Id, p_decision: 'approve' }));
    c2 = await signIn(cust2.email);

    // Uninvited emails get no account and no code
    const { error } = await anonClient().auth.signInWithOtp({
      email: `stranger-${RUN}@test.local`,
      options: { shouldCreateUser: false }
    });
    expect(error).not.toBeNull();
  }, 60_000);

  it('server-only and internal functions are not callable from a session', async () => {
    await denied(c1.rpc('srv_auto_close_resolved_tickets'), /permission denied/);
    await denied(boss.rpc('srv_set_username', { p_actor: bossId, p_target: c1Id, p_username: 'x' }), /permission denied/);
    await denied(c1.rpc('write_audit', { p_actor: c1Id, p_action: 'x', p_entity: 'x', p_entity_id: 'x' }), /permission denied/);
    await denied(anonClient().rpc('get_app_settings'), /permission denied/);
  });

  it('login throttle: 5 attempts per window, shared in the database, server-only', async () => {
    const key = `test-key-${RUN}`;
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(await ok(admin.rpc('srv_throttle_hit', { p_key_hash: key, p_window_seconds: 900, p_max: 5 })));
    }
    expect(results).toEqual([true, true, true, true, true, false]);
    await ok(admin.rpc('srv_throttle_clear', { p_key_hash: key }));
    expect(await ok(admin.rpc('srv_throttle_hit', { p_key_hash: key, p_window_seconds: 900, p_max: 5 }))).toBe(true);

    await denied(c1.rpc('srv_throttle_clear', { p_key_hash: key }), /permission denied/);
    await denied(anonClient().rpc('srv_throttle_hit', { p_key_hash: key, p_window_seconds: 1, p_max: 99 }), /permission denied/);
    expect(await ok(c1.from('auth_attempts').select('id'))).toEqual([]);
  });

  it('products: permission flag required, hidden products invisible to customers', async () => {
    const prod = await ok(
      boss.rpc('upsert_product', {
        p_id: null, p_game_name: 'Valorant', p_title: `VP Pack ${RUN}`, p_points_qty: 1000,
        p_description: 'Valorant points', p_image_path: null, p_price_paise: 2500, p_status: 'available'
      })
    );
    productId = (prod as { id: string }).id;
    await denied(
      e1.rpc('upsert_product', {
        p_id: null, p_game_name: 'X', p_title: 'X', p_points_qty: 1, p_description: 'X',
        p_image_path: null, p_price_paise: 500, p_status: 'available'
      }),
      /can_manage_products/
    );
    const hidden = (await ok(
      boss.rpc('upsert_product', {
        p_id: null, p_game_name: 'Secret', p_title: `Hidden ${RUN}`, p_points_qty: 1,
        p_description: 'Hidden item', p_image_path: null, p_price_paise: 500, p_status: 'hidden'
      })
    )) as { id: string };
    const visible = await ok(c1.from('products').select('id'));
    expect(visible.map((p: { id: string }) => p.id)).toContain(productId);
    expect(visible.map((p: { id: string }) => p.id)).not.toContain(hidden.id);
    // No update policy exists for customers: the write silently matches zero rows
    await c1.from('products').update({ price_paise: 1 }).eq('id', productId);
    expect((await ok(c1.from('products').select('price_paise').eq('id', productId)))[0]).toEqual({ price_paise: 2500 });
  });

  it('chat: staff anonymity, conversation isolation, no direct writes', async () => {
    const conv = (await ok(c1.rpc('c_get_conversation'))) as { id: string; handledBy: unknown };
    await ok(c1.rpc('send_customer_message', { p_conversation_id: conv.id, p_body: 'Hello', p_client_msg_id: `m1-${RUN}` }));
    // Retrying with the same client id is idempotent
    await ok(c1.rpc('send_customer_message', { p_conversation_id: conv.id, p_body: 'Hello', p_client_msg_id: `m1-${RUN}` }));
    await ok(e1.rpc('send_staff_message', { p_conversation_id: conv.id, p_body: 'Hi there', p_client_msg_id: `s1-${RUN}` }));

    const msgs = await ok(c1.from('messages').select('*').eq('conversation_id', conv.id));
    expect(msgs.filter((m: { body: string }) => m.body === 'Hello')).toHaveLength(1);
    expect(JSON.stringify(msgs)).not.toContain(e1Id);
    expect(await ok(c1.from('message_attribution').select('*'))).toEqual([]);
    expect(await ok(c1.from('conversations').select('*'))).toEqual([]);
    const after = (await ok(c1.rpc('c_get_conversation'))) as Record<string, unknown>;
    expect(after.handledBy).toBeNull();
    expect(JSON.stringify(after)).not.toContain(e1Id);

    // Staff see the attribution and the claimed handler
    const staffConv = await ok(e1.from('conversations').select('handled_by').eq('id', conv.id).single());
    expect(staffConv).toEqual({ handled_by: e1Id });

    // Another customer cannot read or post into this conversation
    expect(await ok(c2.from('messages').select('id').eq('conversation_id', conv.id))).toEqual([]);
    await denied(
      c2.rpc('send_customer_message', { p_conversation_id: conv.id, p_body: 'intrude', p_client_msg_id: `x-${RUN}` }),
      /own conversation/
    );
    // Direct inserts are no longer allowed for anyone
    await denied(
      c1.from('messages').insert({
        conversation_id: conv.id, sender_kind: 'customer', customer_sender_id: c1Id,
        body: 'direct', client_msg_id: `d-${RUN}`
      }),
      /row-level security/
    );
  });

  it('offers: customers cannot self-accept, staff ids hidden, counter flow works', async () => {
    const res = (await ok(
      c1.rpc('submit_offer', { p_product_id: productId, p_amount_paise: 2000, p_client_msg_id: `o1-${RUN}` })
    )) as { offer: { id: string } };
    const offerId = res.offer.id;
    await denied(
      c1.rpc('submit_offer', { p_product_id: productId, p_amount_paise: 2100, p_client_msg_id: `o2-${RUN}` }),
      /DUPLICATE_OFFER/
    );
    await denied(
      c1.rpc('submit_offer', { p_product_id: productId, p_amount_paise: 999999, p_client_msg_id: `o3-${RUN}` }),
      /INVALID_AMOUNT/
    );

    // The old hole: a customer flipping their own offer to accepted
    await ok(c1.from('offers').update({ status: 'accepted', offered_price_paise: 100 }).eq('id', offerId));
    const stillPending = (await ok(admin.from('offers').select('status, offered_price_paise').eq('id', offerId).single())) as Record<string, unknown>;
    expect(stillPending).toEqual({ status: 'pending', offered_price_paise: 2000 });

    await ok(e1.rpc('respond_to_offer', { p_offer_id: offerId, p_action: 'counter', p_counter_price_paise: 2300, p_note: 'Best we can do' }));
    const mine = (await ok(c1.rpc('c_list_offers'))) as Array<Record<string, unknown>>;
    const offer = mine.find((o) => o.id === offerId)!;
    expect(offer.status).toBe('countered');
    expect(offer.handledBy).toBeNull();
    expect(JSON.stringify(mine)).not.toContain(e1Id);
    const events = await ok(c1.rpc('c_list_offer_events', { p_offer_id: offerId }));
    expect(JSON.stringify(events)).not.toContain(e1Id);

    const accepted = (await ok(c1.rpc('accept_counter_offer', { p_offer_id: offerId }))) as Record<string, unknown>;
    expect(accepted.status).toBe('accepted');
    await denied(c2.rpc('withdraw_offer', { p_offer_id: offerId }), /own offer/);
  });

  it('tickets: assignment, status machine, anonymized events, complaint room privacy', async () => {
    const t = (await ok(
      c1.rpc('create_ticket', {
        p_subject: 'Points missing', p_description: 'My points never arrived', p_category: 'points_delivery',
        p_priority: 'high', p_requested_employee_alias: null
      })
    )) as { id: string; status: string };
    expect(t.status).toBe('open');
    await denied(e1.rpc('assign_ticket', { p_ticket_id: t.id, p_employee_id: e1Id }), /Only the Boss/);
    await ok(boss.rpc('assign_ticket', { p_ticket_id: t.id, p_employee_id: e1Id }));
    await denied(e2.rpc('reply_ticket', { p_ticket_id: t.id, p_body: 'Not mine' }), /assigned employee/);
    await ok(e1.rpc('reply_ticket', { p_ticket_id: t.id, p_body: 'Looking into it' }));
    await ok(e1.rpc('transition_ticket', { p_ticket_id: t.id, p_to_status: 'resolved' }));
    await denied(c1.rpc('transition_ticket', { p_ticket_id: t.id, p_to_status: 'assigned' }), /not permitted/);
    await ok(c1.rpc('transition_ticket', { p_ticket_id: t.id, p_to_status: 'closed' }));
    await denied(boss.rpc('transition_ticket', { p_ticket_id: t.id, p_to_status: 'in_progress' }), /Closed is final/);

    expect(await ok(c1.from('tickets').select('*'))).toEqual([]);
    const tickets = await ok(c1.rpc('c_list_tickets'));
    const evs = await ok(c1.rpc('c_list_ticket_events', { p_ticket_id: t.id }));
    expect(JSON.stringify([tickets, evs])).not.toContain(e1Id);
    expect(await ok(c2.rpc('c_list_ticket_events', { p_ticket_id: t.id }))).toEqual([]);
    expect(await ok(c2.from('ticket_messages').select('id').eq('ticket_id', t.id))).toEqual([]);

    // Customers choose staff by alias; the list never carries staff ids
    const reportable = await ok(c2.rpc('list_reportable_staff_aliases'));
    expect(JSON.stringify(reportable)).toContain(`E1-${RUN}`);
    expect(JSON.stringify(reportable)).not.toContain(e1Id);

    // Complaint naming an employee opens a private 3-member room
    const complaint = (await ok(
      c2.rpc('create_ticket', {
        p_subject: 'Complaint about staff', p_description: 'Rude reply in chat yesterday', p_category: 'general',
        p_priority: 'normal', p_requested_employee_alias: `E1-${RUN}`
      })
    )) as { id: string };
    await ok(e1.rpc('send_complaint_message', { p_ticket_id: complaint.id, p_body: 'Sorry about that' }));
    await denied(e2.rpc('send_complaint_message', { p_ticket_id: complaint.id, p_body: 'hi' }), /3 complaint chat room members/);
    expect(await ok(e2.from('complaint_chat_messages').select('id'))).toEqual([]);
    const room = await ok(c2.rpc('c_list_complaint_messages', { p_ticket_id: complaint.id }));
    expect(JSON.stringify(room)).not.toContain(e1Id);
    expect(JSON.stringify(room)).not.toContain(bossId);
    expect(await ok(c1.rpc('c_get_complaint_room', { p_ticket_id: complaint.id }))).toBeNull();
  });

  it('staff threads, announcements and stories', async () => {
    const { data: group } = await e1.from('staff_threads').select('id').eq('is_group', true).single();
    await ok(e1.rpc('send_staff_thread_message', { p_thread_id: group!.id, p_body: 'Morning team' }));
    expect(await ok(c1.from('staff_thread_messages').select('id'))).toEqual([]);

    const ann = (await ok(boss.rpc('create_staff_announcement', { p_title: 'Rules', p_body: 'Be kind', p_priority: 'important' }))) as { id: string };
    await denied(e1.rpc('create_staff_announcement', { p_title: 'x', p_body: 'x', p_priority: 'normal' }), /Boss authority/);
    await ok(e1.rpc('acknowledge_staff_post', { p_announcement_id: ann.id }));
    await ok(e1.rpc('acknowledge_staff_post', { p_announcement_id: ann.id }));
    expect(await ok(boss.from('staff_announcement_acks').select('*').eq('announcement_id', ann.id))).toHaveLength(1);

    await ok(boss.rpc('create_customer_announcement', { p_title: 'Sale', p_body: 'Big sale today', p_pinned: true }));
    await ok(boss.rpc('create_story', { p_kind: 'text', p_caption: 'Hello', p_media_path: null, p_bg_style: null }));
    const custView = JSON.stringify([
      await ok(c1.rpc('list_customer_announcements')),
      await ok(c1.rpc('list_stories', { p_include_expired: false }))
    ]);
    expect(custView).toContain('Big sale today');
    expect(custView).not.toContain(bossId);
  });

  it('top-ups: limits, tag rotation, sticky tags, staff status, and customer privacy', async () => {
    const game = (await ok(boss.rpc('upsert_game', { p_id: null, p_name: `Game ${RUN}`, p_active: true, p_sort_order: 1 }))) as { id: string };
    const method = (await ok(e1.rpc('upsert_payment_method', { p_id: null, p_name: `Pay ${RUN}`, p_active: true, p_sort_order: 1 }))) as { id: string };
    const tagA = (await ok(e1.rpc('upsert_payment_tag', { p_id: null, p_method_id: method.id, p_tag: `$A${RUN}`, p_active: true, p_sort_order: 1 }))) as { id: string };
    await ok(e1.rpc('upsert_payment_tag', { p_id: null, p_method_id: method.id, p_tag: `$B${RUN}`, p_active: true, p_sort_order: 2 }));

    // Customers cannot manage, read the tag tables, or drive the rotation directly
    await denied(c1.rpc('upsert_game', { p_id: null, p_name: 'x', p_active: true, p_sort_order: 1 }), /Staff authority/);
    expect(await ok(c1.from('payment_tags').select('id'))).toEqual([]);
    expect(await ok(c1.from('payment_methods').select('id'))).toEqual([]);
    await denied(c1.rpc('resolve_payment_tag', { p_customer_id: c1Id, p_method_id: method.id, p_consume: true }), /permission denied/);

    // Rotate (default): the tag moves on after every 5 deposits
    await ok(boss.rpc('update_app_settings', { p_patch: { paymentTagMode: 'rotate', paymentTagRotateEvery: 5 } }));
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = (await ok(c1.rpc('submit_topup', {
        p_game_id: game.id, p_game_username: 'player1', p_amount_cents: 1500,
        p_method_id: method.id, p_client_request_id: `rot-${RUN}-${i}`
      }))) as { tag: string; handledBy: unknown };
      expect(r.handledBy).toBeNull();
      seen.push(r.tag);
    }
    expect(seen).toEqual([...Array(5).fill(`$A${RUN}`), `$B${RUN}`]);

    // Sticky: a customer keeps the tag staff gave them
    await ok(boss.rpc('update_app_settings', { p_patch: { paymentTagMode: 'sticky' } }));
    await ok(e1.rpc('set_customer_payment_tag', { p_customer_id: c2Id, p_method_id: method.id, p_tag_id: tagA.id }));
    const opts = (await ok(c2.rpc('c_get_payment_options'))) as Array<{ methodId: string; tag: string }>;
    expect(opts.find((o) => o.methodId === method.id)?.tag).toBe(`$A${RUN}`);
    for (let i = 0; i < 6; i++) {
      const r = (await ok(c2.rpc('submit_topup', {
        p_game_id: game.id, p_game_username: 'player2', p_amount_cents: 1500,
        p_method_id: method.id, p_client_request_id: `sticky-${RUN}-${i}`
      }))) as { tag: string };
      expect(r.tag).toBe(`$A${RUN}`);
    }
    await ok(boss.rpc('update_app_settings', { p_patch: { paymentTagMode: 'rotate' } }));

    // Staff see the request (and an unread chat message); status updates are one-time
    const { data: req } = await e1.from('topup_requests').select('id, status, message_id').eq('client_request_id', `rot-${RUN}-0`).single();
    expect(req!.status).toBe('waiting');
    expect(req!.message_id).not.toBeNull();
    await denied(c1.rpc('update_topup_status', { p_topup_id: req!.id, p_status: 'loaded' }), /Staff authority/);
    await ok(e1.rpc('update_topup_status', { p_topup_id: req!.id, p_status: 'loaded', p_note: 'Enjoy' }));
    await denied(e1.rpc('update_topup_status', { p_topup_id: req!.id, p_status: 'not_received' }), /already marked/);

    const mine = (await ok(c1.rpc('c_list_topups'))) as Array<Record<string, unknown>>;
    expect(mine.find((t) => t.id === req!.id)?.status).toBe('loaded');
    expect(JSON.stringify(mine)).not.toContain(e1Id);
    expect(JSON.stringify(await ok(c2.rpc('c_list_topups')))).not.toContain(req!.id);
    expect(await ok(c1.from('topup_requests').select('id'))).toEqual([]);

    // Bad input
    await denied(c1.rpc('submit_topup', {
      p_game_id: game.id, p_game_username: 'p', p_amount_cents: 50,
      p_method_id: method.id, p_client_request_id: `bad-${RUN}`
    }), /INVALID_AMOUNT/);
  });

  it('suspension takes effect immediately; logs are append-only for everyone', async () => {
    await ok(boss.rpc('set_user_status', { p_target: c2Id, p_status: 'suspended' }));
    expect(await ok(c2.rpc('c_get_conversation'))).toBeNull();
    await denied(
      c2.rpc('create_ticket', { p_subject: 'blocked', p_description: 'should not work', p_category: 'general', p_priority: 'low' }),
      /Active customer required/
    );
    await denied(boss.rpc('set_user_status', { p_target: c2Id, p_status: 'pending_approval' }), /Approval happens once/);

    // Even the service role cannot rewrite history
    await denied(admin.from('activity_events').delete().eq('actor_id', c1Id), /APPEND_ONLY_VIOLATION/);
    await denied(admin.from('audit_log').update({ action: 'tampered' }).eq('actor_id', bossId), /APPEND_ONLY_VIOLATION/);

    // A customer can never escalate their own role
    await c1.from('profiles').update({ role: 'boss' }).eq('id', c1Id);
    const role = await ok(admin.from('profiles').select('role').eq('id', c1Id).single());
    expect(role).toEqual({ role: 'customer' });
  });
});
