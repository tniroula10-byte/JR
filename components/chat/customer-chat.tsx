'use client';

/**
 * Customer Chat Client (`components/chat/customer-chat.tsx`)
 * Decision 4: Customers ALWAYS see staff messages as "John Rambo Support" (shared name and logo).
 * Zero staff user id, name, email, or avatar is ever received by the client.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Send, RefreshCw } from 'lucide-react';
import { sendCustomerMessageAction } from '@/actions';
import { Badge, BrandLogo, Button, Card, Input } from '@/components/ui/primitives';
import type { Conversation, CustomerMessageView } from '@/lib/data/types';
import { formatPaiseToINR } from '@/lib/money';
import { formatISTTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export function CustomerChatClient({
  conversation,
  initialMessages
}: {
  conversation: Conversation;
  initialMessages: CustomerMessageView[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<CustomerMessageView[]>(initialMessages);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Live Realtime / Polling synchronization for multi-context chat
  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [router]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setErrorMsg(null);
    const clientMsgId = `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await sendCustomerMessageAction({
        conversationId: conversation.id,
        body: body.trim(),
        clientMsgId
      });
      if (!res.ok || !res.data) {
        setErrorMsg(res.error ?? 'Failed to send message.');
      } else {
        setMessages((prev) => [...prev, res.data!]);
        setBody('');
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between border-violet-500/35">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-midnight-950 border border-red-600/40">
            <BrandLogo size="xs" />
          </div>
          <h1 className="text-base font-bold text-white">John Rambo Support</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh chat messages"
          onClick={() => router.refresh()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Card>

      <Card className="flex flex-col h-[540px] overflow-hidden">
        <div
          aria-label="Conversation message history"
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {messages.map((m) => {
            const isCustomer = m.senderKind === 'customer';
            return (
              <div
                key={m.id}
                className={cn(
                  'flex flex-col max-w-[85%] sm:max-w-[75%]',
                  isCustomer ? 'ml-auto items-end' : 'mr-auto items-start'
                )}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-slate-300">
                    {isCustomer ? 'You' : 'John Rambo Support'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {formatISTTime(m.createdAt)}
                  </span>
                </div>

                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed',
                    isCustomer
                      ? 'bg-violet-600 text-white rounded-br-sm shadow-violet-subtle'
                      : 'bg-midnight-900 border border-slate-800 text-slate-100 rounded-bl-sm'
                  )}
                >
                  {m.type === 'offer' && m.offerSnapshot ? (
                    <div className="mb-2 rounded-xl border border-white/15 bg-black/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                          Price Offer Card
                        </span>
                        <Badge tone="amber" className="uppercase text-[10px]">
                          {m.offerSnapshot.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-bold text-white">
                        {m.offerSnapshot.productTitle}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs font-mono">
                        <span>
                          Offered: <strong>{formatPaiseToINR(m.offerSnapshot.offeredPricePaise)}</strong>
                        </span>
                        <span>
                          Listed: {formatPaiseToINR(m.offerSnapshot.listedPricePaise)}
                        </span>
                        {m.offerSnapshot.counterPricePaise ? (
                          <span className="text-amber-300">
                            Counter: <strong>{formatPaiseToINR(m.offerSnapshot.counterPricePaise)}</strong>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <p>{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {errorMsg ? (
          <div className="px-4 py-2 bg-rose-500/15 border-t border-rose-500/30 text-xs text-rose-200">
            {errorMsg}
          </div>
        ) : null}

        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-slate-800/90 bg-midnight-900/90 p-3"
        >
          <label htmlFor="customer-chat-input" className="sr-only">
            Message John Rambo Support
          </label>
          <Input
            id="customer-chat-input"
            placeholder="Message John Rambo Support..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit" disabled={sending || !body.trim()}>
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>Send</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
