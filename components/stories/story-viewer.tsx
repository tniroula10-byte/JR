'use client';

/**
 * Fullscreen / Interactive 24h Story Viewer (`components/stories/story-viewer.tsx`)
 * Features progress bars, tap-and-hold pause, next/previous story controls, and automatic view tracking.
 */

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Sparkles } from 'lucide-react';
import { recordStoryViewAction } from '@/actions';
import { Badge, Button, Card, EmptyState } from '@/components/ui/primitives';
import type { Story } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function StoryViewerClient({ stories }: { stories: Story[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const activeStory = stories[activeIndex] ?? null;

  useEffect(() => {
    if (!activeStory) return;
    recordStoryViewAction(activeStory.id).catch(() => {});
  }, [activeStory]);

  useEffect(() => {
    if (!activeStory || paused) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveIndex((idx) => (idx + 1) % stories.length);
          return 0;
        }
        return prev + 4;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [activeStory, paused, stories.length]);

  if (stories.length === 0 || !activeStory) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Stories</span>
        </h1>
        <EmptyState
          title="No live 24-hour stories right now"
          description="Stories automatically expire after 24 hours. Check back soon for flash drops."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" aria-hidden="true" />
            <span>Stories</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Press and hold (or click Pause) to hold any slide. Expired stories vanish automatically.
          </p>
        </div>
        <Badge tone="violet">
          Slide {activeIndex + 1} of {stories.length}
        </Badge>
      </div>

      <Card
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        className={`relative mx-auto max-w-xl overflow-hidden rounded-3xl border border-violet-500/40 bg-gradient-to-br ${activeStory.bgStyle} p-6 sm:p-10 min-h-[420px] flex flex-col justify-between select-none shadow-violet-glow`}
      >
        {/* Top Segmented Progress Bars */}
        <div className="space-y-3">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stories.length}, minmax(0, 1fr))` }}>
            {stories.map((st, idx) => {
              const barWidth = idx < activeIndex ? 100 : idx === activeIndex ? progress : 0;
              return (
                <div key={st.id} className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-violet-400 transition-all duration-150"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-bold">John Rambo Vault</span>
              <span className="text-slate-300/80">• Expires {formatIST(activeStory.expiresAt)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={paused ? 'Resume story' : 'Pause story'}
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Center Story Caption & Media */}
        <div className="my-auto py-8 text-center space-y-4">
          <Badge tone="amber" className="uppercase">
            {activeStory.kind} DROP
          </Badge>
          {activeStory.mediaUrl && activeStory.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img
              src={activeStory.mediaUrl}
              alt={activeStory.caption}
              className="mx-auto max-h-72 w-auto rounded-2xl object-contain"
            />
          ) : null}
          {activeStory.mediaUrl && activeStory.kind === 'video' ? (
            <video
              src={activeStory.mediaUrl}
              controls
              playsInline
              muted
              className="mx-auto max-h-72 w-auto rounded-2xl"
            />
          ) : null}
          <p className="text-lg sm:text-2xl font-extrabold text-white leading-snug">
            {activeStory.caption}
          </p>
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-white/15">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setProgress(0);
              setActiveIndex((idx) => (idx - 1 + stories.length) % stories.length);
            }}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Prev</span>
          </Button>

          <span className="inline-flex items-center gap-1.5 text-xs text-slate-200">
            <Eye className="h-4 w-4 text-violet-300" aria-hidden="true" />
            <span>{activeStory.viewCount} views</span>
          </span>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setProgress(0);
              setActiveIndex((idx) => (idx + 1) % stories.length);
            }}
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
