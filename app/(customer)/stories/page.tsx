import React from 'react';
import { StoryViewerClient } from '@/components/stories/story-viewer';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerStoriesPage() {
  const { caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();
  const stories = await repo.listStories(caller, false);

  return <StoryViewerClient stories={stories} />;
}
