'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Megaphone, Plus } from 'lucide-react';
import {
  createCustomerAnnouncementAction,
  createStaffAnnouncementAction
} from '@/actions';
import { Badge, Button, Card, Input, Textarea } from '@/components/ui/primitives';
import type {
  AnnouncementPriority,
  CustomerAnnouncement,
  StaffAnnouncement
} from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function BossAnnouncementsClient({
  staffAnnouncements,
  customerAnnouncements
}: {
  staffAnnouncements: StaffAnnouncement[];
  customerAnnouncements: CustomerAnnouncement[];
}) {
  const router = useRouter();
  const [staffTitle, setStaffTitle] = useState('');
  const [staffBody, setStaffBody] = useState('');
  const [staffPriority, setStaffPriority] = useState<AnnouncementPriority>('important');

  const [custTitle, setCustTitle] = useState('');
  const [custBody, setCustBody] = useState('');
  const [custPinned, setCustPinned] = useState(false);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handlePostStaff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await createStaffAnnouncementAction({
        title: staffTitle,
        body: staffBody,
        priority: staffPriority
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to post staff directive.');
      } else {
        setStaffTitle('');
        setStaffBody('');
        setFeedback('Posted to Staff Channel! All 4 employees have been notified to acknowledge.');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePostCustomer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await createCustomerAnnouncementAction({
        title: custTitle,
        body: custBody,
        pinned: custPinned
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to publish customer announcement.');
      } else {
        setCustTitle('');
        setCustBody('');
        setCustPinned(false);
        setFeedback('Customer announcement published!');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Announcements Hub (Staff Channel & Customer Broadcasts)</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Post Boss-only directives to the Staff Channel (with live acknowledgement tracking) and publish Customer Announcements.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {feedback}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Channel Publisher & Acknowledgement Matrix */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4 border-amber-500/35">
            <h2 className="text-base font-bold text-white">
              1. Post to Internal Staff Channel (Boss Only)
            </h2>
            <form onSubmit={handlePostStaff} className="space-y-3">
              <div>
                <label htmlFor="staff-ann-priority" className="block text-xs text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  id="staff-ann-priority"
                  value={staffPriority}
                  onChange={(e) => setStaffPriority(e.target.value as AnnouncementPriority)}
                  className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label htmlFor="staff-ann-title" className="block text-xs text-slate-300 mb-1">
                  Directive Title
                </label>
                <Input
                  id="staff-ann-title"
                  required
                  placeholder="e.g. Weekend Margin Floor Policy"
                  value={staffTitle}
                  onChange={(e) => setStaffTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="staff-ann-body" className="block text-xs text-slate-300 mb-1">
                  Directive Body
                </label>
                <Textarea
                  id="staff-ann-body"
                  rows={2}
                  required
                  value={staffBody}
                  onChange={(e) => setStaffBody(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Post Staff Directive</span>
              </Button>
            </form>
          </Card>

          {staffAnnouncements.map((sa) => (
            <Card key={sa.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Badge tone="amber" className="uppercase">
                  STAFF • {sa.priority}
                </Badge>
                <Badge tone="emerald">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>{sa.acks.length} / 4 Acknowledged</span>
                </Badge>
              </div>
              <h3 className="text-sm font-bold text-white">{sa.title}</h3>
              <p className="text-xs text-slate-300">{sa.body}</p>
              <p className="text-[11px] text-slate-400">
                Acknowledged by:{' '}
                {sa.acks.map((a) => `${a.employeeName} (${formatIST(a.acknowledgedAt)})`).join(', ') ||
                  'Waiting for employee acknowledgements'}
              </p>
            </Card>
          ))}
        </div>

        {/* Customer Announcements Publisher */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4 border-violet-500/35">
            <h2 className="text-base font-bold text-white">
              2. Publish Customer Announcement
            </h2>
            <form onSubmit={handlePostCustomer} className="space-y-3">
              <div>
                <label htmlFor="cust-ann-title" className="block text-xs text-slate-300 mb-1">
                  Announcement Headline
                </label>
                <Input
                  id="cust-ann-title"
                  required
                  placeholder="e.g. Valorant 25,000 VP Syndicate Drop Live"
                  value={custTitle}
                  onChange={(e) => setCustTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cust-ann-body" className="block text-xs text-slate-300 mb-1">
                  Body
                </label>
                <Textarea
                  id="cust-ann-body"
                  rows={2}
                  required
                  value={custBody}
                  onChange={(e) => setCustBody(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={custPinned}
                  onChange={(e) => setCustPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-midnight-950"
                />
                <span>Pin to top of Customer Home</span>
              </label>
              <Button type="submit" disabled={busy}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Publish to Customers</span>
              </Button>
            </form>
          </Card>

          {customerAnnouncements.map((ca) => (
            <Card key={ca.id} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <Badge tone={ca.pinned ? 'amber' : 'violet'}>
                  {ca.pinned ? 'PINNED CUSTOMER NOTICE' : 'CUSTOMER NOTICE'}
                </Badge>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatIST(ca.publishedAt)}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">{ca.title}</h3>
              <p className="text-xs text-slate-300">{ca.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
