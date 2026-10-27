import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/primitives';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-midnight-950 p-4">
      <Card className="max-w-md w-full p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/35">
          <WifiOff className="h-6 w-6 text-amber-300" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-white">You Are Currently Offline</h1>
        <p className="text-sm text-slate-400">
          For your security and privacy, John Rambo never caches private chat messages, price offers, or support tickets offline. Reconnect to resume live trading.
        </p>
        <Link
          href="/home"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500"
        >
          Retry Connection
        </Link>
      </Card>
    </div>
  );
}
