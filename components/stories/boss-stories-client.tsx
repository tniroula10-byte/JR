'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Plus, Sparkles } from 'lucide-react';
import { createStoryAction } from '@/actions';
import { Badge, Button, Card, Textarea } from '@/components/ui/primitives';
import type { Story, StoryKind } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function BossStoriesClient({ stories }: { stories: Story[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<StoryKind>('text');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await createStoryAction({
        kind,
        caption,
        bgStyle: 'from-violet-900 via-indigo-950 to-slate-950'
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to publish story.');
      } else {
        setCaption('');
        setFeedback('24-hour story published!');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>24-Hour Stories Publisher & Expiry Monitor</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Stories expire automatically 24 hours after publication (`expires_at = now() + 24h`). RLS blocks customers from seeing expired stories.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {feedback}
        </div>
      ) : null}

      <Card className="p-5 space-y-4">
        <h2 className="text-base font-bold text-white">Publish New 24-Hour Story</h2>
        <form onSubmit={handlePublish} className="space-y-4">
          <div>
            <label htmlFor="story-kind" className="block text-xs font-medium text-slate-300 mb-1">
              Story Format
            </label>
            <select
              id="story-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as StoryKind)}
              className="w-full sm:w-64 h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              <option value="text">Text Drop Card</option>
              <option value="image">Image Banner Drop</option>
              <option value="video">Short Video Clip</option>
            </select>
          </div>

          <div>
            <label htmlFor="story-caption" className="block text-xs font-medium text-slate-300 mb-1">
              Story Headline / Caption
            </label>
            <Textarea
              id="story-caption"
              rows={2}
              required
              placeholder="🔥 FLASH DROP: 60,000 BGMI UC packs restocked for immediate rupee negotiation!"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{submitting ? 'Publishing...' : 'Publish 24h Story'}</span>
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stories.map((st) => {
          const isExpired = new Date(st.expiresAt).getTime() <= Date.now();
          return (
            <Card key={st.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Badge tone={isExpired ? 'rose' : 'emerald'}>
                  {isExpired ? 'EXPIRED (Hidden from Customers)' : 'LIVE (24H ACTIVE)'}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-violet-300">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{st.viewCount} customer views</span>
                </span>
              </div>
              <p className="text-sm font-bold text-white">{st.caption}</p>
              <p className="text-[11px] font-mono text-slate-400">
                Created: {formatIST(st.createdAt)} • Expires: {formatIST(st.expiresAt)}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
