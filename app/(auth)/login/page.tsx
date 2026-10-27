'use client';

/**
 * Invitation-Only Passwordless Sign-In Screen (`app/(auth)/login/page.tsx`)
 * Decision 1: Supabase email magic links only, public sign-up disabled, `shouldCreateUser: false`.
 */

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, Shield, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requestMagicLinkAction, switchMockPersonaAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';

const QUICK_PERSONAS = [
  {
    id: 'cust-1',
    role: 'Customer',
    name: 'Aarav Mehta',
    email: 'aarav.mehta@gamer.in',
    redirect: '/home',
    tone: 'violet' as const
  },
  {
    id: 'cust-2',
    role: 'Customer',
    name: 'Kabir Sharma',
    email: 'kabir.sharma@gamer.in',
    redirect: '/home',
    tone: 'violet' as const
  },
  {
    id: 'emp-1',
    role: 'Employee (Maverick)',
    name: 'Vikram Singh',
    email: 'vikram@johnrambo.in',
    redirect: '/employee/dashboard',
    tone: 'cyan' as const
  },
  {
    id: 'emp-2',
    role: 'Employee (Valkyrie)',
    name: 'Ananya Deshmukh',
    email: 'ananya@johnrambo.in',
    redirect: '/employee/dashboard',
    tone: 'cyan' as const
  },
  {
    id: 'boss-1',
    role: 'Boss (Super Admin)',
    name: 'Col. Rajesh Rathore',
    email: 'boss@johnrambo.in',
    redirect: '/boss/dashboard',
    tone: 'amber' as const
  }
];

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    errorParam === 'account_suspended'
      ? 'This account has been suspended by administration. Access is revoked.'
      : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await requestMagicLinkAction({ email });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Unable to send magic link.');
      } else {
        setStatusMsg(res.message ?? 'If invited, a sign-in link has been sent.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickPersona(personaId: string, redirectPath: string) {
    setSubmitting(true);
    try {
      await switchMockPersonaAction(personaId);
      router.push(redirectPath);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-midnight-950">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20 border border-violet-500/40 shadow-violet-glow">
            <Shield className="h-7 w-7 text-violet-300" aria-hidden="true" />
          </div>
          <Badge tone="violet" className="mt-4">
            INVITATION-ONLY EXCHANGE
          </Badge>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            John Rambo
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Private virtual game-points catalog & real-time price negotiation.
          </p>
        </div>

        <Card className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-xs font-medium text-violet-300">
            <Lock className="h-4 w-4" aria-hidden="true" />
            <span>Passwordless Magic-Link Sign In (No Public Sign-Up)</span>
          </div>

          {errorMsg ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {statusMsg ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{statusMsg}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Invited Email Address
              </label>
              <Input
                id="email-input"
                type="email"
                required
                placeholder="you@gamer.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>{submitting ? 'Sending Magic Link...' : 'Send Magic Sign-In Link'}</span>
            </Button>
          </form>

          <p className="text-[11px] text-slate-400 text-center">
            Uninvited emails are automatically rejected (<code className="text-slate-300">shouldCreateUser: false</code>).
          </p>
        </Card>

        {/* Mock Adapter Interactive Persona Selector */}
        <Card className="p-5 space-y-3 border-violet-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Sparkles className="h-4 w-4 text-violet-400" aria-hidden="true" />
              <span>Instant Role Session Switcher (Mock Adapter)</span>
            </div>
            <Badge tone="emerald">20 Accounts Seeded</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Select any seeded persona to launch directly into that role’s workspace:
          </p>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={submitting}
                onClick={() => handleQuickPersona(p.id, p.redirect)}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-midnight-900/90 px-3.5 py-2.5 text-left text-xs transition hover:border-violet-500/50 hover:bg-midnight-700"
              >
                <div>
                  <p className="font-semibold text-slate-100">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{p.email}</p>
                </div>
                <Badge tone={p.tone}>{p.role}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-midnight-950" />}>
      <LoginContent />
    </React.Suspense>
  );
}
