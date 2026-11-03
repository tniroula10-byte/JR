'use client';

/**
 * "Turn on phone notifications" (`components/shared/enable-push-button.tsx`)
 * Subscribes this device to Web Push and registers it with /api/push.
 * On iPhone, Web Push only works after the site is added to the Home Screen.
 */

import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type State = 'unsupported' | 'idle' | 'working' | 'on' | 'blocked' | 'error';

export function EnablePushButton() {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setState('on');
      })
      .catch(() => undefined);
  }, []);

  async function enable() {
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY)
        }));
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON())
      });
      setState(res.ok ? 'on' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="text-xs text-slate-400">
        Phone notifications: on iPhone, add this site to your Home Screen first.
      </p>
    );
  }
  if (state === 'on') {
    return <p className="text-xs text-emerald-300">Phone notifications are on for this device.</p>;
  }
  if (state === 'blocked') {
    return (
      <p className="text-xs text-amber-300">
        Notifications are blocked for this site. Allow them in your browser settings.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={enable} disabled={state === 'working'}>
        <BellRing className="h-4 w-4" aria-hidden="true" />
        <span>{state === 'working' ? 'Turning on…' : 'Turn on phone notifications'}</span>
      </Button>
      {state === 'error' ? <span className="text-xs text-rose-300">Could not turn on. Try again.</span> : null}
    </div>
  );
}
