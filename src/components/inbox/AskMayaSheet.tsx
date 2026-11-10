import { Link } from 'react-router';
import { useAgentChat } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, MailIcon } from 'lucide-react';
import { AskMayaChatAgentChat } from '@/product-types';
import { AgentAvatar } from '@/components/AgentPanel';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { AgentChatSimple } from '@/components/ui/agent-chat';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { todayISO } from '@/utils/Format';

/** What Maya receives about the email the person is looking at — as chatContext, never inside the message. */
export type AskMayaContext = {
  inboundEmailId: string;
  messageId: string | null;
  subject: string | null;
  from: string | null;
  category: string | null;
  verification: string | null;
  customerCode: string | null;
  customerName: string | null;
  draftApprovalId: string | null;
  draftStatus: string | null;
};

const SUGGESTIONS = ['למה סיווגת את המייל כך?', 'על מה מבוסס האימות של השולח?', 'מה כדאי לבדוק לפני שאני מאשרת את הטיוטה?'];

/**
 * "שאל את מאיה" from the email drawer: a plain chat with Maya in a side sheet, opposite the drawer.
 * The email's identifiers travel as chatContext and are shown as a context chip.
 */
export function AskMayaSheet({
  open,
  onOpenChange,
  context,
  chip,
  chatKey,
  suggestions = SUGGESTIONS,
  screen = 'פניות',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AskMayaContext | Record<string, unknown>;
  /** What the context chip says Maya sees; defaults to the email's subject and customer. */
  chip?: string;
  /** Remounts the chat when the subject changes; defaults to the email row id. */
  chatKey?: string;
  suggestions?: string[];
  screen?: string;
}) {
  const agentChat = useAgentChat(AskMayaChatAgentChat);
  const { name, jobTitle } = useInboxAgent();
  const chatContext = { ...context, screen, today: todayISO(), timeZone: 'Asia/Jerusalem' };
  const email = context as Partial<AskMayaContext>;
  const chipText =
    chip ?? `${email.subject || 'מייל ללא נושא'}${email.customerName || email.customerCode ? ` · ${email.customerName || email.customerCode}` : ''}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="glass-menu flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="flex flex-col gap-2 border-b border-glass-edge p-[21px] pe-12">
          <div className="flex items-center gap-[13px]">
            <AgentAvatar size="lg" agent="maya" />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="text-base font-bold">שאל את {name}</SheetTitle>
              <SheetDescription className="text-[13px]">{jobTitle}</SheetDescription>
            </div>
          </div>
          <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-glass-strong px-3 py-1 text-xs font-semibold text-ink-2 shadow-glass-pill">
            <MailIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              {name} רואה: {chipText}
            </span>
          </span>
          <Link
            to="/maya"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline"
          >
            פתיחת {name}
            <ArrowUpLeftIcon className="size-3.5" />
          </Link>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <AgentChatSimple
            key={chatKey ?? String(email.inboundEmailId ?? '')}
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