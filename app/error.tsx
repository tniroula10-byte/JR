'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui/primitives';

export default function GlobalErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 text-center space-y-4 border-rose-500/40">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/35">
          <AlertTriangle className="h-6 w-6 text-rose-300" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-white">Something Went Wrong</h2>
        <p className="text-xs text-slate-300">
          {error.message || 'An unexpected error occurred while loading this view.'}
        </p>
        <Button onClick={reset} className="w-full">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Retry View</span>
        </Button>
      </Card>
    </div>
  );
}
