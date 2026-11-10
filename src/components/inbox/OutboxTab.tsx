import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getRouteUrl, useEntityGetAll, useEntityGetOne } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityWhereClause } from '@blocksdiy/blocks-client-sdk';
import { ArrowUpLeftIcon, CheckCheckIcon, CheckIcon, CornerDownLeftIcon, XIcon } from 'lucide-react';
import { ApprovalsEntity, MailboxesEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { AgentEmpty, LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { DraftCard, RejectDialog, useDecideApproval } from '@/components/inbox/DraftCard';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDateTime, formatNumber } from '@/utils/Format';
import { APPROVED_NOT_SENT, OUTBOX_COMPONENTS, OUTBOX_STATUSES, referenceOf } from '@/utils/Inbox';
import type { Approval } from '@/utils/Inbox';

const HEAD = 'text-xs font-semibold text-muted-foreground';
const ALL = 'all';
const PENDING = 'ממתין';

type RecordLink = { to: string; label: string } | null;

/** Where an outbox row's record lives: the mail, the case, the receipts record or the customer. */
function recordLinkOf(a: Approval, bankHref: (id: string) => string | null): RecordLink {
  const id = a.relatedId ?? '';
  switch (a.relatedTable) {
    case 'BankLines': {
      const to = id ? bankHref(id) : null;
      return to ? { to, label: 'לתקבולים' } : null;
    }
    case 'InboundEmails':
      return id ? { to: `/collections/inbox?tab=inbox&email=${encodeURIComponent(id)}`, label: 'לפנייה' } : null;
    case 'Disputes':
      return id ? { to: getRouteUrl('collections/disputes/:disputeId', { disputeId: id }), label: 'למקרה' } : null;
    case 'Customers':
      return a.customerCode ? { to: getRouteUrl('collections/customers/:code', { code: a.customerCode }), label: 'לכרטיס הלקוח' } : null;
    default:
      return a.customerCode ? { to: getRouteUrl('collections/customers/:code', { code: a.customerCode }), label: 'לכרטיס הלקוח' } : null;
  }
}

function FilterSelect({ id, label, value, items, onChange }: { id: string; label: string; value: string; items: { value: string; label: string }[]; onChange: (v: string) => void }) {
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

/** Tab "דואר יוצא": every draft from every component, with replies, links, and approve / reject / edit (single, bulk, or a whole batch). */
export function OutboxTab() {
  const scope = useOwnerScope();
  const decide = useDecideApproval();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'approve' | 'reject' | 'batch' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState(false);

  const component = params.get('component') ?? ALL;
  const status = params.get('status') ?? PENDING;
  const mailbox = params.get('mailbox') ?? ALL;
  const batch = params.get('batch');
  const draftId = params.get('draft');

  function setParam(key: string, value: string | null, fallback?: string) {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key !== 'draft' });
    if (key !== 'draft') setSelected(new Set());
  }

  const where: EntityWhereClause<typeof ApprovalsEntity>[] = [];
  if (component !== ALL) where.push({ column: 'component', value: component });
  if (status !== ALL) where.push({ column: 'status', value: status });
  if (mailbox !== ALL) where.push({ column: 'mailboxId', value: mailbox });
  if (batch) where.push({ column: 'batchId', value: batch });
  const q = useEntityGetAll(ApprovalsEntity, {
    where: where.length ? { and: where } : undefined,
    orderBy: [{ column: 'draftedAt', direction: 'desc' }],
    page: { size: 100 },
  });
  const pendingQ = useEntityGetAll(ApprovalsEntity, { where: { column: 'status', value: PENDING }, page: { size: 500 } });
  const mailboxes = useEntityGetAll(MailboxesEntity);

  const rows = ((q.data ?? []) as Approval[]).filter((a) => scope.isVisible(a.customerCode));
  const pending = ((pendingQ.data ?? []) as Approval[]).filter((a) => scope.isVisible(a.customerCode));
  const byComponent = new Map<string, number>();
  for (const a of pending) byComponent.set(a.component || 'ללא רכיב', (byComponent.get(a.component || 'ללא רכיב') ?? 0) + 1);
  const bankIds = rows.filter((a) => a.relatedTable === 'BankLines' && a.relatedId).map((a) => a.relatedId as string);
  const bank = useReceiptLineLinks(bankIds);

  const listed = draftId ? rows.find((a) => a.id === draftId) : undefined;
  const single = useEntityGetOne(ApprovalsEntity, { id: draftId ?? '' }, { enabled: !!draftId && !listed && !q.isLoading });
  const opened = listed ?? (single.data as Approval | undefined);

  const selectedIds = [...selected].filter((id) => rows.some((r) => r.id === id && r.status === PENDING));
  const pendingRows = rows.filter((r) => r.status === PENDING);
  const allChecked = pendingRows.length > 0 && selectedIds.length === pendingRows.length;
  const batchPending = batch ? pendingRows.length : 0;

  async function bulk(decision: 'approve' | 'reject', note?: string) {
    setBusy(decision);
    const res = await decide(decision, { approvalIds: selectedIds }, note ? { note } : {});
    if (res) {
      const n = res.updated?.length ?? selectedIds.length;
      toast.add({
        title: decision === 'approve' ? `${formatNumber(n)} טיוטות סומנו ״${APPROVED_NOT_SENT}״` : `${formatNumber(n)} טיוטות נדחו`,
        description: decision === 'approve' ? 'שום דבר לא נשלח מהאפליקציה.' : undefined,
        type: 'success',
      });
      setSelected(new Set());
      setRejectOpen(false);
    }
    setBusy(null);
  }

  async function approveBatch() {
    if (!batch) return;
    setBusy('batch');
    const res = await decide('approve', { batchId: batch });
    if (res) {
      toast.add({ title: `כל המנה סומנה ״${APPROVED_NOT_SENT}״`, description: `${formatNumber(res.updated?.length ?? 0)} טיוטות. שום דבר לא נשלח.`, type: 'success' });
      setBatchConfirm(false);
    }
    setBusy(null);
  }

  const componentItems = [{ value: ALL, label: 'כל הרכיבים' }, ...OUTBOX_COMPONENTS.map((c) => ({ value: c, label: c }))];
  const statusItems = [{ value: ALL, label: 'כל הסטטוסים' }, ...OUTBOX_STATUSES.map((s) => ({ value: s, label: s === PENDING ? 'ממתין לאישור' : s }))];
  const mailboxItems = [{ value: ALL, label: 'כל התיבות' }, ...(mailboxes.data ?? []).map((m) => ({ value: m.id, label: m.address || m.id }))];

  const loading = q.isLoading || scope.isLoading;
  const headline =
    pendingQ.isLoading || scope.isLoading ? (
      <Skeleton className="h-7 w-80 max-w-full" />
    ) : pending.length === 0 ? (
      'אין טיוטות שמחכות לאישור שלך'
    ) : (
      `${pending.length === 1 ? 'טיוטה אחת מחכה' : `${formatNumber(pending.length)} טיוטות מחכות`} לאישור שלך: ${[...byComponent.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${formatNumber(n)} ${c}`)
        .join(', ')}.`
    );

  return (
    <>
      <AgentPanel
        agent="maya"
        headline={headline}
        description={`כל טיוטה מכל רכיב נכנסת לכאן עם מספר סימוכין בסוף הנושא, כדי שתשובה תיקשר אליה. אישור מסמן ״${APPROVED_NOT_SENT}״: שום דבר לא נשלח מהאפליקציה עדיין.`}
      />

      <section aria-label="דואר יוצא" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
        <div className="flex flex-col gap-[13px] px-[21px] pt-[21px]">
          <div className="flex flex-wrap items-end gap-[13px]">
            <FilterSelect id="outbox-status" label="סטטוס" value={status} items={statusItems} onChange={(v) => setParam('status', v, PENDING)} />
            <FilterSelect id="outbox-component" label="רכיב" value={component} items={componentItems} onChange={(v) => setParam('component', v, ALL)} />
            <FilterSelect id="outbox-mailbox" label="תיבה" value={mailbox} items={mailboxItems} onChange={(v) => setParam('mailbox', v, ALL)} />
            {batch && (
              <Button variant="ghost" size="sm" className="rounded-full bg-glass-soft" onClick={() => setParam('batch', null)}>
                <span dir="ltr">מנה {batch}</span>
                <XIcon data-icon="inline-end" />
              </Button>
            )}
            {batch && batchPending > 0 && (
              <Button className="rounded-full px-[18px] font-bold shadow-primary" disabled={!!busy} onClick={() => setBatchConfirm(true)}>
                <CheckCheckIcon data-icon="inline-start" />
                אישור כל המנה ({formatNumber(batchPending)})
              </Button>
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="glass-inner flex flex-wrap items-center gap-[13px] px-[13px] py-2">
              <span className="text-sm font-semibold">{selectedIds.length === 1 ? 'נבחרה טיוטה אחת' : `נבחרו ${formatNumber(selectedIds.length)} טיוטות`}</span>
              <Button size="sm" variant={batch ? 'outline' : 'default'} disabled={!!busy} onClick={() => bulk('approve')}>
                {busy === 'approve' ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                אישור
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setRejectOpen(true)}>
                <XIcon data-icon="inline-start" />
                דחייה
              </Button>
              <span className="text-xs text-muted-foreground">אישור לא שולח דבר.</span>
              <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setSelected(new Set())}>
                ניקוי הבחירה
              </Button>
            </div>
          )}
        </div>

        {q.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="הדואר היוצא" />
          </div>
        ) : loading ? (
          <LoadingRows rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(HEAD, 'w-10 ps-[21px]')}>
                    <Checkbox
                      checked={allChecked}
                      indeterminate={selectedIds.length > 0 && !allChecked}
                      disabled={pendingRows.length === 0}
                      onCheckedChange={(v) => setSelected(v ? new Set(pendingRows.map((r) => r.id)) : new Set())}
                      aria-label="בחירת כל הטיוטות הממתינות"
                    />
                  </TableHead>
                  <TableHead className={HEAD}>סימוכין</TableHead>
                  <TableHead className={HEAD}>נמען</TableHead>
                  <TableHead className={HEAD}>נושא</TableHead>
                  <TableHead className={HEAD}>רכיב</TableHead>
                  <TableHead className={HEAD}>מתי</TableHead>
                  <TableHead className={HEAD}>סטטוס</TableHead>
                  <TableHead className={HEAD}>תשובות</TableHead>
                  <TableHead className={cn(HEAD, 'pe-[21px]')}>רשומה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const link = recordLinkOf(a, bank.href);
                  const isPending = a.status === PENDING;
                  return (
                    <TableRow
                      key={a.id}
                      tabIndex={0}
                      data-state={selected.has(a.id) ? 'selected' : undefined}
                      className="cursor-pointer hover:bg-glass-faint focus-visible:bg-glass-faint focus-visible:outline-none"
                      onClick={() => setParam('draft', a.id)}
                      onKeyDown={(ev) => {
                        if (ev.target !== ev.currentTarget) return;
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setParam('draft', a.id);
                        }
                      }}
                    >
                      <TableCell className="ps-[21px] align-top" onClick={(ev) => ev.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(a.id)}
                          disabled={!isPending}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(a.id);
                              else next.delete(a.id);
                              return next;
                            })
                          }
                          aria-label={`בחירת ${referenceOf(a)}`}
                        />
                      </TableCell>
                      <TableCell dir="ltr" className="text-end align-top text-xs font-semibold tabular-nums">
                        {referenceOf(a)}
                      </TableCell>
                      <TableCell className="max-w-52 align-top whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{a.recipientName || a.customerName || '—'}</span>
                          <span dir="ltr" className="truncate text-end text-xs text-muted-foreground">
                            {a.recipientContact || ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-80 align-top whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <span className="line-clamp-2 text-[13px] font-semibold">{a.subject || 'ללא נושא'}</span>
                          <span className="text-xs text-muted-foreground">{a.kind}</span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge value={a.component || 'ללא רכיב'} tone="neutral" />
                          {a.batchId && !batch && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-link hover:underline"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setParam('batch', a.batchId ?? null);
                              }}
                            >
                              כל המנה
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-nowrap tabular-nums">{formatDateTime(a.draftedAt)}</TableCell>
                      <TableCell className="align-top">
                        <StatusBadge value={isPending ? 'ממתין לאישור' : a.status} tone={isPending ? 'warning' : undefined} />
                      </TableCell>
                      <TableCell className="align-top text-xs" onClick={(ev) => ev.stopPropagation()}>
                        {(a.replyCount ?? 0) > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <CornerDownLeftIcon className="size-3.5" />
                              {formatNumber(a.replyCount)}
                            </span>
                            {a.lastReplyAt && <span className="text-muted-foreground tabular-nums">{formatDateTime(a.lastReplyAt)}</span>}
                            {a.lastReplyEmailId && (
                              <Link to={`/collections/inbox?tab=inbox&email=${encodeURIComponent(a.lastReplyEmailId)}`} className="font-semibold text-link hover:underline">
                                לתשובה
                              </Link>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pe-[21px] align-top" onClick={(ev) => ev.stopPropagation()}>
                        {link ? (
                          <Link to={link.to} className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-link hover:underline">
                            {link.label}
                            <ArrowUpLeftIcon className="size-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <AgentEmpty agent="maya" title={status === PENDING ? 'אין טיוטות שמחכות לאישור' : 'אין טיוטות שמתאימות לסינון'}>
                {status === PENDING
                  ? 'כשמאיה, נינה או האוטומציות יכינו טיוטה (מענה, מייל קבלה להנהלת החשבונות, פנייה ללוגיסטיקה, אישור מחיר או המנה החודשית), היא תחכה כאן לאישור.'
                  : 'נסו לשנות את הסינון.'}
              </AgentEmpty>
            )}
          </div>
        )}
        {q.hasNextPage && (
          <Button variant="outline" className="self-center" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'טוען…' : 'טעינת טיוטות קודמות'}
          </Button>
        )}
        <div className="pb-[8px]" />
      </section>

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} busy={busy === 'reject'} count={selectedIds.length} onConfirm={(note) => bulk('reject', note)} />

      <AlertDialog open={batchConfirm} onOpenChange={setBatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>לאשר את כל המנה?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatNumber(batchPending)} טיוטות ממתינות במנה יסומנו ״{APPROVED_NOT_SENT}״. שום דבר לא נשלח מהאפליקציה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction disabled={busy === 'batch'} onClick={approveBatch}>
              {busy === 'batch' && <Spinner data-icon="inline-start" />}
              אישור המנה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!draftId} onOpenChange={(o) => !o && setParam('draft', null)}>
        <SheetContent side="left" className="glass-menu gap-0 overflow-y-auto data-[side=left]:w-full data-[side=left]:sm:max-w-[640px]">
          <SheetHeader className="p-[21px] pe-12">
            <SheetTitle className="text-lg leading-snug font-bold">{opened ? opened.subject || 'ללא נושא' : single.isLoading || q.isLoading ? 'טוען את הטיוטה…' : 'הטיוטה לא נמצאה'}</SheetTitle>
            <SheetDescription className="text-[13px]">
              {opened
                ? `${opened.customerName || opened.customerCode || ''}${opened.draftedBy ? ` · הוכנה ע״י ${opened.draftedBy}` : ''} · ${formatDateTime(opened.draftedAt)}`
                : 'ייתכן שהקישור ישן.'}
            </SheetDescription>
            {opened &&
              (() => {
                const link = recordLinkOf(opened, bank.href);
                return link ? (
                  <Link to={link.to} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-link hover:underline">
                    {link.label}
                    <ArrowUpLeftIcon className="size-3.5" />
                  </Link>
                ) : null;
              })()}
          </SheetHeader>
          <Separator />
          <div className="p-[21px]">
            {opened ? (
              <DraftCard key={`${opened.id}:${opened.status}:${opened.subject ?? ''}:${opened.body ?? ''}`} draft={opened} primary />
            ) : single.isLoading || q.isLoading ? (
              <Skeleton className="h-64 w-full rounded-[22px]" />
            ) : (
              <p className="text-[13px] text-muted-foreground">אין טיוטה כזו בדואר היוצא.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}