'use client';

/**
 * Customer Game Top-up Flow (`components/topups/customer-topup-flow.tsx`)
 * Games pop-up -> amount + game username -> payment method (tag shown) -> request sent.
 * The payment tag shown here is resolved again on the server when the request is submitted.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Gamepad2 } from 'lucide-react';
import { getTopupStartAction, submitTopupAction } from '@/actions';
import { Button, Input, Modal } from '@/components/ui/primitives';
import type { Game, PaymentOption, TopupRequest } from '@/lib/data/types';
import { formatPaiseToINR, parseRupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

type Step = 'games' | 'amount' | 'payment' | 'done';

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CustomerTopupButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('games');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [games, setGames] = useState<Game[]>([]);
  const [options, setOptions] = useState<PaymentOption[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  const [game, setGame] = useState<Game | null>(null);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [amountCents, setAmountCents] = useState(0);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [result, setResult] = useState<TopupRequest | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setStep('games');
    setError(null);
    setGame(null);
    setMethodId(null);
    setAmount('');
    setResult(null);
    setRequestId(newRequestId());
    setLoading(true);
    try {
      const res = await getTopupStartAction();
      if (!res.ok) {
        setError(res.error);
      } else {
        setGames(res.data.games);
        setOptions(res.data.paymentOptions);
        setUsernames(res.data.usernames);
      }
    } finally {
      setLoading(false);
    }
  }

  function pickGame(g: Game) {
    setGame(g);
    setUsername(usernames[g.id] ?? '');
    setError(null);
    setStep('amount');
  }

  function confirmAmount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Enter your username for this game.');
      return;
    }
    try {
      setAmountCents(parseRupeesToPaise(amount));
    } catch {
      setError('Enter an amount in dollars, e.g. 25 or 25.50.');
      return;
    }
    setStep('payment');
  }

  async function copyTag(tag: string) {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); the tag is still visible
    }
  }

  async function submit() {
    if (!game || !methodId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await submitTopupAction({
        gameId: game.id,
        gameUsername: username,
        amountCents,
        methodId,
        clientRequestId: requestId
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Could not send your top-up request.');
      } else {
        setResult(res.data);
        setStep('done');
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  const chosen = options.find((o) => o.methodId === methodId) ?? null;
  const title =
    step === 'games'
      ? 'Choose a game'
      : step === 'amount'
        ? `Top up ${game?.name ?? ''}`
        : step === 'payment'
          ? 'Choose how you paid'
          : 'Request sent';

  return (
    <>
      <Button onClick={start} className={className}>
        <Gamepad2 className="h-4 w-4" aria-hidden="true" />
        <span>Games</span>
      </Button>

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        {error ? (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {step === 'games' ? (
          loading ? (
            <p className="text-sm text-slate-400">Loading games…</p>
          ) : games.length === 0 ? (
            <p className="text-sm text-slate-400">No games are available right now.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {games.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pickGame(g)}
                  className="rounded-xl border border-slate-700 bg-midnight-950 px-3 py-4 text-sm font-semibold text-white hover:border-emerald-500 hover:bg-midnight-800"
                >
                  {g.name}
                </button>
              ))}
            </div>
          )
        ) : null}

        {step === 'amount' ? (
          <form onSubmit={confirmAmount} className="space-y-4">
            <div>
              <label htmlFor="topup-username" className="mb-1 block text-xs font-medium text-slate-300">
                Your {game?.name} username
              </label>
              <Input
                id="topup-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username in the game"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="topup-amount" className="mb-1 block text-xs font-medium text-slate-300">
                How much do you want to top up? ($)
              </label>
              <Input
                id="topup-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 25"
              />
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep('games')}>
                Back
              </Button>
              <Button type="submit">Next</Button>
            </div>
          </form>
        ) : null}

        {step === 'payment' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Send <strong className="text-white">{formatPaiseToINR(amountCents)}</strong> using one of
              these, then tap <strong className="text-white">Send request</strong>.
            </p>
            {options.length === 0 ? (
              <p className="text-sm text-slate-400">No payment methods are set up yet. Please message support.</p>
            ) : (
              <div className="space-y-2.5" role="radiogroup" aria-label="Payment method">
                {options.map((o) => (
                  <div
                    key={o.methodId}
                    role="radio"
                    aria-checked={methodId === o.methodId}
                    tabIndex={0}
                    onClick={() => setMethodId(o.methodId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setMethodId(o.methodId);
                      }
                    }}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5',
                      methodId === o.methodId
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-midnight-950 hover:border-slate-500'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">{o.methodName}</p>
                      <p className="truncate font-mono text-base font-bold text-white">{o.tag}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Copy ${o.methodName} tag`}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyTag(o.tag);
                      }}
                    >
                      {copied === o.tag ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep('amount')}>
                Back
              </Button>
              <Button type="button" onClick={submit} disabled={!chosen || loading}>
                {loading ? 'Sending…' : 'Send request'}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'done' && result ? (
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              Request <strong className="text-white">#{result.refNo}</strong> sent:{' '}
              {formatPaiseToINR(result.amountCents)} on {result.gameName} via {result.methodName}.
            </p>
            <p>We&apos;ll load your game as soon as we confirm the payment. You&apos;ll get a message here.</p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
