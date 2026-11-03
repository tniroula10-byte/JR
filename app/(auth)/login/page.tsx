'use client';

/**
 * Secure Sign-In & Customer OTP Activation Screen (`app/(auth)/login/page.tsx`)
 * - Proper working login with Username or Email + Password; no instant login switcher and no uninvited outsider access.
 * - Boss & Employee passwords are set directly by BOKA (no email OTP for employees).
 * - Customers who verify their email OTP and set a password transition to PENDING_APPROVAL.
 * - Pending and rejected customers cannot log in or open a WebSocket connection.
 * - The "awaiting approval" message is shown ONLY after the correct password is entered,
 *   so the login page never reveals which emails/usernames are registered.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock
} from 'lucide-react';
import {
  loginWithPasswordAction,
  verifyEmailOtpAndSetPasswordAction
} from '@/actions';
import { BrandLogo, Button, Card, Input } from '@/components/ui/primitives';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [mode, setMode] = useState<'login' | 'verify_otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(
    errorParam === 'pending_approval'
      ? 'Your account is awaiting approval. You will receive an email once approved.'
      : null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(
    errorParam === 'account_suspended'
      ? 'This account has been suspended by administration. Access is revoked.'
      : errorParam === 'account_rejected'
        ? 'Unable to sign in with these credentials.'
        : errorParam === 'not_configured'
          ? 'Sign-in is temporarily unavailable. Please contact support.'
          : null
  );

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setPendingNotice(null);

    try {
      const res = await loginWithPasswordAction({ email, password });
      if (!res.ok) {
        if (res.code === 'PENDING_APPROVAL') {
          // Shown ONLY after the correct password is entered
          setPendingNotice(
            res.error ??
              'Your account is awaiting approval. You will receive an email once approved.'
          );
        } else {
          setErrorMsg(res.error ?? 'Invalid username/email or password.');
        }
      } else {
        router.push(res.redirectPath ?? '/home');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtpAndSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setPendingNotice(null);

    try {
      const res = await verifyEmailOtpAndSetPasswordAction({
        email,
        otpCode,
        password,
        fullName
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Could not verify OTP.');
      } else {
        setStatusMsg(
          res.message ??
            'Email OTP verified and password set. Your account is now PENDING APPROVAL.'
        );
        setOtpCode('');
        setMode('login');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-midnight-950">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <h1>
            <BrandLogo size="lg" />
          </h1>
        </div>

        <Card className="p-6 space-y-5">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-midnight-950 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setStatusMsg(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'login'
                  ? 'bg-violet-600 text-white shadow-violet-subtle'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('verify_otp');
                setErrorMsg(null);
                setPendingNotice(null);
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition ${
                mode === 'verify_otp'
                  ? 'bg-violet-600 text-white shadow-violet-subtle'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Customer OTP Setup
            </button>
          </div>

          {pendingNotice ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200"
            >
              <Clock className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span>{pendingNotice}</span>
            </div>
          ) : null}

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

          {mode === 'login' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Username or Email
                </label>
                <Input
                  id="email-input"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="Enter username or email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="password-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <Input
                  id="password-input"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtpAndSetPassword} className="space-y-4">
              <div>
                <label htmlFor="otp-fullname-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <Input
                  id="otp-fullname-input"
                  type="text"
                  placeholder="Your display name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="otp-email-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Invited Customer Email Address
                </label>
                <Input
                  id="otp-email-input"
                  type="email"
                  required
                  placeholder="you@johnrambo.us"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="otp-code-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email OTP Code
                </label>
                <Input
                  id="otp-code-input"
                  type="text"
                  required
                  placeholder="6-digit OTP code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="otp-pwd-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Set Account Password (8+ chars: Upper, Lower, Number & Symbol)
                </label>
                <Input
                  id="otp-pwd-input"
                  type="password"
                  required
                  minLength={8}
                  placeholder="e.g. Abcd123@"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>
                  {submitting ? 'Verifying...' : 'Verify OTP & Request Approval'}
                </span>
              </Button>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-slate-500">
          <Link href="/privacy" className="underline">Privacy Policy</Link> •{' '}
          <Link href="/terms" className="underline">Terms of Service</Link>
        </p>
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
