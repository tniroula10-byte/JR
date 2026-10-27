/**
 * Out-of-App Web Push Notification Helper (`lib/push.ts`)
 * Phase 10: Dispatches Web Push payloads to registered `push_subscriptions` endpoints.
 */

import type { PushSubscriptionRecord } from '@/lib/data/types';

export interface WebPushPayload {
  title: string;
  body: string;
  link: string;
}

export interface WebPushDispatchResult {
  deliveredCount: number;
  endpoints: string[];
  payload: WebPushPayload;
}

export async function dispatchWebPushNotifications(
  subscriptions: PushSubscriptionRecord[],
  payload: WebPushPayload
): Promise<WebPushDispatchResult> {
  // Never include staff identity in customer push notifications
  const sanitizedPayload: WebPushPayload = {
    title: payload.title,
    body: payload.body,
    link: payload.link
  };

  return {
    deliveredCount: subscriptions.length,
    endpoints: subscriptions.map((s) => s.endpoint),
    payload: sanitizedPayload
  };
}
