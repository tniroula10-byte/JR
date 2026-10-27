import React from 'react';
import { Megaphone, Pin } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatIST } from '@/lib/time';

export default async function CustomerAnnouncementsPage() {
  const { caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();
  const announcements = await repo.listCustomerAnnouncements(caller);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Syndicate Announcements</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Official restock notices, dispatch windows, and points exchange updates.
        </p>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          title="No announcements published yet"
          description="Official updates from John Rambo Support will appear here."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <Card
              key={ann.id}
              className={`p-5 space-y-2 ${ann.pinned ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {ann.pinned ? (
                    <Badge tone="amber">
                      <Pin className="h-3 w-3" aria-hidden="true" />
                      <span>PINNED</span>
                    </Badge>
                  ) : (
                    <Badge tone="violet">UPDATE</Badge>
                  )}
                  <span className="text-xs text-slate-400">John Rambo Support</span>
                </div>
                <span className="font-mono text-xs text-slate-400">
                  {formatIST(ann.publishedAt)}
                </span>
              </div>
              <h2 className="text-base font-bold text-white">{ann.title}</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{ann.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
