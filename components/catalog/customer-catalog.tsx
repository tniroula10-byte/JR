'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Search } from 'lucide-react';
import { Badge, Card, EmptyState, Input } from '@/components/ui/primitives';
import type { Product } from '@/lib/data/types';
import { formatPaiseToINR, formatPointsQty } from '@/lib/money';

export function CustomerCatalogClient({
  products
}: {
  products: Product[];
  initialProductId?: string;
}) {
  const [search, setSearch] = useState('');

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.gameName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white">Game Points Catalog</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Browse verified game-point packages in US Dollars ($). Message Support to order.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            aria-label="Search game points catalog"
            placeholder="Search game or package..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching game-point packages"
          description="Try clearing your search filter or check back for new drops."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((product) => (
            <Card key={product.id} className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="emerald">{product.gameName}</Badge>
                  <Badge tone="cyan">{formatPointsQty(product.pointsQty)}</Badge>
                </div>
                <h3 className="text-base font-bold text-white">{product.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{product.description}</p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3.5">
                <div>
                  <span className="text-[11px] text-slate-400 block">Price (USD)</span>
                  <span className="font-mono text-lg font-extrabold text-white">
                    {formatPaiseToINR(product.pricePaise)}
                  </span>
                </div>
                <Link
                  href="/chat"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-violet-glow hover:bg-violet-500"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Message Support</span>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
