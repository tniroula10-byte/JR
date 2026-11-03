import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/primitives';

/** Public, readable without signing in. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight-950 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/login" aria-label="Back to sign in">
          <BrandLogo size="md" />
        </Link>
        <article className="space-y-4 text-sm leading-relaxed text-slate-300 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-white [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </article>
        <p className="text-xs text-slate-500">
          <Link href="/privacy" className="underline">Privacy Policy</Link> •{' '}
          <Link href="/terms" className="underline">Terms of Service</Link> •{' '}
          <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
