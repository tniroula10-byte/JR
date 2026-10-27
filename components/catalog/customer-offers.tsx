'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Coins, MessageSquare, XCircle } from 'lucide-react';
import { acceptCounterOfferAction, withdrawOfferAction } from '@/actions';
import { Badge, Button, Card, EmptyState } from '@/components/ui/primitives';
import type { Offer } from '@/lib/data/types';
import { formatPaiseToINR } from '@/lib/money';
import { formatIST } from '@/lib/time';

export function CustomerOffersClient({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleAcceptCounter(offerId: string) {
    setBusyId(offerId);
    setFeedback(null);
    try {
      const res = await acceptCounterOfferAction(offerId);
      if (res.ok) {
        setFeedback('Counter-offer accepted! Coordinate delivery in Support Chat.');
        router.refresh();
      } else {
        setFeedback(res.error ?? 'Could not accept counter-offer.');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleWithdraw(offerId: string) {
    setBusyId(offerId);
    setFeedback(null);
    try {
      const res = await withdrawOfferAction(offerId);
      if (res.ok) {
        setFeedback('Offer withdrawn.');
        router.refresh();
      } else {
        setFeedback(res.error ?? 'Could not withdraw offer.');
      }
    } finally {
      setBusyId(null);
    }
  }

  const statusTone = (status: Offer['status']) => {
    switch (status) {
      case 'accepted':
        return 'emerald';
      case 'countered':
        return 'amber';
      case 'rejected':
        return 'rose';
      case 'withdrawn':
        return 'slate';
      default:
        return 'violet';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">My Price Offers</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Track live rupee negotiations with John Rambo Support.
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-violet-glow hover:bg-violet-500"
        >
          <Coins className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New Product Offer</span>
        </Link>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-200">
          {feedback}
        </div>
      ) : null}

      {offers.length === 0 ? (
        <EmptyState
          title="No price offers submitted yet"
          description="Browse the Game Points Catalog to propose your price in Indian Rupees."
        />
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(offer.status)} className="uppercase">
                      {offer.status}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatIST(offer.updatedAt)}</span>
                  </div>
                  <h2 className="mt-1.5 text-base font-bold text-white">{offer.productTitle}</h2>
                </div>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:underline"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Discuss in Support Chat</span>
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-midnight-950/80 p-3.5 border border-slate-800/80">
                <div>
                  <span className="text-[11px] text-slate-400 block">Listed Snapshot</span>
                  <span className="font-mono text-sm font-semibold text-slate-300">
                    {formatPaiseToINR(offer.listedPricePaise)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Your Offer</span>
                  <span className="font-mono text-sm font-bold text-violet-300">
                    {formatPaiseToINR(offer.offeredPricePaise)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Support Counter</span>
                  <span className="font-mono text-sm font-bold text-amber-300">
                    {offer.counterPricePaise ? formatPaiseToINR(offer.counterPricePaise) : '—'}
                  </span>
                </div>
              </div>

              {offer.staffNote ? (
                <p className="text-xs text-slate-300 bg-midnight-900/70 rounded-xl px-3.5 py-2.5 border border-slate-800">
                  <span className="font-semibold text-violet-300">John Rambo Support Note: </span>
                  {offer.staffNote}
                </p>
              ) : null}

              {offer.status === 'pending' || offer.status === 'countered' ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {offer.status === 'countered' && offer.counterPricePaise ? (
                    <Button
                      variant="emerald"
                      size="sm"
                      disabled={busyId === offer.id}
                      onClick={() => handleAcceptCounter(offer.id)}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Accept Counter ({formatPaiseToINR(offer.counterPricePaise)})</span>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === offer.id}
                    onClick={() => handleWithdraw(offer.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Withdraw Offer</span>
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
