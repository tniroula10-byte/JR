/**
 * Idempotent Singleton Boss Bootstrap Script (`scripts/seed-boss.ts`)
 * Decision 2: A one-time, idempotent seed script reads `BOSS_EMAIL` from the environment
 * and creates the single boss. A partial unique index guarantees there is only one boss.
 */

import 'server-only';
import { hasLiveSupabaseKeys } from '../lib/data';
import { MockDataRepository } from '../lib/data/mock';
import { createSupabaseAdminClient } from '../lib/supabase/admin';

async function main() {
  const bossEmail = (process.env.BOSS_EMAIL || 'boka@johnrambo.us').trim().toLowerCase();
  const bossName = (process.env.BOSS_FULL_NAME || 'BOKA').trim();
  const bossPhone = (process.env.BOSS_PHONE || '+13105550001').trim();

  if (!hasLiveSupabaseKeys()) {
    const repo = new MockDataRepository();
    const existing = await repo.getProfileByEmail(bossEmail);
    console.log(
      `✓ [Mock Mode] Singleton Boss verified: ${existing?.fullName ?? bossName} (${bossEmail},phone=${bossPhone})`
    );
    return;
  }

  const supabaseAdmin = createSupabaseAdminClient();

  const { data: existingBoss } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('role', 'boss')
    .maybeSingle();

  if (existingBoss) {
    console.log(
      `✓ Singleton Boss already bootstrapped: ${existingBoss.email} (id=${existingBoss.id}). Exiting idempotently.`
    );
    return;
  }

  const { data: createdAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: bossEmail,
    email_confirm: true
  });

  if (authErr || !createdAuth.user) {
    throw new Error(`Failed to create Boss auth user: ${authErr?.message}`);
  }

  const userId = createdAuth.user.id;
  await supabaseAdmin.from('profiles').insert({
    id: userId,
    role: 'boss',
    status: 'active',
    full_name: bossName,
    email: bossEmail,
    phone: bossPhone
  });

  await supabaseAdmin.from('staff_profiles').insert({
    user_id: userId,
    public_alias: 'BOKA',
    customer_selectable: false,
    accepts_tickets: true,
    can_manage_products: true,
    can_publish_stories: true,
    can_post_customer_announcements: true
  });

  await supabaseAdmin.from('audit_log').insert({
    actor_id: userId,
    action: 'boss_bootstrap',
    entity: 'profiles',
    entity_id: userId,
    after_meta: { email: bossEmail, role: 'boss' }
  });

  console.log(`✓ Bootstrapped Singleton Boss: ${bossEmail} (id=${userId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
