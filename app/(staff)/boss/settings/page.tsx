import React from 'react';
import { BossSettingsClient } from '@/components/shared/boss-settings-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossSettingsPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const [settings, profiles] = await Promise.all([
    repo.getAppSettings(caller),
    repo.listAllProfiles(caller)
  ]);

  return <BossSettingsClient settings={settings} profiles={profiles} />;
}
