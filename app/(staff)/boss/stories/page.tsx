import React from 'react';
import { BossStoriesClient } from '@/components/stories/boss-stories-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossStoriesPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const stories = await repo.listStories(caller, true);

  return <BossStoriesClient stories={stories} />;
}
