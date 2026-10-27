import React from 'react';
import { CustomerChatClient } from '@/components/chat/customer-chat';
import { EmptyState } from '@/components/ui/primitives';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerChatPage() {
  const { caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();
  const conv = await repo.getCustomerConversation(caller);

  if (!conv) {
    return (
      <EmptyState
        title="Conversation initializing"
        description="Your support channel is being prepared."
      />
    );
  }

  await repo.markConversationRead(caller, conv.id);
  const messages = await repo.listCustomerMessages(caller, conv.id);

  return <CustomerChatClient conversation={conv} initialMessages={messages} />;
}
