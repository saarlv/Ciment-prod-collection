import { useContext, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon } from 'lucide-react';
import { AskNinaChatAgentChat } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import type { AgentPersona } from '@/components/AgentPanel';
import { useCollectionsAgent } from '@/hooks/useCollectionsAgent';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { AgentChatSimple } from '@/components/ui/agent-chat';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AskNinaContext, isReceiptsPath, screenNameOf } from '@/utils/AskNina';
import { todayISO } from '@/utils/Format';

const NINA_SUGGESTIONS = ['מה מצב הבדיקות של שורות הבנק היום?', 'למה הרשומה הזו לא זוהתה?', 'אילו רשומות מחכות לאישור?'];

type AgentChatHandle = ReturnType<typeof useAgentChat>;

/**
 * The sheet itself: a plain chat with the screen's agent. What the person is looking at (screen,
 * mine/all scope, bookkeeper, today, customer, and on receipts the bank file and record) travels as
 * chatContext, never inside the message.
 */
function AskSheet({
  agentChat,
  persona,
  name,
  jobTitle,
  home,
  suggestions,
}: {
  agentChat: AgentChatHandle;
  persona: AgentPersona;
  name: string;
  jobTitle: string;
  home: string;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const scope = useOwnerScope();
  const focus = useContext(AskNinaContext)?.focus ?? null;
  const { pathname } = useLocation();
  const screen = screenNameOf(pathname);
  const scopeLabel = scope.mode === 'mine' ? 'שלי' : 'של כולם';

  const chatContext = {
    screen,
    route: pathname,
    scope: scopeLabel,
    bookkeeperName: scope.mode === 'mine' ? scope.myName : null,
    today: todayISO(),
    timeZone: 'Asia/Jerusalem',
    customerCode: focus?.customerCode ?? null,
    customerName: focus?.customerName ?? null,
    importBatchId: focus?.importBatchId ?? null,
    bankLineId: focus?.bankLineId ?? null,
  };
  const focusLabel = focus?.customerName || focus?.customerCode || (focus?.bankLineId ? 'הרשומה שעל המסך' : '');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" className="h-10 gap-2 rounded-[20px] bg-glass-card px-3 text-[13px] font-semibold text-ink-2 hover:bg-glass-inner" />
        }
      >
        <AgentAvatar size="sm" agent={persona} className="size-6" />
        שאל את {name}
      </SheetTrigger>
      <SheetContent side="left" className="glass-menu flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="flex flex-col gap-2 border-b border-glass-edge p-[21px] pe-12">
          <div className="flex items-center gap-[13px]">
            <AgentAvatar size="lg" agent={persona} />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="text-base font-bold">שאל את {name}</SheetTitle>
              <SheetDescription className="text-[13px]">{jobTitle}</SheetDescription>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {name} רואה את המסך שלך: {screen} · {scopeLabel}
            {scope.mode === 'mine' && scope.myName ? ` (${scope.myName})` : ''}
            {focusLabel ? ` · ${focusLabel}` : ''}
          </p>
          <Link
            to={home}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline"
          >
            פתיחת {name}
            <ArrowUpLeftIcon className="size-3.5" />
          </Link>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AgentChatSimple
            agentChat={agentChat}
            size="sm"
            chatContext={chatContext}
            suggestions={suggestions}
            className="min-h-0 flex-1"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AskNina() {
  const agentChat = useAgentChat(AskNinaChatAgentChat);
  const { name, jobTitle } = useCollectionsAgent();
  return <AskSheet agentChat={agentChat} persona="nina" name={name} jobTitle={jobTitle} home="/nina" suggestions={NINA_SUGGESTIONS} />;
}

/** "שאל את…" in the top bar: Nina, on the receipts screen only; every other screen shows nothing here. */
export function AskAgentSheet() {
  const { pathname } = useLocation();
  return isReceiptsPath(pathname) ? <AskNina /> : null;
}