'use client';

import React from 'react';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { CustomerTopupButton } from '@/components/topups/customer-topup-flow';
import type { TopupRequest } from '@/lib/data/types';
import { formatPaiseToINR } from '@/lib/money';
import { formatIST } from '@/lib/time';

export const TOPUP_STATUS_LABEL: Record<TopupRequest['status'], string> = {
  waiting: 'Waiting',
  loaded: 'Loaded',
  not_received: 'Payment not received'
};

export const TOPUP_STATUS_TONE = {
  waiting: 'amber',
  loaded: 'emerald',
  not_received: 'rose'
} as const;

export function CustomerTopupsClient({ topups }: { topups: TopupRequest[] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">Games & Top-ups</h1>
          <p className="text-xs sm:text-sm text-slate-400">Tap Games to top up. Your requests show here.</p>
        </div>
        <CustomerTopupButton />
      </div>

      {topups.length === 0 ? (
        <EmptyState title="No top-ups yet" description="Tap Games, pick a game and enter the amount." />
      ) : (
        <div className="space-y-3">
          {topups.map((t) => (
            <Card key={t.id} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-violet-300">#{t.refNo}</span>
                <Badge tone={TOPUP_STATUS_TONE[t.status]}>{TOPUP_STATUS_LABEL[t.status]}</Badge>
              </div>
              <p className="text-sm font-semibold text-white">
                {formatPaiseToINR(t.amountCents)} on {t.gameName}
              </p>
              <p className="text-xs text-slate-400">
                Username {t.gameUsername} • {t.methodName} {t.tag} • {formatIST(t.createdAt)}
              </p>
              {t.staffNote ? <p className="text-xs text-slate-300">Note: {t.staffNote}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
