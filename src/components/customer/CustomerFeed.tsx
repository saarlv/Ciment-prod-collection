import { useState } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftIcon, HandCoinsIcon, MailIcon, MessageSquareTextIcon, PhoneIcon, ScaleIcon, SendIcon, UsersIcon } from 'lucide-react';
import { AgentAvatar } from '@/components/AgentPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { useCardAgent } from '@/hooks/useCardAgent';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTIVE_STATUS, PROMISE, commitmentProgress, noteTypeLabel } from '@/utils/AgingMonths';
import type { Customer360 } from '@/utils/CollectionsTypes';
import { formatDate, formatDateTime, formatILS, formatMonth } from '@/utils/Format';

type Filter = 'all' | 'notes' | 'mail' | 'promises' | 'calls';
type Kind = 'note' | 'mail' | 'draft' | 'promise' | 'call' | 'dispute';

const FILTERS: { value: Filter; label: string; kinds: Kind[] }[] = [
  { value: 'all', label: 'הכול', kinds: ['note', 'mail', 'draft', 'promise', 'call', 'dispute'] },
  { value: 'notes', label: 'הערות', kinds: ['note'] },
  { value: 'mail', label: 'מיילים', kinds: ['mail', 'draft'] },
  { value: 'promises', label: 'התחייבויות', kinds: ['promise'] },
  { value: 'calls', label: 'שיחות', kinds: ['call'] },
];

const PAGE = 50;
const CARD_AGENT_SOURCE = 'תמר בכרטיס';

const CALL_ICON: Record<string, LucideIcon> = { שיחה: PhoneIcon, WhatsApp: MessageSquareTextIcon, ישיבה: UsersIcon, דואל: MailIcon };

interface FeedItem {
  key: string;
  anchor: string;
  at: string;
  kind: Kind;
  label: string;
  icon: LucideIcon;
  byAgent?: boolean;
  title: string;
  body?: string;
  meta: string[];
  amount?: number | null;
  status?: string | null;
  href?: string;
}

const time = (v?: string | null) => (v ? Date.parse(v.length <= 10 ? `${v}T12:00:00` : v) || 0 : 0);
const when = (v?: string) => (!v ? '—' : v.length > 10 ? formatDateTime(v) : formatDate(v));
const clean = (xs: (string | null | undefined | false)[]) => xs.filter((x): x is string => !!x);

/** Every note (CustomerNotes — commitments under their own filter), mail, draft, call and dispute of the customer as one list, newest first. */
function buildFeed(data: Customer360, agentName: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const n of data.customerNotes ?? []) {
    const at = n.noteCreatedAt;
    if (!at) continue;
    const byAgent = n.noteSource === CARD_AGENT_SOURCE;
    const commitment = n.noteType === PROMISE;
    const type = noteTypeLabel(n);
    items.push({
      key: `n-${n.id}`,
      anchor: `feed-note-${n.id}`,
      at,
      kind: commitment ? 'promise' : 'note',
      label: clean([type, n.dueMonth && formatMonth(n.dueMonth)]).join(' · '),
      icon: commitment ? HandCoinsIcon : MessageSquareTextIcon,
      byAgent,
      title: n.noteText || type,
      body: commitmentProgress(n, formatILS) ?? undefined,
      meta: clean([
        n.authorName,
        byAgent ? `נרשם דרך ${agentName}` : n.noteSource,
        n.actionDate && `מועד ${formatDate(n.actionDate)}`,
        n.reminderDate && `תזכורת ${formatDate(n.reminderDate)}`,
      ]),
      amount: n.amount,
      status: commitment && n.outcome ? n.outcome : n.status !== ACTIVE_STATUS ? n.status : null,
    });
  }
  for (const m of data.inboundEmails ?? []) {
    if (!m.receivedAt) continue;
    items.push({
      key: `m-${m.id}`,
      anchor: `feed-mail-${m.id}`,
      at: m.receivedAt,
      kind: 'mail',
      label: 'מייל נכנס',
      icon: MailIcon,
      title: m.subject || '(ללא נושא)',
      body: m.agentSummary,
      meta: clean([m.fromName || m.fromAddress, m.category, m.waitingFor]),
      status: m.handlingState ?? m.status,
      href: m.id ? `/collections/inbox?email=${encodeURIComponent(m.id)}` : undefined,
    });
  }
  for (const a of data.approvals ?? []) {
    const at = a.decidedAt && a.status === 'נשלח' ? a.decidedAt : a.draftedAt;
    if (!at) continue;
    items.push({
      key: `a-${a.id}`,
      anchor: `feed-draft-${a.id}`,
      at,
      kind: 'draft',
      label: a.status === 'נשלח' ? `${a.kind ?? 'הודעה'} יוצאת` : `טיוטת ${a.kind ?? 'הודעה'}`,
      icon: SendIcon,
      title: a.subject || a.kind || 'הודעה יוצאת',
      meta: clean([a.recipientName && `אל ${a.recipientName}`, a.draftedBy, a.decidedBy && `החליט/ה ${a.decidedBy}`]),
      status: a.status,
    });
  }
  for (const x of data.interactions ?? []) {
    if (!x.occurredAt) continue;
    items.push({
      key: `x-${x.id}`,
      anchor: `feed-call-${x.id}`,
      at: x.occurredAt,
      kind: 'call',
      label: clean([x.type, x.direction]).join(' · ') || 'אינטראקציה',
      icon: CALL_ICON[x.type ?? ''] ?? PhoneIcon,
      title: x.summary || x.type || 'אינטראקציה',
      meta: clean([x.actorName, x.relatedInvoiceNumbers && `חשבוניות ${x.relatedInvoiceNumbers}`]),
    });
  }
  for (const d of data.disputes ?? []) {
    if (!d.openedAt) continue;
    items.push({
      key: `d-${d.id}`,
      anchor: `feed-dispute-${d.id}`,
      at: d.openedAt,
      kind: 'dispute',
      label: `בירור ${d.disputeType ?? ''}`.trim(),
      icon: ScaleIcon,
      title: d.description || `בירור ${d.disputeNumber ?? ''}`.trim(),
      meta: clean([d.disputeNumber, d.invoiceNumbers && `חשבוניות ${d.invoiceNumbers}`, d.ballWith && `הכדור אצל ${d.ballWith}`]),
      amount: d.disputedAmount,
      status: d.status,
    });
  }
  return items.sort((a, b) => time(b.at) - time(a.at));
}

function FeedRowView({ item, last }: { item: FeedItem; last: boolean }) {
  const Icon = item.icon;
  const title = <span className="text-sm font-semibold break-words">{item.title}</span>;
  return (
    <li id={item.anchor} className="flex scroll-mt-[110px] gap-[13px]">
      <div className="flex flex-col items-center">
        {item.byAgent ? (
          <AgentAvatar agent="tamar" size="sm" className="size-8" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-glass-strong text-ink-2 shadow-glass-pill">
            <Icon className="size-4" />
          </span>
        )}
        {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className="-mt-1 mb-[13px] flex min-w-0 flex-1 flex-col gap-1 rounded-[16px] px-2 py-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-ink-2">{item.label}</span>
          <span>{when(item.at)}</span>
          {item.status && <StatusBadge value={item.status} className="h-5" />}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          {item.href ? (
            <Link to={item.href} className="group inline-flex min-w-0 items-baseline gap-1 text-link hover:underline">
              {title}
              <ArrowLeftIcon className="size-3.5 shrink-0 self-center" />
            </Link>
          ) : (
            title
          )}
          {item.amount !== undefined && item.amount !== null && item.amount !== 0 && (
            <span className="shrink-0 text-sm font-bold tabular-nums">{formatILS(item.amount)}</span>
          )}
        </div>
        {item.body && <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.body}</p>}
        {item.meta.length > 0 && <span className="text-xs text-muted-foreground">{item.meta.join(' · ')}</span>}
      </div>
    </li>
  );
}

/** The customer card's conversation feed: notes and commitments (CustomerNotes), mails, outbound messages, calls and disputes. */
export function CustomerFeed({ data }: { data: Customer360 }) {
  const tamar = useCardAgent();
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);

  const all = buildFeed(data, tamar.name);
  const kinds = FILTERS.find((f) => f.value === filter)!.kinds;
  const items = all.filter((i) => kinds.includes(i.kind));
  const visible = items.slice(0, shown);

  return (
    <section aria-label="פיד שיחות" className="glass glass-lift flex flex-col overflow-hidden rounded-[26px] border">
      <div className="flex flex-wrap items-center justify-between gap-[13px] p-[21px] pb-[13px]">
        <h2 className="text-base font-bold">פיד שיחות</h2>
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as Filter);
            setShown(PAGE);
          }}
        >
          <TabsList className="h-auto gap-0.5 rounded-[22px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="min-h-[30px] flex-none rounded-[15px] px-3 text-[13px] text-ink-2 data-active:font-semibold">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {items.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia>
              <AgentAvatar agent="tamar" />
            </EmptyMedia>
            <EmptyTitle>{filter === 'all' ? 'עוד אין שיחות עם הלקוח' : `אין ${FILTERS.find((f) => f.value === filter)!.label} ללקוח`}</EmptyTitle>
            <EmptyDescription>
              הערות, התחייבויות, מיילים ושיחות יופיעו כאן לפי זמן, החדש למעלה. אפשר לספר ל{tamar.name} מה הלקוח אמר, והיא תרשום.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className="flex flex-col px-[21px] pb-[13px]">
          {visible.map((item, i) => (
            <FeedRowView key={item.key} item={item} last={i === visible.length - 1} />
          ))}
        </ol>
      )}
      {items.length > shown && (
        <div className="flex justify-center px-[21px] pb-[21px]">
          <Button variant="outline" className="rounded-full" onClick={() => setShown((s) => s + PAGE)}>
            הצג עוד ({items.length - shown})
          </Button>
        </div>
      )}
    </section>
  );
}