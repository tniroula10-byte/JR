'use client';

/**
 * Staff Game Top-ups (`components/topups/staff-topups.tsx`)
 * Requests queue (Loaded / Payment not received), games (max 11 active),
 * payment methods & tags (max 3 active methods), and the Boss-only tag rule.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, XCircle } from 'lucide-react';
import {
  setCustomerPaymentTagAction,
  updateTopupSettingsAction,
  updateTopupStatusAction,
  upsertGameAction,
  upsertPaymentMethodAction,
  upsertPaymentTagAction
} from '@/actions';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import { TOPUP_STATUS_LABEL, TOPUP_STATUS_TONE } from '@/components/topups/customer-topups';
import type { AppSettings, Game, PaymentMethod, Profile, TopupRequest } from '@/lib/data/types';
import { formatPaiseToINR } from '@/lib/money';
import { formatIST } from '@/lib/time';
import { cn } from '@/lib/utils';

type Tab = 'requests' | 'games' | 'tags' | 'settings';

export function StaffTopupsClient({
  callerRole,
  topups,
  games,
  paymentMethods,
  settings,
  customers
}: {
  callerRole: 'boss' | 'employee';
  topups: TopupRequest[];
  games: Game[];
  paymentMethods: PaymentMethod[];
  settings: AppSettings;
  customers: Profile[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('requests');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await action();
      setMessage(res.ok ? { ok: true, text: success } : { ok: false, text: res.error ?? 'Something went wrong.' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const waitingCount = topups.filter((t) => t.status === 'waiting').length;
  const tabs: Array<[Tab, string]> = [
    ['requests', `Requests (${waitingCount} waiting)`],
    ['games', `Games (${games.filter((g) => g.active).length}/11)`],
    ['tags', 'Payment tags'],
    ...(callerRole === 'boss' ? ([['settings', 'Tag rule']] as Array<[Tab, string]>) : [])
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white">Game Top-ups</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Load the game, then mark the request so the customer is notified.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            size="sm"
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => {
              setTab(key);
              setMessage(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {message ? (
        <div
          role={message.ok ? 'status' : 'alert'}
          className={cn(
            'rounded-xl border p-3 text-xs',
            message.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
          )}
        >
          {message.text}
        </div>
      ) : null}

      {tab === 'requests' ? <RequestsTab topups={topups} busy={busy} run={run} /> : null}
      {tab === 'games' ? <GamesTab games={games} busy={busy} run={run} /> : null}
      {tab === 'tags' ? (
        <TagsTab
          methods={paymentMethods}
          customers={customers}
          settings={settings}
          busy={busy}
          run={run}
        />
      ) : null}
      {tab === 'settings' && callerRole === 'boss' ? (
        <SettingsTab settings={settings} busy={busy} run={run} />
      ) : null}
    </div>
  );
}

type Runner = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => Promise<void>;

function RequestsTab({ topups, busy, run }: { topups: TopupRequest[]; busy: boolean; run: Runner }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (topups.length === 0) {
    return <EmptyState title="No top-up requests yet" description="New requests also arrive as unread chat messages." />;
  }
  const ordered = [...topups].sort((a, b) =>
    a.status === b.status ? 0 : a.status === 'waiting' ? -1 : b.status === 'waiting' ? 1 : 0
  );
  return (
    <div className="space-y-3">
      {ordered.map((t) => (
        <Card key={t.id} className="p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-violet-300">
              #{t.refNo} • {formatIST(t.createdAt)}
            </span>
            <Badge tone={TOPUP_STATUS_TONE[t.status]}>{TOPUP_STATUS_LABEL[t.status]}</Badge>
          </div>
          <p className="text-base font-bold text-white">
            {formatPaiseToINR(t.amountCents)} on {t.gameName}
          </p>
          <div className="grid grid-cols-1 gap-1 text-xs text-slate-300 sm:grid-cols-2">
            <span>
              Customer: <strong className="text-white">{t.customerName ?? '—'}</strong>
            </span>
            <span>
              Game username: <strong className="font-mono text-white">{t.gameUsername}</strong>
            </span>
            <span>
              Paid via: <strong className="text-white">{t.methodName}</strong> to{' '}
              <span className="font-mono">{t.tag}</span>
            </span>
            {t.handledByName ? <span>Handled by: {t.handledByName}</span> : null}
          </div>
          {t.staffNote ? <p className="text-xs text-slate-400">Note: {t.staffNote}</p> : null}

          {t.status === 'waiting' ? (
            <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center">
              <label htmlFor={`topup-note-${t.id}`} className="sr-only">
                Note to customer
              </label>
              <Input
                id={`topup-note-${t.id}`}
                placeholder="Optional note to customer"
                value={notes[t.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="emerald"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => updateTopupStatusAction({ topupId: t.id, status: 'loaded', note: notes[t.id] }),
                      `#${t.refNo} marked Loaded. The customer was notified.`
                    )
                  }
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Loaded</span>
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => updateTopupStatusAction({ topupId: t.id, status: 'not_received', note: notes[t.id] }),
                      `#${t.refNo} marked Payment not received. The customer was notified.`
                    )
                  }
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Payment not received</span>
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function GamesTab({ games, busy, run }: { games: Game[]; busy: boolean; run: Runner }) {
  const [newName, setNewName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const activeCount = games.filter((g) => g.active).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            run(
              () => upsertGameAction({ name, active: activeCount < 11, sortOrder: games.length + 1 }),
              activeCount < 11 ? `Added ${name}.` : `Added ${name} (turned off: 11 games are already on).`
            ).then(() => setNewName(''));
          }}
        >
          <label htmlFor="new-game-name" className="sr-only">
            New game name
          </label>
          <Input
            id="new-game-name"
            placeholder="New game name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add game</span>
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Customers see up to 11 games that are turned on.</p>
      </Card>

      <div className="space-y-2">
        {games.map((g) => (
          <Card key={g.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <label htmlFor={`game-name-${g.id}`} className="sr-only">
              Game name
            </label>
            <Input
              id={`game-name-${g.id}`}
              value={names[g.id] ?? g.name}
              onChange={(e) => setNames((n) => ({ ...n, [g.id]: e.target.value }))}
            />
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={g.active ? 'emerald' : 'slate'}>{g.active ? 'On' : 'Off'}</Badge>
              {names[g.id] !== undefined && names[g.id] !== g.name ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => upsertGameAction({ id: g.id, name: names[g.id]!, active: g.active, sortOrder: g.sortOrder }),
                      'Game renamed.'
                    )
                  }
                >
                  Save
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => upsertGameAction({ id: g.id, name: g.name, active: !g.active, sortOrder: g.sortOrder }),
                    g.active ? `${g.name} turned off.` : `${g.name} turned on.`
                  )
                }
              >
                {g.active ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TagsTab({
  methods,
  customers,
  settings,
  busy,
  run
}: {
  methods: PaymentMethod[];
  customers: Profile[];
  settings: AppSettings;
  busy: boolean;
  run: Runner;
}) {
  const [newMethod, setNewMethod] = useState('');
  const [newTags, setNewTags] = useState<Record<string, string>>({});
  const [assign, setAssign] = useState({ customerId: '', methodId: '', tagId: '' });
  const activeMethods = methods.filter((m) => m.active).length;
  const assignMethod = methods.find((m) => m.id === assign.methodId);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        {settings.paymentTagMode === 'rotate'
          ? `Rule: everyone sees the "Current" tag; it moves to the next tag after every ${settings.paymentTagRotateEvery} deposits.`
          : 'Rule: each customer keeps the same tag per method until you change it below.'}
      </p>

      {methods.map((m) => (
        <Card key={m.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-white">{m.name}</h3>
            <div className="flex items-center gap-2">
              <Badge tone={m.active ? 'emerald' : 'slate'}>{m.active ? 'Shown to customers' : 'Hidden'}</Badge>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => upsertPaymentMethodAction({ id: m.id, name: m.name, active: !m.active, sortOrder: m.sortOrder }),
                    m.active ? `${m.name} hidden.` : `${m.name} shown.`
                  )
                }
              >
                {m.active ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {m.tags.length === 0 ? <p className="text-xs text-slate-400">No tags yet.</p> : null}
            {m.tags.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-midnight-950 px-3 py-2"
              >
                <span className="font-mono text-sm text-white">{t.tag}</span>
                <div className="flex items-center gap-2">
                  {settings.paymentTagMode === 'rotate' && t.isCurrent ? <Badge tone="violet">Current</Badge> : null}
                  <span className="text-[11px] text-slate-400">{t.depositCount} deposits</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          upsertPaymentTagAction({
                            id: t.id,
                            methodId: m.id,
                            tag: t.tag,
                            active: !t.active,
                            sortOrder: t.sortOrder
                          }),
                        t.active ? `${t.tag} turned off.` : `${t.tag} turned on.`
                      )
                    }
                  >
                    {t.active ? 'Turn off' : 'Turn on'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const tag = (newTags[m.id] ?? '').trim();
              if (!tag) return;
              run(
                () => upsertPaymentTagAction({ methodId: m.id, tag, active: true, sortOrder: m.tags.length + 1 }),
                `Added ${tag}.`
              ).then(() => setNewTags((n) => ({ ...n, [m.id]: '' })));
            }}
          >
            <label htmlFor={`new-tag-${m.id}`} className="sr-only">
              New tag for {m.name}
            </label>
            <Input
              id={`new-tag-${m.id}`}
              placeholder={`New ${m.name} tag`}
              value={newTags[m.id] ?? ''}
              onChange={(e) => setNewTags((n) => ({ ...n, [m.id]: e.target.value }))}
            />
            <Button type="submit" size="sm" disabled={busy || !(newTags[m.id] ?? '').trim()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add tag</span>
            </Button>
          </form>
        </Card>
      ))}

      <Card className="p-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newMethod.trim();
            if (!name) return;
            run(
              () => upsertPaymentMethodAction({ name, active: activeMethods < 3, sortOrder: methods.length + 1 }),
              activeMethods < 3 ? `Added ${name}.` : `Added ${name} (hidden: 3 methods are already shown).`
            ).then(() => setNewMethod(''));
          }}
        >
          <label htmlFor="new-method-name" className="sr-only">
            New payment method
          </label>
          <Input
            id="new-method-name"
            placeholder="New payment method (e.g. Cash App)"
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
          />
          <Button type="submit" disabled={busy || !newMethod.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add method</span>
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Customers see up to 3 payment methods.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-bold text-white">Give a customer a specific tag</h3>
        <p className="text-xs text-slate-400">Used when the rule is &ldquo;same tag per customer&rdquo;.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label="Customer"
            value={assign.customerId}
            onChange={(e) => setAssign((a) => ({ ...a, customerId: e.target.value }))}
            className="h-10 rounded-xl border border-slate-700 bg-midnight-950 px-3 text-xs text-slate-100"
          >
            <option value="">Customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({c.email})
              </option>
            ))}
          </select>
          <select
            aria-label="Payment method"
            value={assign.methodId}
            onChange={(e) => setAssign((a) => ({ ...a, methodId: e.target.value, tagId: '' }))}
            className="h-10 rounded-xl border border-slate-700 bg-midnight-950 px-3 text-xs text-slate-100"
          >
            <option value="">Method…</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Tag"
            value={assign.tagId}
            onChange={(e) => setAssign((a) => ({ ...a, tagId: e.target.value }))}
            className="h-10 rounded-xl border border-slate-700 bg-midnight-950 px-3 text-xs text-slate-100"
          >
            <option value="">Tag…</option>
            {(assignMethod?.tags ?? [])
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tag}
                </option>
              ))}
          </select>
        </div>
        <Button
          size="sm"
          disabled={busy || !assign.customerId || !assign.methodId || !assign.tagId}
          onClick={() => run(() => setCustomerPaymentTagAction(assign), 'Tag assigned to the customer.')}
        >
          Assign tag
        </Button>
      </Card>
    </div>
  );
}

function SettingsTab({ settings, busy, run }: { settings: AppSettings; busy: boolean; run: Runner }) {
  const [mode, setMode] = useState(settings.paymentTagMode);
  const [every, setEvery] = useState(String(settings.paymentTagRotateEvery));

  return (
    <Card className="space-y-4 p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-white">Which tag do customers see?</legend>
        <label className="flex items-start gap-2.5 text-sm text-slate-200">
          <input type="radio" name="tag-mode" checked={mode === 'rotate'} onChange={() => setMode('rotate')} className="mt-1" />
          <span>Rotate: everyone sees the same tag, and it changes to the next tag after a number of deposits.</span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-slate-200">
          <input type="radio" name="tag-mode" checked={mode === 'sticky'} onChange={() => setMode('sticky')} className="mt-1" />
          <span>Same tag per customer: each customer keeps their tag until staff change it.</span>
        </label>
      </fieldset>
      {mode === 'rotate' ? (
        <div className="max-w-xs">
          <label htmlFor="rotate-every" className="mb-1 block text-xs font-medium text-slate-300">
            Change tag after this many deposits
          </label>
          <Input id="rotate-every" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} />
        </div>
      ) : null}
      <Button
        disabled={busy}
        onClick={() =>
          run(
            () =>
              updateTopupSettingsAction({
                paymentTagMode: mode,
                paymentTagRotateEvery: Number.parseInt(every, 10) || 5
              }),
            'Tag rule saved.'
          )
        }
      >
        Save rule
      </Button>
    </Card>
  );
}
