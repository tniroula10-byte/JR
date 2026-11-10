/**
 * Idempotent Singleton Boss Bootstrap Script (`scripts/seed-boss.ts`)
 * Decision 2: A one-time, idempotent seed script reads `BOSS_EMAIL` from the environment
 * and creates the single boss. A partial unique index guarantees there is only one boss.
 *
 * Usage: npx tsx --env-file=.env.boss scripts/seed-boss.ts   (see docs/HUMAN-TODO.md, Step 5)
 * Runs outside Next.js, so it builds its own service-role client instead of importing
 * the `server-only` modules under `lib/`.
 */

import { createClient } from '@supabase/supabase-js';
import { hasLiveSupabaseKeys } from '../lib/supabase/env';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in the --env-file (see docs/HUMAN-TODO.md, Step 5).`);
  }
  return value;
}

async function main() {
  if (!hasLiveSupabaseKeys()) {
    console.log('No Supabase keys configured: demo mode already includes the Boss (BOKA). Nothing to do.');
    return;
  }

  const bossEmail = required('BOSS_EMAIL').toLowerCase();
  const bossPassword = required('BOSS_PASSWORD');
  const bossName = required('BOSS_FULL_NAME');
  const bossUsername = process.env.BOSS_USERNAME?.trim() || null;
  const bossAlias = process.env.BOSS_PUBLIC_ALIAS?.trim() || bossName;
  const bossPhone = process.env.BOSS_PHONE?.trim() || null;

  if (bossPassword.length < 12) {
    throw new Error('BOSS_PASSWORD must be at least 12 characters.');
  }

  const admin = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: existingBoss, error: lookupErr } = await admin
    .from('profiles')
    .select('id, email')
    .eq('role', 'boss')
    .maybeSingle();
  if (lookupErr) {
    throw new Error(`Could not read profiles (are the migrations applied?): ${lookupErr.message}`);
  }
  if (existingBoss) {
    console.log(`✓ Boss already exists: ${existingBoss.email}. Nothing changed.`);
    return;
  }

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: bossEmail,
    password: bossPassword,
    email_confirm: true
  });
  if (authErr || !created.user) {
    throw new Error(`Failed to create Boss auth user: ${authErr?.message}`);
  }
  const userId = created.user.id;

  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    role: 'boss',
    status: 'active',
    username: bossUsername,
    full_name: bossName,
    email: bossEmail,
    phone: bossPhone,
    approved_at: new Date().toISOString()
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`Failed to create Boss profile: ${profileErr.message}`);
  }

  const { error: staffErr } = await admin.from('staff_profiles').insert({
    user_id: userId,
    public_alias: bossAlias,
    customer_selectable: false,
    accepts_tickets: true,
    can_manage_products: true,
    can_publish_stories: true,
    can_post_customer_announcements: true
  });
  if (staffErr) {
    throw new Error(`Boss profile created but staff profile failed: ${staffErr.message}`);
  }

  await admin.from('audit_log').insert({
    actor_id: userId,
    action: 'boss_bootstrap',
    entity: 'profiles',
    entity_id: userId,
    after_meta: { email: bossEmail, role: 'boss' }
  });

  console.log(`✓ Created the Boss account: ${bossEmail}. Sign in at /login with BOSS_PASSWORD.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
