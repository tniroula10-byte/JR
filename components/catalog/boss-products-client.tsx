'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Save } from 'lucide-react';
import { upsertProductAction } from '@/actions';
import { Badge, Button, Card, Input, Textarea } from '@/components/ui/primitives';
import type { Product, ProductStatus } from '@/lib/data/types';
import { formatPaiseToINR, formatPointsQty, parseRupeesToPaise } from '@/lib/money';

export function BossProductsClient({ products }: { products: Product[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gameName, setGameName] = useState('');
  const [title, setTitle] = useState('');
  const [pointsQty, setPointsQty] = useState('50000');
  const [description, setDescription] = useState('');
  const [rupeePrice, setRupeePrice] = useState('25000');
  const [status, setStatus] = useState<ProductStatus>('available');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function loadProductForEdit(p: Product) {
    setEditingId(p.id);
    setGameName(p.gameName);
    setTitle(p.title);
    setPointsQty(String(p.pointsQty));
    setDescription(p.description);
    setRupeePrice(String(p.pricePaise / 100));
    setStatus(p.status);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    let pricePaise: number;
    try {
      pricePaise = parseRupeesToPaise(rupeePrice);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Invalid rupee price.');
      setSaving(false);
      return;
    }

    try {
      const res = await upsertProductAction({
        id: editingId ?? undefined,
        gameName,
        title,
        pointsQty: Number(pointsQty),
        description,
        pricePaise,
        status
      });
      if (!res.ok) {
        setFeedback(res.error ?? 'Failed to save product.');
      } else {
        setFeedback(
          `${editingId ? 'Updated' : 'Created'} product "${res.data?.title}" (${res.data?.status.toUpperCase()}).`
        );
        setEditingId(null);
        setGameName('');
        setTitle('');
        setDescription('');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <Package className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>Products & Game-Points Catalog Manager</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Manage <code>available</code>, <code>sold_out</code>, and <code>hidden</code> packages. Hidden products are strictly unreachable by customers at the RLS/repository boundary.
        </p>
      </div>

      {feedback ? (
        <div role="status" className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-violet-200">
          {feedback}
        </div>
      ) : null}

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            {editingId ? `Editing Product #${editingId}` : 'Create New Game-Points Package'}
          </h2>
          {editingId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setGameName('');
                setTitle('');
                setDescription('');
              }}
            >
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prod-game" className="block text-xs font-medium text-slate-300 mb-1">
              Game Name
            </label>
            <Input
              id="prod-game"
              required
              placeholder="e.g. Valorant India Vault"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prod-title" className="block text-xs font-medium text-slate-300 mb-1">
              Package Title
            </label>
            <Input
              id="prod-title"
              required
              placeholder="e.g. 50,000 VP Immortal Bundle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prod-pts" className="block text-xs font-medium text-slate-300 mb-1">
              Points Quantity
            </label>
            <Input
              id="prod-pts"
              type="number"
              min="1"
              required
              value={pointsQty}
              onChange={(e) => setPointsQty(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prod-price" className="block text-xs font-medium text-slate-300 mb-1">
              Listed Price in Rupees (₹ — stored as paise)
            </label>
            <Input
              id="prod-price"
              required
              value={rupeePrice}
              onChange={(e) => setRupeePrice(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prod-status" className="block text-xs font-medium text-slate-300 mb-1">
              Visibility Status
            </label>
            <select
              id="prod-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
              className="w-full h-10 rounded-xl bg-midnight-950 border border-slate-700 px-3 text-xs text-slate-100"
            >
              <option value="available">Available (Customer Visible & Offerable)</option>
              <option value="sold_out">Sold Out (Staff Only)</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="prod-desc" className="block text-xs font-medium text-slate-300 mb-1">
              Description
            </label>
            <Textarea
              id="prod-desc"
              rows={2}
              required
              placeholder="Describe delivery terms and UID transfer details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{saving ? 'Saving...' : editingId ? 'Save Product Changes' : 'Add Product'}</span>
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((p) => (
          <Card key={p.id} className="p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge tone="violet">{p.gameName}</Badge>
                <Badge
                  tone={
                    p.status === 'available'
                      ? 'emerald'
                      : p.status === 'sold_out'
                        ? 'amber'
                        : 'rose'
                  }
                  className="uppercase"
                >
                  {p.status}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-white">{p.title}</h3>
              <p className="text-xs text-slate-400">{p.description}</p>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <div>
                <span className="text-xs text-slate-400 block">
                  {formatPointsQty(p.pointsQty)}
                </span>
                <span className="font-mono text-base font-extrabold text-white">
                  {formatPaiseToINR(p.pricePaise)}
                </span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => loadProductForEdit(p)}>
                Edit Status / Price
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
