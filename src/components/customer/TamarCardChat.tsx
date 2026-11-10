import { useState } from 'react';
import { useAgentChat, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { legacyChatThreadId } from '@blocksdiy/react-common/agent-threads';
import { XIcon } from 'lucide-react';
import { CustomerCardChatAgentChat } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import { useCardAgent } from '@/hooks/useCardAgent';
import { AgentChatSimple } from '@/components/ui/agent-chat';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { capitalizeName, todayISO } from '@/utils/Format';

/**
 * Tamar inside the customer card: a floating bubble (bottom-left in RTL) that opens her chat beside the
 * card, never another page. One conversation per customer and person; every turn carries which customer
 * is on screen and who is talking (האחראית), so "דיברתי איתו, ישלם ב-18" needs no more than that.
 */
export function TamarCardChat({ customerCode, customerName }: { customerCode: string; customerName?: string }) {
  const tamar = useCardAgent();
  const user = useUser();
  const agentChat = useAgentChat(CustomerCardChatAgentChat);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userName = capitalizeName(user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '');
  const threadId = legacyChatThreadId(`customer-card:${customerCode}:${user.id ?? user.email ?? 'me'}`);
  const label = customerName || customerCode;

  const chatContext = {
    screen: 'כרטיס לקוח',
    customerCode,
    customerName: customerName ?? null,
    האחראית: userName || null,
    authorName: userName || null,
    today: todayISO(),
    timeZone: 'Asia/Jerusalem',
  };

  function toggle() {
    setMounted(true);
    setOpen((o) => !o);
  }

  return (
    <>
      {mounted && (
        <section
          role="dialog"
          aria-label={`שיחה עם ${tamar.name} על ${label}`}
          hidden={!open}
          className={cn(
            'glass-menu fixed end-[21px] bottom-[92px] z-40 flex h-[min(640px,calc(100dvh-130px))] w-[min(420px,calc(100vw-42px))] flex-col overflow-hidden rounded-[26px] border shadow-glass-hero',
            !open && 'hidden',
          )}
        >
          <header className="flex items-center gap-[13px] border-b border-glass-edge p-[13px] px-[21px]">
            <AgentAvatar agent="tamar" />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="font-bold">{tamar.name}</span>
              <span className="truncate text-xs text-muted-foreground">מדברת איתך על {label}</span>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="סגירת השיחה" onClick={() => setOpen(false)} className="rounded-full">
              <XIcon />
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <AgentChatSimple
              key={threadId}
              agentChat={agentChat}
              defaultThreadId={threadId}
              size="sm"
              chatContext={chatContext}
              suggestions={['דיברתי איתו, ישלם ב-18 את החודש הוותיק', 'מה המצב של הלקוח?', 'מתי הוא שילם לאחרונה?']}
              className="min-h-0 flex-1"
            />
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? `סגירת השיחה עם ${tamar.name}` : `שיחה עם ${tamar.name} על ${label}`}
        className="glass fixed end-[21px] bottom-[21px] z-40 flex h-14 items-center gap-2 rounded-full border p-1.5 pe-5 shadow-glass-hero transition-shadow duration-150 hover:shadow-glass-card"
      >
        <AgentAvatar agent="tamar" size="lg" />
        <span className="text-sm font-bold text-ink-2">{open ? 'סגירה' : `שאל את ${tamar.name}`}</span>
      </button>
    </>
  );
}