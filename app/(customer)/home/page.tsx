import React from 'react';
import { CustomerHomeClient } from '@/components/shared/customer-home-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerHomePage() {
  const { profile, caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();

  const [stories, announcements, products, conv, notifications] =
    await Promise.all([
      repo.listStories(caller),
      repo.listCustomerAnnouncements(caller),
      repo.listProducts(caller),
      repo.getCustomerConversation(caller),
      repo.listNotifications(caller)
    ]);

  const initialMessages = conv
    ? await repo.listCustomerMessages(caller, conv.id)
    : [];

  return (
    <CustomerHomeClient
      profile={profile}
      stories={stories}
      announcements={announcements}
      products={products}
      conversation={conv}
      initialMessages={initialMessages}
      notifications={notifications}
    />
  );
}
