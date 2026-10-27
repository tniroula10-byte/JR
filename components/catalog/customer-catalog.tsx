'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Package, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { submitOfferAction } from '@/actions';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/primitives';
import type { Product } from '@/lib/data/types';
import { formatPaiseToINR, formatPointsQty, parseRupeesToPaise } from '@/lib/money';

export function CustomerCatalogClient({
  products,
  initialProductId
}: {
  products: Product[];
  initialProductId?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    () => products.find((p) => p.id === initialProductId) ?? null
  );
  const [rupeeInput, setRupeeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.gameName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  async function handleOfferSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    let paise: number;
    try {
      paise = parseRupeesToPaise(rupeeInput);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Enter a valid rupee amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitOfferAction({
        productId: selectedProduct.id,
        offeredPricePaise: paise,
        clientMsgId: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Could not submit offer.');
      } else {
        setSuccessMsg(
          `Offer of ${formatPaiseToINR(paise)} submitted! A structured offer card has been posted to your John Rambo Support chat.`
        );
        setRupeeInput('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">Game Points Catalog</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Select any package to submit a custom price offer in Indian Rupees (₹). No online payment is collected.
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

      {/* Selected Product Offer Drawer / Card */}
      {selectedProduct ? (
        <Card className="p-5 border-violet-500/50 bg-gradient-to-br from-violet-950/50 via-midnight-800 to-midnight-900 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="violet">SUBMIT PRICE OFFER</Badge>
                <Badge tone="emerald">{formatPointsQty(selectedProduct.pointsQty)}</Badge>
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-white">{selectedProduct.title}</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Listed Price:{' '}
                <span className="font-mono font-bold text-white">
                  {formatPaiseToINR(selectedProduct.pricePaise)}
                </span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedProduct(null);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
            >
              Close
            </Button>
          </div>

          {errorMsg ? (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {successMsg ? (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          ) : null}

          <form onSubmit={handleOfferSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="offer-rupees-input" className="block text-xs font-medium text-slate-300 mb-1">
                Your Offer in Rupees (₹)
              </label>
              <Input
                id="offer-rupees-input"
                type="text"
                inputMode="decimal"
                required
                placeholder={`e.g. ${Math.round((selectedProduct.pricePaise / 100) * 0.92)}`}
                value={rupeeInput}
                onChange={(e) => setRupeeInput(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                <Coins className="h-4 w-4" aria-hidden="true" />
                <span>{submitting ? 'Submitting...' : 'Submit Offer to Support'}</span>
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching game-point packages"
          description="Try clearing your search filter or check back for new syndicate drops."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((product) => (
            <Card key={product.id} className="p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="violet">{product.gameName}</Badge>
                  <Badge tone="emerald">{formatPointsQty(product.pointsQty)}</Badge>
                </div>
                <h2 className="text-base font-bold text-white">{product.title}</h2>
                <p className="text-xs text-slate-300 leading-relaxed">{product.description}</p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3.5">
                <div>
                  <span className="text-[11px] text-slate-400 block">Listed Price</span>
                  <span className="font-mono text-lg font-extrabold text-white">
                    {formatPaiseToINR(product.pricePaise)}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedProduct(product);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                >
                  <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Negotiate Price (₹)</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
