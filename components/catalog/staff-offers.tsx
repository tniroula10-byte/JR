'use client';

/**
 * Staff Price Offer Negotiation Console (`components/catalog/staff-offers.tsx`)
 * Allows active staff (within scope) to Accept, Counter (in $ converted to cents), or Reject offers.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Coins, RefreshCw, XCircle } from 'lucide-react';
import { respondToOfferAction } from '@/actions';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import type { Offer } from '@/lib/data/types';
import { formatPaiseToINR, parseRupeesToPaise } from '@/lib/money';
import { formatIST } from '@/lib/time';

export function StaffOffersClient({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleAction(offer: Offer, action: 'counter' | 'accept' | 'reject') {
    setBusyId(offer.id);
    setFeedback(null);
    let counterPaise: number | undefined;

    if (action === 'counter') {
      try {
        counterPaise = parseRupeesToPaise(counterInputs[offer.id] ?? '');
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : 'Enter a valid dollar counter-offer.');
        setBusyId(null);
        return;
      }
    }

    try {
      const res = await respondToOfferAction({
        offerId: offer.id,
        action,
        counterPricePaise: counterPaise,
        note: notes[offer.id] ?? ''
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to respond to offer.');
      } else {
        setFeedback(`Offer #${offer.id} updated (${action.toUpperCase()}).`);
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-400" aria-hidden="true" />
            <span>Price Offers & Negotiation Queue</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Accept, counter or reject customer offers. Customers see every response in their chat.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-200">
          {feedback}
        </div>
      ) : null}

      {offers.length === 0 ? (
        <EmptyState
          title="No price offers in scope"
          description="Customer price offers within your inbox scope will appear here."
        />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => {
            const actionable = offer.status === 'pending' || offer.status === 'countered';
            return (
              <Card key={offer.id} className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          offer.status === 'accepted'
                            ? 'emerald'
                            : offer.status === 'pending'
                              ? 'amber'
                              : offer.status === 'rejected'
                                ? 'rose'
                                : 'violet'
                        }
                        className="uppercase"
                      >
                        {offer.status}
                      </Badge>
                      <span className="text-xs font-semibold text-slate-200">
                        Customer: {offer.customerName ?? offer.customerId}
                      </span>
                      <span className="text-xs text-slate-400">• {formatIST(offer.createdAt)}</span>
                    </div>
                    <h2 className="mt-1 text-base font-bold text-white">{offer.productTitle}</h2>
                  </div>

                  <span className="text-xs text-slate-400">
                    Handler:{' '}
                    <strong className="text-violet-300">
                      {offer.handledByName ?? 'Unassigned'}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 rounded-xl bg-midnight-950/90 p-3.5 border border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Listed Snapshot</span>
                    <span className="font-mono text-sm font-semibold text-slate-200">
                      {formatPaiseToINR(offer.listedPricePaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Customer Offered</span>
                    <span className="font-mono text-sm font-bold text-violet-300">
                      {formatPaiseToINR(offer.offeredPricePaise)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Current Counter</span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {offer.counterPricePaise ? formatPaiseToINR(offer.counterPricePaise) : '—'}
                    </span>
                  </div>
                </div>

                {actionable ? (
                  <div className="space-y-3 border-t border-slate-800 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`counter-inr-${offer.id}`}
                          className="block text-[11px] text-slate-400 mb-1"
                        >
                          Counter Price ($)
                        </label>
                        <Input
                          id={`counter-inr-${offer.id}`}
                          placeholder="e.g. 39.50"
                          value={counterInputs[offer.id] ?? ''}
                          onChange={(e) =>
                            setCounterInputs((prev) => ({ ...prev, [offer.id]: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`note-${offer.id}`}
                          className="block text-[11px] text-slate-400 mb-1"
                        >
                          Note to Customer (Shown as John Rambo Support)
                        </label>
                        <Input
                          id={`note-${offer.id}`}
                          placeholder="Optional note..."
                          value={notes[offer.id] ?? ''}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [offer.id]: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="emerald"
                        size="sm"
                        disabled={busyId === offer.id}
                        onClick={() => handleAction(offer, 'accept')}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Accept Offer</span>
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyId === offer.id}
                        onClick={() => handleAction(offer, 'counter')}
                      >
                        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Send Counter</span>
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyId === offer.id}
                        onClick={() => handleAction(offer, 'reject')}
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
