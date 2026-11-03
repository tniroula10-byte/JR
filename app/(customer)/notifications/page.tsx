import React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { markAllNotificationsReadAction } from '@/actions';
import { Badge, Button, Card, EmptyState } from '@/components/ui/primitives';
import { EnablePushButton } from '@/components/shared/enable-push-button';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';
import { formatIST } from '@/lib/time';

export default async function NotificationsPage() {
  const { caller } = await requireActiveSession(['boss', 'employee', 'customer']);
  const repo = getDataRepository();
  const notifications = await repo.listNotifications(caller);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-violet-400" aria-hidden="true" />
            <span>Notifications</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Chat replies, top-ups, tickets and announcements.
          </p>
          <div className="mt-2">
            <EnablePushButton />
          </div>
        </div>

        {notifications.some((n) => !n.readAt) ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="secondary" size="sm">
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span>Mark All Read</span>
            </Button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title="All caught up!"
          description="You have no notifications at the moment."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 ${
                !n.readAt ? 'border-violet-500/45 bg-midnight-800' : 'opacity-80'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge tone={!n.readAt ? 'violet' : 'slate'}>
                    {!n.readAt ? 'UNREAD' : 'READ'}
                  </Badge>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatIST(n.createdAt)}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-white">{n.title}</h2>
                <p className="text-xs text-slate-300">{n.body}</p>
              </div>
              <Link
                href={n.link}
                className="shrink-0 rounded-xl border border-violet-500/35 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/15"
              >
                Open →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
