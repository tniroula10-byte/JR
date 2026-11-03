/**
 * Live-database E2E (`tests/e2e-live/flows.spec.ts`)
 * Drives the real UI against a local Supabase stack: real logins, real RPCs, real RLS.
 *
 * Setup:
 *   npx supabase start && npx supabase db reset
 *   export $(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=' ...)  # see docs/PROGRESS.md
 *   BOSS_EMAIL=... BOSS_PASSWORD=... BOSS_FULL_NAME=... npx tsx scripts/seed-boss.ts
 *   npm run test:e2e:live
 */
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const BOSS_PASSWORD = process.env.BOSS_PASSWORD ?? 'LocalBossPass#2026';
const PASSWORD = 'LiveE2E#Pass2026';
const RUN = Date.now().toString(36);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const people = {
  bossEmail: '',
  bossId: '',
  employeeEmail: `e2e-emp-${RUN}@test.local`,
  employeeId: '',
  employeeAlias: `Ace-${RUN}`,
  customerEmail: `e2e-cust-${RUN}@test.local`,
  customerName: `E2E Customer ${RUN}`,
  customerId: '',
  productId: ''
};

async function signInUi(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('#email-input', email);
  await page.fill('#password-input', password);
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/(home|boss\/dashboard|employee\/dashboard)/, { timeout: 30000 }).catch(async () => {
    const alert = await page.getByRole('alert').allInnerTexts();
    throw new Error(`Sign-in failed for ${email}: ${alert.join(' | ') || 'no redirect'}`);
  });
  return page;
}

async function latestOtp(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
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
  throw new Error(`No code email for ${email}`);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  expect(SERVICE_KEY, 'local Supabase keys must be exported').not.toBe('');
  const { data: boss } = await admin.from('profiles').select('id, email').eq('role', 'boss').single();
  people.bossId = boss!.id;
  people.bossEmail = boss!.email;

  // An active employee (the invite UI for employees is covered by the DB suite)
  const { data: emp } = await admin.auth.admin.createUser({
    email: people.employeeEmail,
    password: PASSWORD,
    email_confirm: true
  });
  people.employeeId = emp.user!.id;
  const { error: provErr } = await admin.rpc('srv_provision_invite', {
    p_actor: people.bossId,
    p_user_id: people.employeeId,
    p_email: people.employeeEmail,
    p_full_name: `E2E Employee ${RUN}`,
    p_phone: null,
    p_role: 'employee',
    p_public_alias: people.employeeAlias,
    p_username: null,
    p_has_password: true
  });
  expect(provErr).toBeNull();
  await admin
    .from('profiles')
    .update({ status: 'active', approved_by: people.bossId, approved_at: new Date().toISOString() })
    .eq('id', people.employeeId);

  const { data: product } = await admin
    .from('products')
    .insert({
      game_name: 'Valorant',
      title: `E2E Pack ${RUN}`,
      points_qty: 1000,
      description: 'Live E2E product',
      price_paise: 2500,
      status: 'available',
      created_by: people.bossId
    })
    .select('id')
    .single();
  people.productId = product!.id;
});

test('boss invites a customer, who sets a password with the emailed code and is approved', async ({ browser }) => {
  const boss = await signInUi(browser, people.bossEmail, BOSS_PASSWORD);
  await boss.goto('/boss/customers');
  await boss.fill('#inv-name', people.customerName);
  await boss.fill('#inv-email', people.customerEmail);
  await boss.getByRole('button', { name: 'Send Customer Invite' }).click();
  await expect(boss.getByText(people.customerEmail).first()).toBeVisible();

  const code = await latestOtp(people.customerEmail);

  const setup = await (await browser.newContext()).newPage();
  await setup.goto('/login');
  await setup.getByRole('button', { name: 'Customer OTP Setup' }).click();
  await setup.fill('#otp-fullname-input', people.customerName);
  await setup.fill('#otp-email-input', people.customerEmail);
  await setup.fill('#otp-code-input', code);
  await setup.fill('#otp-pwd-input', PASSWORD);
  await setup.getByRole('button', { name: /Verify OTP/ }).click();
  await expect(setup.getByRole('status').filter({ hasText: /approval/i })).toBeVisible();

  // Correct password, but not approved yet
  await setup.fill('#email-input', people.customerEmail);
  await setup.fill('#password-input', PASSWORD);
  await setup.click('form button[type=submit]');
  await expect(setup.getByRole('alert').filter({ hasText: /awaiting approval/i })).toBeVisible();

  await boss.goto('/boss/dashboard');
  const row = boss
    .locator('div', { has: boss.getByText(people.customerEmail) })
    .filter({ has: boss.getByRole('button', { name: 'Approve' }) })
    .last();
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(async () => (await admin.from('profiles').select('status').eq('email', people.customerEmail).single()).data?.status)
    .toBe('active');

  const { data: cust } = await admin.from('profiles').select('id').eq('email', people.customerEmail).single();
  people.customerId = cust!.id;

  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await expect(customer).toHaveURL(/\/home/);
  await expect(customer.getByText(`Welcome back, ${people.customerName}`)).toBeVisible();
});

test('chat: the customer only ever sees "John Rambo Support"', async ({ browser }) => {
  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await customer.goto('/chat');
  const question = `Do you have stock? ${RUN}`;
  await customer.getByPlaceholder('Message John Rambo Support...').fill(question);
  await customer.getByRole('button', { name: 'Send' }).click();
  await expect(customer.getByText(question)).toBeVisible();

  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('customer_id', people.customerId)
    .single();

  const employee = await signInUi(browser, people.employeeEmail, PASSWORD);
  await employee.goto(`/employee/inbox?conversationId=${conv!.id}`);
  await expect(employee.getByText(question).first()).toBeVisible();
  const answer = `Yes, in stock ${RUN}`;
  await employee
    .getByPlaceholder('Reply as John Rambo Support (attribution recorded internally)...')
    .fill(answer);
  await employee.getByRole('button', { name: 'Reply' }).click();
  await expect(employee.getByTestId('staff-attribution-badge').last()).toContainText(people.employeeAlias);

  await customer.reload();
  await expect(customer.getByText(answer)).toBeVisible();
  const html = await customer.content();
  expect(html).not.toContain(people.employeeEmail);
  expect(html).not.toContain(people.employeeAlias);
  expect(html).not.toContain(people.employeeId);
});

test('offers: employee counters in dollars, customer accepts the counter', async ({ browser }) => {
  // Customers have no offer form in the current UI, so the offer is placed through the same RPC
  const custClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await custClient.auth.signInWithPassword({ email: people.customerEmail, password: PASSWORD });
  const { data: placed, error } = await custClient.rpc('submit_offer', {
    p_product_id: people.productId,
    p_amount_paise: 2000,
    p_client_msg_id: `e2e-offer-${RUN}`
  });
  expect(error).toBeNull();
  const offerId = (placed as { offer: { id: string } }).offer.id;

  const employee = await signInUi(browser, people.employeeEmail, PASSWORD);
  await employee.goto('/employee/offers');
  await employee.fill(`[id="counter-inr-${offerId}"]`, '21.50');
  await employee
    .locator('div', { has: employee.locator(`[id="counter-inr-${offerId}"]`) })
    .getByRole('button', { name: 'Send Counter' })
    .last()
    .click();
  await expect
    .poll(async () => (await admin.from('offers').select('status, counter_price_paise').eq('id', offerId).single()).data)
    .toEqual({ status: 'countered', counter_price_paise: 2150 });

  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await customer.goto('/offers');
  await customer.getByRole('button', { name: 'Accept Counter ($21.50)' }).click();
  await expect
    .poll(async () => (await admin.from('offers').select('status').eq('id', offerId).single()).data?.status)
    .toBe('accepted');
});

test('tickets: customer raises, boss assigns, employee replies anonymously', async ({ browser }) => {
  const subject = `Points not delivered ${RUN}`;
  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await customer.goto('/tickets');
  await customer.getByRole('button', { name: 'Raise New Ticket' }).click();
  await customer.fill('#tkt-subject', subject);
  await customer.fill('#tkt-desc', 'I paid yesterday but have not received my points.');
  await customer.getByRole('button', { name: 'Submit Ticket' }).click();
  await expect(customer.getByText(subject).first()).toBeVisible();

  const { data: ticket } = await admin.from('tickets').select('id').eq('subject', subject).single();

  const boss = await signInUi(browser, people.bossEmail, BOSS_PASSWORD);
  await boss.goto(`/boss/tickets?ticketId=${ticket!.id}`);
  await boss.selectOption('#boss-ticket-assign', people.employeeId);
  await expect
    .poll(async () => (await admin.from('tickets').select('assigned_employee_id').eq('id', ticket!.id).single()).data?.assigned_employee_id)
    .toBe(people.employeeId);

  const employee = await signInUi(browser, people.employeeEmail, PASSWORD);
  await employee.goto(`/employee/tickets?ticketId=${ticket!.id}`);
  const reply = `Delivered now, please check ${RUN}`;
  await employee.fill('#staff-ticket-reply', reply);
  await employee.getByRole('button', { name: 'Reply' }).click();
  await expect(employee.getByText(reply).first()).toBeVisible();

  await customer.goto(`/tickets?ticketId=${ticket!.id}`);
  await expect(customer.getByText(reply).first()).toBeVisible();
  // Public aliases are listed on purpose (customers may name an employee in a complaint);
  // internal staff ids and emails must never reach the page.
  const html = await customer.content();
  expect(html).not.toContain(people.employeeId);
  expect(html).not.toContain(people.employeeEmail);
});

test('top-up: customer picks a game, amount and payment tag; employee marks it loaded', async ({ browser }) => {
  const gameName = `Top Game ${RUN}`;
  const { data: game } = await admin
    .from('games')
    .insert({ name: gameName, active: true, sort_order: 0, created_by: people.bossId })
    .select('id')
    .single();
  const { data: method } = await admin
    .from('payment_methods')
    .insert({ name: `CashTest ${RUN}`, active: true, sort_order: 0 })
    .select('id')
    .single();
  const tag = `$jr${RUN}`;
  await admin.from('payment_tags').insert({ method_id: method!.id, tag, active: true, sort_order: 1 });
  // Keep this test's method within the 3-active limit
  await admin.from('payment_methods').update({ active: false }).neq('id', method!.id);

  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.goto('/topups');
  await customer.getByRole('button', { name: 'Games' }).first().click();
  await customer.getByRole('dialog').getByRole('button', { name: gameName }).click();
  await customer.fill('#topup-username', 'ace_player');
  await customer.fill('#topup-amount', '40');
  await customer.getByRole('dialog').getByRole('button', { name: 'Next', exact: true }).click();
  await customer.getByRole('radio', { name: new RegExp(tag.replace('$', '\\$')) }).click();
  await customer.screenshot({ path: 'docs/screenshots/topup-payment-mobile-390.png' });
  await customer.getByRole('dialog').getByRole('button', { name: 'Send request' }).click();
  await expect(customer.getByRole('dialog')).toContainText(/Request #\d+ sent/);

  const { data: req } = await admin
    .from('topup_requests')
    .select('id, ref_no, tag_text, amount_cents, game_username')
    .eq('customer_id', people.customerId)
    .eq('game_id', game!.id)
    .single();
  expect(req).toMatchObject({ tag_text: tag, amount_cents: 4000, game_username: 'ace_player' });

  const employee = await signInUi(browser, people.employeeEmail, PASSWORD);
  await employee.goto('/employee/topups');
  const card = employee.locator('div', { hasText: `#${req!.ref_no}` }).filter({ has: employee.getByRole('button', { name: 'Loaded' }) }).last();
  await expect(card).toContainText('ace_player');
  await card.getByRole('button', { name: 'Loaded' }).click();
  await expect(employee.getByRole('status').filter({ hasText: 'marked Loaded' })).toBeVisible();

  await customer.goto('/topups');
  await expect(customer.getByText('Loaded').first()).toBeVisible();
  await customer.goto('/chat');
  await expect(customer.getByText(/has been loaded/).first()).toBeVisible();
  expect(await customer.content()).not.toContain(people.employeeId);
});

test('repeated wrong passwords lock the account out for 15 minutes', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  const target = `nobody-${RUN}@test.local`;
  for (let i = 0; i < 5; i++) {
    await page.fill('#email-input', target);
    await page.fill('#password-input', `wrong-${i}`);
    await page.click('form button[type=submit]');
    await expect(page.getByRole('alert').filter({ hasText: /Invalid/i })).toBeVisible();
  }
  await page.fill('#password-input', 'wrong-again');
  await page.click('form button[type=submit]');
  await expect(page.getByRole('alert').filter({ hasText: /Too many sign-in attempts/i })).toBeVisible();
});

test('suspension locks the customer out on the next page load', async ({ browser }) => {
  const customer = await signInUi(browser, people.customerEmail, PASSWORD);
  await admin.from('profiles').update({ status: 'suspended' }).eq('id', people.customerId);
  await customer.goto('/home');
  await expect(customer).toHaveURL(/\/login/);
});
