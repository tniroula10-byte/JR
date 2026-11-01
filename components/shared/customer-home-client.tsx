'use client';

/**
 * Unified Customer Home Hub (`components/shared/customer-home-client.tsx`)
 * Order & layout:
 * 1. Top of page: 24-Hour Stories (shown ONLY if Boss BOKA has posted a story)
 * 2. Welcome Back Card (no Raise Ticket button, no promotional subtitle)
 * 3. Announcements (just after Welcome Back)
 * 4. Daily Spin Bonus (resets every 12:00 AM California time / America/Los_Angeles)
 * 5. Expandable Chat Box for messaging the Admin
 * 6. Game Points Catalog (USD $) & Notifications
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Gift,
  Maximize2,
  Megaphone,
  MessageSquare,
  Minimize2,
  Pin,
  RotateCw,
  Send,
  Shield,
  Sparkles
} from 'lucide-react';
import {
  markAllNotificationsReadAction,
  sendCustomerMessageAction,
  spinDailyBonusAction
} from '@/actions';
import { CustomerCatalogClient } from '@/components/catalog/customer-catalog';
import { StoryViewerClient } from '@/components/stories/story-viewer';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import type {
  AppNotification,
  Conversation,
  CustomerAnnouncement,
  CustomerMessageView,
  Product,
  Profile,
  SpinBonusStatus,
  Story
} from '@/lib/data/types';
import {
  formatIST,
  formatISTTime,
  getSecondsUntilCaliforniaMidnight
} from '@/lib/time';
import { cn } from '@/lib/utils';

function formatCountdownHMS(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function CustomerHomeClient({
  profile,
  stories,
  announcements,
  products,
  conversation,
  initialMessages,
  notifications,
  initialSpinBonus
}: {
  profile: Profile;
  stories: Story[];
  announcements: CustomerAnnouncement[];
  products: Product[];
  conversation: Conversation | null;
  initialMessages: CustomerMessageView[];
  notifications: AppNotification[];
  initialSpinBonus: SpinBonusStatus;
}) {
  const router = useRouter();
  const [chatExpanded, setChatExpanded] = useState(true);
  const [storiesViewerOpen, setStoriesViewerOpen] = useState(true);
  const [messages, setMessages] = useState<CustomerMessageView[]>(initialMessages);
  const [chatBody, setChatBody] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  // Daily Spin Bonus State (Resets every 12:00 AM California Time)
  const [spinStatus, setSpinStatus] = useState<SpinBonusStatus>(initialSpinBonus);
  const [spinning, setSpinning] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [secsToReset, setSecsToReset] = useState<number | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setSpinStatus(initialSpinBonus);
  }, [initialSpinBonus]);

  useEffect(() => {
    setSecsToReset(getSecondsUntilCaliforniaMidnight());
    const timer = setInterval(() => {
      setSecsToReset(getSecondsUntilCaliforniaMidnight());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Show 24-hour story on top ONLY if Boss (BOKA) has posted a story
  const bossStories = stories.filter((s) => s.authorId === 'boss-1');
  const unreadNotifs = notifications.filter((n) => !n.readAt);

  async function handleSpinBonus() {
    if (spinning || spinStatus.hasSpunToday) return;
    setSpinning(true);
    setSpinError(null);
    setWheelRotation((prev) => prev + 1080 + Math.floor(Math.random() * 360));

    try {
      const res = await spinDailyBonusAction();
      if (!res.ok || !res.data) {
        setSpinError(res.error ?? 'Unable to spin right now.');
      } else {
        setSpinStatus(res.data);
        router.refresh();
      }
    } finally {
      setSpinning(false);
    }
  }

  async function handleSendAdminMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!conversation || !chatBody.trim()) return;
    setSendingChat(true);
    setChatError(null);
    const clientMsgId = `home-cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await sendCustomerMessageAction({
        conversationId: conversation.id,
        body: chatBody.trim(),
        clientMsgId
      });
      if (!res.ok || !res.data) {
        setChatError(res.error ?? 'Failed to send message.');
      } else {
        setMessages((prev) => [...prev, res.data!]);
        setChatBody('');
        router.refresh();
      }
    } finally {
      setSendingChat(false);
    }
  }

  async function handleMarkNotificationsRead() {
    setMarkingRead(true);
    try {
      await markAllNotificationsReadAction();
      router.refresh();
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* 1. TOP OF PAGE: 24-Hour Stories — Shown ONLY if Boss (BOKA) has put on a story */}
      {bossStories.length > 0 ? (
        <section id="stories-section" aria-labelledby="stories-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2
              id="stories-heading"
              className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2"
            >
              <Sparkles className="h-5 w-5 text-violet-400" aria-hidden="true" />
              <span>BOKA 24-Hour Stories ({bossStories.length})</span>
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStoriesViewerOpen((v) => !v)}
            >
              {storiesViewerOpen ? (
                <>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  <span>Hide Story</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  <span>View Story</span>
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {bossStories.map((st) => (
              <div
                key={st.id}
                onClick={() => setStoriesViewerOpen(true)}
                className="group cursor-pointer flex items-center gap-3.5 rounded-2xl border border-violet-500/35 bg-midnight-800/90 p-3.5 transition hover:border-violet-400"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-emerald-400 p-0.5 shadow-violet-glow">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-midnight-950 text-xs font-bold text-violet-200">
                    BOKA
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={st.viewedByCaller ? 'slate' : 'emerald'}>
                      {st.viewedByCaller ? 'Viewed' : 'New Story'}
                    </Badge>
                    <span className="text-[11px] text-slate-400">
                      Expires {formatIST(st.expiresAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs sm:text-sm font-medium text-slate-100 group-hover:text-white">
                    {st.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {storiesViewerOpen ? <StoryViewerClient stories={bossStories} /> : null}
        </section>
      ) : null}

      {/* 2. Welcome Back Banner (No Raise Ticket button, no subtitle paragraph) */}
      <Card className="relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-violet-950/70 via-midnight-800 to-midnight-950 border-violet-500/35">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="emerald">VIP MEMBER</Badge>
              <span className="text-xs text-slate-400">US Dollars ($) • California Time (PT)</span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-white">
              Welcome back, {profile.fullName}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={() => setChatExpanded((prev) => !prev)}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>{chatExpanded ? 'Collapse Admin Chat' : 'Expand Admin Chat'}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Announcements — On top just after Welcome Back */}
      <section aria-labelledby="home-announcements-heading" className="space-y-3">
        <h2
          id="home-announcements-heading"
          className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2"
        >
          <Megaphone className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <span>Announcements ({announcements.length})</span>
        </h2>
        {announcements.length === 0 ? (
          <Card className="p-4 text-xs text-slate-400">
            No active announcements from BOKA right now.
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((ann) => (
              <Card
                key={ann.id}
                className={cn(
                  'p-4 space-y-1.5',
                  ann.pinned ? 'border-amber-500/40 bg-amber-500/5' : ''
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {ann.pinned ? (
                      <Badge tone="amber">
                        <Pin className="h-3 w-3" aria-hidden="true" />
                        <span>PINNED</span>
                      </Badge>
                    ) : (
                      <Badge tone="emerald">UPDATE</Badge>
                    )}
                    <span className="text-xs text-slate-400">BOKA</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatIST(ann.publishedAt)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{ann.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{ann.body}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 4. Daily Spin Bonus — Resets every 12:00 AM California Time (America/Los_Angeles) */}
      <section aria-labelledby="spin-bonus-heading">
        <Card className="p-5 sm:p-6 border-violet-500/45 bg-gradient-to-br from-midnight-800 via-midnight-900 to-midnight-950">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="emerald">DAILY SPIN BONUS</Badge>
                <Badge tone="amber">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  <span>Resets 12:00 AM California Time (PT)</span>
                </Badge>
              </div>
              <h2
                id="spin-bonus-heading"
                className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2"
              >
                <Gift className="h-5 w-5 text-violet-400" aria-hidden="true" />
                <span>Daily Lucky Spin Bonus</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Spin once every day for instant bonus game points! Your daily spin automatically resets at{' '}
                <strong className="text-white">12:00 AM California Time (PT)</strong>.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
                <span>
                  California Date: <strong className="font-mono text-slate-200">{spinStatus.dateKeyCalifornia}</strong>
                </span>
                <span>•</span>
                <span>
                  Next Reset In:{' '}
                  <strong className="font-mono text-violet-300">
                    {secsToReset !== null ? formatCountdownHMS(secsToReset) : '12:00 AM PT'}
                  </strong>
                </span>
              </div>

              {spinError ? (
                <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {spinError}
                </div>
              ) : null}

              {spinStatus.hasSpunToday && spinStatus.todaysSpin ? (
                <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3.5 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-300">
                    Today&apos;s Bonus Claimed!
                  </p>
                  <p className="text-sm font-extrabold text-white">
                    You won {spinStatus.todaysSpin.rewardLabel}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Claimed at {formatIST(spinStatus.todaysSpin.spunAt)} • Come back after 12:00 AM California Time for your next spin.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Interactive Luxury Green & Gold Spin Wheel */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <div
                  style={{ transform: `rotate(${wheelRotation}deg)` }}
                  className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-violet-400/60 bg-gradient-to-tr from-midnight-950 via-violet-900/70 to-amber-500/30 shadow-violet-glow transition-transform duration-700 ease-out"
                >
                  <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border border-violet-400/40 bg-midnight-950 text-center px-2">
                    <Sparkles className="h-4 w-4 text-amber-300 mb-0.5" aria-hidden="true" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-white">
                      {spinStatus.hasSpunToday && spinStatus.todaysSpin
                        ? `+${spinStatus.todaysSpin.rewardPoints}`
                        : 'SPIN'}
                    </span>
                    <span className="text-[9px] text-violet-300">PTS</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSpinBonus}
                disabled={spinning || spinStatus.hasSpunToday}
                className="min-w-[190px]"
              >
                <RotateCw
                  className={cn('h-4 w-4', spinning ? 'animate-spin' : '')}
                  aria-hidden="true"
                />
                <span>
                  {spinning
                    ? 'Spinning...'
                    : spinStatus.hasSpunToday
                      ? 'Spun Today (Resets 12 AM PT)'
                      : 'Spin Daily Bonus Now'}
                </span>
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* 5. Expandable Chat Box for Messaging the Admin */}
      <section aria-labelledby="home-admin-chat-heading">
        <Card className="overflow-hidden border-violet-500/45">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={chatExpanded}
            onClick={() => setChatExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setChatExpanded((v) => !v);
              }
            }}
            className="flex cursor-pointer items-center justify-between gap-3 bg-gradient-to-r from-violet-950/60 via-midnight-900 to-midnight-900 px-5 py-4 transition hover:bg-midnight-800/80"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/40 shadow-violet-glow">
                <Shield className="h-5 w-5 text-violet-300" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="home-admin-chat-heading" className="text-sm sm:text-base font-bold text-white">
                    Message Admin — John Rambo Support
                  </h2>
                  <Badge tone="emerald">Direct Line</Badge>
                  {conversation && conversation.customerUnreadCount > 0 ? (
                    <Badge tone="violet">{conversation.customerUnreadCount} new</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-slate-400">
                  Expandable live chat box • Click header to {chatExpanded ? 'minimize' : 'expand'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/chat"
                onClick={(e) => e.stopPropagation()}
                className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-midnight-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-violet-500/40 hover:text-white"
              >
                Full Screen Chat →
              </Link>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-midnight-950 text-slate-200">
                {chatExpanded ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
            </div>
          </div>

          {chatExpanded ? (
            <div className="border-t border-slate-800/90">
              {conversation ? (
                <>
                  <div
                    aria-label="Home expandable admin chat messages"
                    className="max-h-80 overflow-y-auto p-4 space-y-3 bg-midnight-950/50"
                  >
                    {messages.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">
                        No messages yet. Send a message below to chat with Admin!
                      </p>
                    ) : (
                      messages.map((m) => {
                        const isCustomer = m.senderKind === 'customer';
                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'flex flex-col max-w-[85%] sm:max-w-[75%]',
                              isCustomer ? 'ml-auto items-end' : 'mr-auto items-start'
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <span className="text-[11px] font-semibold text-slate-300">
                                {isCustomer ? 'You' : 'John Rambo Support (Admin)'}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {formatISTTime(m.createdAt)}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed',
                                isCustomer
                                  ? 'bg-violet-600 text-white rounded-br-sm shadow-violet-subtle'
                                  : 'bg-midnight-900 border border-slate-800 text-slate-100 rounded-bl-sm'
                              )}
                            >
                              <p>{m.body}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {chatError ? (
                    <div className="px-4 py-2 bg-rose-500/15 border-t border-rose-500/30 text-xs text-rose-200">
                      {chatError}
                    </div>
                  ) : null}

                  <form
                    onSubmit={handleSendAdminMessage}
                    className="flex items-center gap-2 border-t border-slate-800/90 bg-midnight-900/90 p-3"
                  >
                    <label htmlFor="home-admin-chat-input" className="sr-only">
                      Message the admin
                    </label>
                    <Input
                      id="home-admin-chat-input"
                      placeholder="Write a message to Admin (John Rambo Support)..."
                      value={chatBody}
                      onChange={(e) => setChatBody(e.target.value)}
                    />
                    <Button type="submit" disabled={sendingChat || !chatBody.trim()}>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>{sendingChat ? 'Sending...' : 'Send'}</span>
                    </Button>
                  </form>
                </>
              ) : (
                <div className="p-4 text-xs text-slate-400">
                  Your support chat line is being initialized.
                </div>
              )}
            </div>
          ) : null}
        </Card>
      </section>

      {/* 6. Game Points Catalog (USD $) */}
      <section id="catalog-section" className="pt-2 border-t border-slate-800/80">
        <CustomerCatalogClient products={products} />
      </section>

      {/* 7. Notifications */}
      <section aria-labelledby="home-notifications-heading" className="space-y-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="home-notifications-heading"
            className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2"
          >
            <Bell className="h-5 w-5 text-violet-400" aria-hidden="true" />
            <span>Notifications ({unreadNotifs.length} unread)</span>
          </h2>
          {unreadNotifs.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={markingRead}
              onClick={handleMarkNotificationsRead}
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span>{markingRead ? 'Marking...' : 'Mark All Read'}</span>
            </Button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            title="All caught up!"
            description="You have no notifications right now."
          />
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={cn(
                  'p-3.5 flex items-start justify-between gap-3',
                  !n.readAt ? 'border-violet-500/45 bg-midnight-800' : 'opacity-80'
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={!n.readAt ? 'emerald' : 'slate'}>
                      {!n.readAt ? 'UNREAD' : 'READ'}
                    </Badge>
                    <span className="font-mono text-[10px] text-slate-400">
                      {formatIST(n.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-white">{n.title}</h3>
                  <p className="text-xs text-slate-300">{n.body}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
