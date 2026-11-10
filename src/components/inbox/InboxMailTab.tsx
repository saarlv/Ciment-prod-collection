import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CornerDownLeftIcon, XIcon } from 'lucide-react';
import { InboundEmailsEntity, InboxSlaEntity, MailboxesEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { CustomerPicker } from '@/components/inbox/CustomerPicker';
import { HandlingButtons } from '@/components/inbox/HandlingControls';
import { SlaRing } from '@/components/inbox/SlaRing';
import { useInboxAgent } from '@/hooks/useInboxAgent';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDateTime, formatNumber, israelDayStartISO, todayISO } from '@/utils/Format';
import {
  FOLDERS,
  HANDLED,
  IRRELEVANT_CATEGORY,
  NOT_HANDLED,
  WAITING,
  foldersOf,
  handlingOf,
  handlingTone,
  isFolderKey,
  slaOf,
  typesOf,
  verificationTone,
} from '@/utils/Inbox';
import type { FolderKey, InboundEmail } from '@/utils/Inbox';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const PAGE = 200;
const ALL = 'all';
const OPEN = 'open';

const STATE_ITEMS = [
  { value: OPEN, label: 'לא טופל + ממתין' },
  { value: NOT_HANDLED, label: NOT_HANDLED },
  { value: WAITING, label: WAITING },
  { value: HANDLED, label: HANDLED },
  { value: ALL, label: 'כל המצבים' },
];

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : `${formatNumber(n)} ${many}`;
}

function FilterSelect({
  id,
  label,
  value,
  items,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field className="w-auto min-w-44">
      <FieldLabel htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </FieldLabel>
      <Select items={items} value={value} onValueChange={(v) => onChange((v as string | null) ?? ALL)}>
        <SelectTrigger id={id} size="sm" className="w-full bg-glass-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function MailRow({
  e,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  e: InboundEmail;
  now: number;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}) {
  const state = handlingOf(e);
  const types = typesOf(e);
  return (
    <TableRow
      tabIndex={0}
      data-state={selected ? 'selected' : undefined}
      className="cursor-pointer hover:bg-glass-faint focus-visible:bg-glass-faint focus-visible:outline-none"
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="ps-[21px] align-top" onClick={(ev) => ev.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`בחירת המייל ${e.subject ?? ''}`} />
      </TableCell>
      <TableCell className="align-top">
        <SlaRing sla={slaOf(e, now)} dueAt={e.dueAt} showLabel={false} />
      </TableCell>
      <TableCell className="max-w-64 align-top whitespace-normal">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-semibold">
            {(e.isThreadReply || e.threadOf) && (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex text-muted-foreground" />} aria-label="תשובה בשרשור">
                  <CornerDownLeftIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>תשובה בשרשור קיים</TooltipContent>
              </Tooltip>
            )}
            <span className="truncate">{e.fromName || e.fromAddress || '—'}</span>
          </span>
          <span className="text-xs text-muted-foreground">{e.senderRole || <span dir="ltr">{e.fromAddress}</span>}</span>
          <span className="truncate text-xs text-ink-2">{e.subject || 'ללא נושא'}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{formatDateTime(e.receivedAt)}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-44 align-top whitespace-normal" onClick={(ev) => ev.stopPropagation()}>
        {e.customerCode ? <CustomerLink code={e.customerCode} name={e.customerName} className="text-[13px]" /> : <span className="text-xs text-muted-foreground">לא זוהה</span>}
      </TableCell>
      <TableCell className="align-top">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <span className="inline-flex flex-wrap items-center gap-1">
              <StatusBadge value={e.senderVerification ?? 'לא נבדק'} tone={verificationTone(e.senderVerification)} />
              {e.identifiedBy === 'חתימה' && <StatusBadge value="חתימה" tone="neutral" />}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{e.verificationBasis || 'אין פירוט לאימות'}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="max-w-48 align-top whitespace-normal">
        <div className="flex flex-wrap gap-1">
          {types.length ? (
            types.map((t) => <StatusBadge key={t} value={t} tone={t === IRRELEVANT_CATEGORY ? 'neutral' : 'active'} />)
          ) : (
            <span className="text-xs text-muted-foreground">עוד לא מוין</span>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-80 align-top whitespace-normal">
        <p className="line-clamp-2 text-[13px] text-ink-2">{e.agentSummary || '—'}</p>
      </TableCell>
      <TableCell className="pe-[21px] align-top whitespace-normal">
        <div className="flex flex-col gap-0.5">
          <StatusBadge value={state} tone={handlingTone(state)} className="self-start" />
          {state === WAITING && e.waitingFor && <span className="text-xs text-warning-ink">{e.waitingFor}</span>}
          {state === HANDLED && e.handledBy && <span className="text-xs text-muted-foreground">{e.handledBy}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Tab "דואר נכנס": the folder strip, filters, the mails with their 24-hour ring, and bulk handling. */
export function InboxMailTab({ now, onOpen }: { now: number; onOpen: (id: string) => void }) {
  const scope = useOwnerScope();
  const maya = useInboxAgent();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const folderParam = params.get('folder');
  const folder: FolderKey = isFolderKey(folderParam) ? folderParam : 'all';
  const stateFilter = params.get('state') ?? OPEN;
  const mailbox = params.get('mailbox') ?? ALL;
  const bookkeeper = params.get('bookkeeper') ?? ALL;
  const customer = params.get('customer');

  function setParam(key: string, value: string | null, fallback?: string) {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setSelected(new Set());
  }

  const emails = useEntityGetAll(InboundEmailsEntity, { orderBy: [{ column: 'receivedAt', direction: 'desc' }], page: { size: PAGE } });
  const mailboxes = useEntityGetAll(MailboxesEntity);
  const sla = useEntityGetAll(InboxSlaEntity);

  const all = (emails.data ?? []) as InboundEmail[];
  const mailboxRows = mailboxes.data ?? [];
  const mailboxAddress = mailboxRows.find((m) => m.id === mailbox)?.address;

  // Filters other than state and folder: the folder badges count within these.
  const base = all.filter(
    (e) =>
      scope.isVisible(e.customerCode, e.assignedBookkeeperName) &&
      (mailbox === ALL || e.mailboxId === mailbox || (!e.mailboxId && !!mailboxAddress && e.mailbox === mailboxAddress)) &&
      (bookkeeper === ALL || e.assignedBookkeeperName === bookkeeper) &&
      (!customer || e.customerCode === customer),
  );
  const inState = (e: InboundEmail) => {
    const s = handlingOf(e);
    return stateFilter === ALL ? true : stateFilter === OPEN ? s !== HANDLED : s === stateFilter;
  };
  const badge = new Map<FolderKey, { notHandled: number; waiting: number }>();
  for (const f of FOLDERS) badge.set(f.key, { notHandled: 0, waiting: 0 });
  for (const e of base) {
    const s = handlingOf(e);
    if (s === HANDLED) continue;
    for (const k of ['all', ...foldersOf(e)] as FolderKey[]) {
      const b = badge.get(k)!;
      if (s === WAITING) b.waiting += 1;
      else b.notHandled += 1;
    }
  }
  const rows = base.filter((e) => inState(e) && (folder === 'all' || foldersOf(e).includes(folder)));

  const dayStart = israelDayStartISO(todayISO());
  const today = base.filter((e) => (e.receivedAt ?? '') >= dayStart);
  const sortedToday = today.filter((e) => !!e.classifiedBy).length;
  const notHandled = base.filter((e) => handlingOf(e) === NOT_HANDLED).length;
  const waiting = base.filter((e) => handlingOf(e) === WAITING).length;
  // The view groups by bookkeeper and returns assignedBookkeeperName, but the generated type omits it: read it safely.
  const slaOwner = (r: object): string | undefined => {
    const v: unknown = (r as Record<string, unknown>).assignedBookkeeperName;
    return typeof v === 'string' ? v : undefined;
  };
  const slaRows = (sla.data ?? []).filter((r) => (scope.mode === 'mine' && scope.myName ? slaOwner(r) === scope.myName : true));
  const overdue = slaRows.reduce((n, r) => n + Number(r.overdueCount ?? 0), 0);
  const dueSoon = slaRows.reduce((n, r) => n + Number(r.dueSoonCount ?? 0), 0);

  const loading = emails.isLoading || scope.isLoading;
  const headline = loading ? (
    <Skeleton className="h-7 w-80 max-w-full" />
  ) : today.length === 0 ? (
    `היום עוד לא נכנסו מיילים${scope.mode === 'mine' && scope.myName ? ` של ${scope.myName}` : ''}. ${
      notHandled > 0 ? `${plural(notHandled, 'מייל אחד מקודם מחכה', 'מיילים מקודם מחכים')} לך.` : 'אין מיילים שמחכים לך.'
    }`
  ) : (
    `${maya.name} מיינה היום ${plural(sortedToday, 'מייל אחד', 'מיילים')}${sortedToday < today.length ? ` מתוך ${formatNumber(today.length)} שנכנסו` : ''}. ${
      notHandled > 0 ? `${plural(notHandled, 'אחד מחכה', 'מחכים')} לך` : 'אין מיילים שמחכים לך'
    }${waiting ? `, ו־${plural(waiting, 'אחד ממתין', 'ממתינים')} לגורם אחר` : ''}.`
  );

  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id));
  const allChecked = rows.length > 0 && selectedIds.length === rows.length;

  const mailboxItems = [{ value: ALL, label: 'כל התיבות' }, ...mailboxRows.map((m) => ({ value: m.id, label: m.address || m.id }))];
  const bookkeeperItems = [{ value: ALL, label: 'כל האחראיות' }, ...scope.bookkeepers.map((b) => ({ value: b, label: b }))];
  const folderLabel = FOLDERS.find((f) => f.key === folder)?.label ?? '';

  return (
    <>
      <div className="flex flex-wrap items-stretch gap-[21px]">
        <AgentPanel
          agent="maya"
          className="min-w-[min(100%,520px)] flex-[1.618_1_0px]"
          headline={headline}
          description={
            loading
              ? undefined
              : `${maya.name} רק ממיינת, ועם ציטוט לכל נתון. הקוד בודק את מה שהחזירה ומכין לפי הסוג PDF, טיוטה, מקרה ומשימה. אתם מאשרים. שום דבר לא נשלח: טיוטה מאושרת נעצרת ב״אושר – לא נשלח״.`
          }
        />
        <aside aria-label="מיילים פתוחים" className="glass glass-lift flex min-w-[min(100%,300px)] flex-[1_1_0px] flex-col gap-[13px] rounded-[26px] border p-[21px]">
          <span className="text-[13px] font-semibold text-muted-foreground">לא טופל</span>
          {loading ? (
            <Skeleton className="my-2 h-12 w-24" />
          ) : (
            <span className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums md:text-[54px]">{formatNumber(notHandled)}</span>
          )}
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'ממתין', value: waiting, loading },
              { label: 'חרגו מ-24 שעות', value: overdue, loading: sla.isLoading },
              { label: 'פחות משעתיים', value: dueSoon, loading: sla.isLoading },
            ].map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {s.loading ? <Skeleton className="mt-1 h-5 w-10" /> : <span className="text-base font-bold tabular-nums">{formatNumber(s.value)}</span>}
              </div>
            ))}
          </div>
          <Separator />
          <span className="text-xs text-muted-foreground">
            {scope.mode === 'mine' && scope.myName ? `המיילים של ${scope.myName}` : 'כל התיבות וכל האחראיות'} · ״טופל״ לא נספר בטבעת
          </span>
        </aside>
      </div>

      <section aria-label="דואר נכנס" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
        <div className="flex flex-col gap-[13px] px-[21px] pt-[21px]">
          <nav aria-label="תיקיות" className="flex flex-wrap gap-1.5">
            {FOLDERS.map((f) => {
              const b = badge.get(f.key)!;
              const active = f.key === folder;
              return (
                <Button
                  key={f.key}
                  variant="ghost"
                  aria-pressed={active}
                  onClick={() => setParam('folder', f.key, 'all')}
                  className={cn(
                    'h-auto min-h-[38px] gap-2 rounded-[19px] bg-glass-soft px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-glass-inner',
                    active && 'bg-glass-strong font-semibold text-link shadow-glass-pill hover:bg-glass-strong',
                  )}
                >
                  {f.key !== 'all' && f.key !== 'other' && <span className="text-xs text-muted-foreground tabular-nums">{f.short}</span>}
                  {f.label}
                  {!loading && (b.notHandled > 0 || b.waiting > 0) && (
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums" aria-label={`${b.notHandled} לא טופל, ${b.waiting} ממתין`}>
                      {b.notHandled > 0 && <span className="rounded-full bg-primary/10 px-1.5 font-bold text-link">{b.notHandled}</span>}
                      {b.waiting > 0 && <span className="rounded-full bg-warning-soft px-1.5 font-bold text-warning-ink">{b.waiting}</span>}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
          {folder === 'other' && <span className="text-xs text-muted-foreground">אחר = הבטחת תשלום, אחר ולא רלוונטי</span>}
          <div className="flex flex-wrap items-end gap-[13px]">
            <FilterSelect id="inbox-state" label="מצב טיפול" value={stateFilter} items={STATE_ITEMS} onChange={(v) => setParam('state', v, OPEN)} />
            <FilterSelect id="inbox-mailbox" label="תיבה" value={mailbox} items={mailboxItems} onChange={(v) => setParam('mailbox', v, ALL)} />
            <FilterSelect id="inbox-bookkeeper" label="אחראית" value={bookkeeper} items={bookkeeperItems} onChange={(v) => setParam('bookkeeper', v, ALL)} />
            <Field className="w-auto min-w-56">
              <FieldLabel htmlFor="inbox-customer" className="text-xs text-muted-foreground">
                לקוח
              </FieldLabel>
              <CustomerPicker id="inbox-customer" value={customer} onChange={(c) => setParam('customer', c)} className="bg-glass-card" />
            </Field>
          </div>
          {selectedIds.length > 0 && (
            <div className="glass-inner flex flex-wrap items-center gap-[13px] px-[13px] py-2">
              <span className="text-sm font-semibold">{selectedIds.length === 1 ? 'נבחר מייל אחד' : `נבחרו ${formatNumber(selectedIds.length)} מיילים`}</span>
              <HandlingButtons ids={selectedIds} size="sm" onDone={() => setSelected(new Set())} />
              <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setSelected(new Set())}>
                <XIcon data-icon="inline-start" />
                ניקוי הבחירה
              </Button>
            </div>
          )}
        </div>

        {emails.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="המיילים" />
          </div>
        ) : loading ? (
          <LoadingRows rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(HEAD, 'w-10 ps-[21px]')}>
                    <Checkbox
                      checked={allChecked}
                      indeterminate={selectedIds.length > 0 && !allChecked}
                      disabled={rows.length === 0}
                      onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                      aria-label="בחירת כל המיילים ברשימה"
                    />
                  </TableHead>
                  <TableHead className={HEAD}>24 שעות</TableHead>
                  <TableHead className={HEAD}>שולח</TableHead>
                  <TableHead className={HEAD}>לקוח</TableHead>
                  <TableHead className={HEAD}>אימות</TableHead>
                  <TableHead className={HEAD}>סוגים</TableHead>
                  <TableHead className={HEAD}>הסיכום של {maya.name}</TableHead>
                  <TableHead className={cn(HEAD, 'pe-[21px]')}>מצב טיפול</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <MailRow
                    key={e.id}
                    e={e}
                    now={now}
                    selected={selected.has(e.id)}
                    onSelect={(on) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(e.id);
                        else next.delete(e.id);
                        return next;
                      })
                    }
                    onOpen={() => onOpen(e.id)}
                  />
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <AgentEmpty agent="maya" title={stateFilter === OPEN ? `אין מיילים פתוחים${folder !== 'all' ? ` בתיקייה ${folderLabel}` : ''}` : 'אין מיילים שמתאימים לסינון'}>
                {stateFilter === OPEN
                  ? `${maya.name} ממיינת כל מייל שנכנס לתיבות. כשיגיע מייל שצריך אתכם, הוא יופיע כאן עם טבעת 24 השעות.`
                  : 'נסו לשנות את הסינון או את התיקייה.'}
              </AgentEmpty>
            )}
          </div>
        )}
        {emails.hasNextPage && (
          <Button variant="outline" className="self-center" onClick={() => emails.fetchNextPage()} disabled={emails.isFetchingNextPage}>
            {emails.isFetchingNextPage ? 'טוען…' : 'טעינת מיילים קודמים'}
          </Button>
        )}
        <div className="pb-[8px]" />
      </section>
    </>
  );
}