import React from 'react';
import { Skeleton } from '@/components/ui/primitives';

export default function GlobalLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace content"
      className="mx-auto max-w-7xl space-y-6 p-6"
    >
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
