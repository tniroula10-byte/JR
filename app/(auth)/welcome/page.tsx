import Link from 'next/link';
import { Shield, CheckCircle2 } from 'lucide-react';
import { Card, Badge } from '@/components/ui/primitives';

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-midnight-950 p-4">
      <Card className="max-w-md w-full p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/40">
          <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden="true" />
        </div>
        <Badge tone="emerald">INVITATION VERIFIED</Badge>
        <h1 className="text-xl font-bold text-white">Welcome to John Rambo</h1>
        <p className="text-sm text-slate-400">
          Your account is verified.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-violet-glow hover:bg-violet-500"
        >
          <Shield className="h-4 w-4" aria-hidden="true" />
          <span>Enter Workspace</span>
        </Link>
      </Card>
    </div>
  );
}
