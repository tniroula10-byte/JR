'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, User, CheckCircle2, AlertTriangle } from 'lucide-react';
import { updateCustomerProfileAction } from '@/actions';
import { Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { Profile } from '@/lib/data/types';
import { formatIST } from '@/lib/time';

export function CustomerProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone ?? '+919811100001');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await updateCustomerProfileAction({ fullName, email, phone });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to update profile.');
      } else {
        setSuccessMsg('Profile updated successfully.');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
          <User className="h-5 w-5 text-violet-400" aria-hidden="true" />
          <span>My Member Profile</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Update your display name, invited email, and E.164 phone number. Role and account status are locked by PostgreSQL triggers.
        </p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-sm font-bold text-white">{profile.fullName}</p>
            <p className="text-xs text-slate-400">Joined {formatIST(profile.createdAt)}</p>
          </div>
          <Badge tone="emerald" className="uppercase">
            {profile.status} • {profile.role}
          </Badge>
        </div>

        {errorMsg ? (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="prof-name" className="block text-xs font-medium text-slate-300 mb-1">
              Full Name
            </label>
            <Input
              id="prof-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prof-email" className="block text-xs font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <Input
              id="prof-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="prof-phone" className="block text-xs font-medium text-slate-300 mb-1">
              Phone Number (E.164 Format)
            </label>
            <Input
              id="prof-phone"
              required
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
