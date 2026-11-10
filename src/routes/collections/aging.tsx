import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { FileSpreadsheetIcon, Maximize2Icon, MessageSquareTextIcon, Minimize2Icon, MinusIcon, PlusIcon, ScanIcon } from 'lucide-react';
import { AgentSettingsEntity, AgingByMonthEntity, CustomerContactsEntity, CustomerNotesEntity, CustomersEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { AgingCards, AgingCardsSkeleton } from '@/components/aging/AgingCards';
import { AgingPullBar } from '@/components/aging/AgingPullBar';
import { AgingToolbar } from '@/components/aging/AgingToolbar';
import { MonthNotesPanel } from '@/components/aging/MonthNotesPanel';
import { AgentEmpty, LoadError, PageHeader } from '@/components/PageStates';
import { useAgingView } from '@/hooks/useAgingView';
import { useNinaFocus } from '@/hooks/useNinaFocus';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { agingFileName, agingSheetRows } from '@/utils/AgingExport';
import {
  DEFAULT_MONTHS_BACK,
  applyMonthView,
  buildAging,
  chipFacts,
  customLabels,
  customerFlags,
  indexNotes,
  monthsInBucket,
  notesInBucket,
  reportFacts,
  reportSentences,
  settingNumber,
  settingsMap,
  toMonthRows,
  windowKeys,
} from '@/utils/AgingMonths';
import type { CustomerNote } from '@/utils/AgingMonths';
import { ZOOM_MAX, ZOOM_MIN, bucketsOf, cellAt, clampZoom, isDefaultView, stepZoom, sumTotals } from '@/utils/AgingPanel';
import type { Bucket } from '@/utils/AgingPanel';
import { AG_CARD, AG_ICON_BTN, AG_MENU, AG_SECONDARY_BTN } from '@/utils/AgingStyle';
import type { AgingCellKey, AgingCustomer } from '@/utils/CollectionsTypes';
import { addMonths, formatILS, formatMonth, todayISO } from '@/utils/Format';
import { cn } from '@/lib/utils';

const BACK_OPTIONS = [1, 2, 3, 4, 5, 6, 9, 12];
const FORWARD_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

function NumberSelect({ id, value, options, format, onChange }: { id: string; value: number; options: number[]; format: (n: number) => string; onChange: (n: number) => void }) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  const items = all.map((n) => ({ label: format(n), value: String(n) }));
  return (
    <Select items={items} value={String(value)} onValueChange={(v) => v !== null && onChange(Number(v))}>
      <SelectTrigger id={id} className="w-36 bg-glass-card">
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
  );
}

/** The chip under a period: the active notes' count and a dot when one is due; an empty period shows "+" on hover. */
function NoteChip({ count, due, label, onOpen }: { count: number; due: boolean; label: string; onOpen: (anchor: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={count > 0 ? `${count === 1 ? 'הערה פעילה אחת' : `${count} הערות פעילות`} ב${label}${due ? ', המועד הגיע' : ''}` : `הוספת הערה ל${label}`}
      title={count > 0 ? undefined : 'הוספת הערה'}
      className={cn(
        'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full px-2 text-[12px] font-bold outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ag-cobalt',
        count > 0
          ? 'border border-ag-btn-border bg-ag-surface text-ag-ink-2 hover:border-ag-cobalt/50 hover:text-ag-cobalt'
          : 'text-ag-muted opacity-0 group-hover/cell:opacity-100 hover:text-ag-cobalt',
      )}
    >
      {count > 0 ? (
        <>
          <MessageSquareTextIcon className="size-3.5" />
          {count}
          {due && <span aria-hidden className="size-2 rounded-full bg-warning" />}
        </>
      ) : (
        <PlusIcon className="size-3.5" />
      )}
    </button>
  );
}

/** The period's label in the notes window: a month, or the months חוב קודם / חוב מאוחר cover. */
function periodLabel(bucket: Bucket, keys: string[]): string {
  if (bucket.kind === 'prior') return `חוב קודם · עד ${formatMonth(addMonths(keys[0], -1))}`;
  if (bucket.kind === 'later') return `חוב מאוחר · מ${formatMonth(addMonths(keys[keys.length - 1], 1))}`;
  return bucket.label;
}

/** The notes window's body: the bucket's active notes, plus the customer's closed notes read when it opens. */
function OpenedNotes({
  customer,
  bucket,
  keys,
  activeNotes,
  balances,
  customerId,
  suggestions,
  settings,
  today,
  authorName,
}: {
  customer: AgingCustomer;
  bucket: Bucket;
  keys: string[];
  activeNotes: CustomerNote[];
  balances: Map<string, number> | undefined;
  customerId: string | null;
  suggestions: string[];
  settings: ReturnType<typeof settingsMap>;
  today: string;
  authorName: string;
}) {
  const code = customer.customerCode ?? '';
  const closedQ = useEntityGetAll(CustomerNotesEntity, {
    where: { and: [{ column: 'customerCode', value: code }, { column: 'status', operator: '!=', value: 'פעילה' }] },
    orderBy: [{ column: 'noteCreatedAt', direction: 'desc' }],
    page: { size: 50 },
  });
  const closed = notesInBucket(indexNotes(closedQ.data ?? []).get(code), bucket.key, keys);
  const notes = [...notesInBucket(activeNotes, bucket.key, keys), ...closed];
  const months = monthsInBucket(balances, bucket.key, keys).map((m) => ({ key: m, balance: balances?.get(m) ?? 0 }));
  return (
    <MonthNotesPanel
      customerName={customer.customerName ?? code}
      customerCode={code}
      customerId={customerId}
      periodLabel={periodLabel(bucket, keys)}
      balance={cellAt(customer, bucket.key)?.amount ?? 0}
      months={bucket.kind === 'month' ? [] : months}
      fixedMonth={bucket.kind === 'month' ? String(bucket.key) : null}
      notes={notes}
      suggestions={[...new Set([...suggestions, ...customLabels(closedQ.data ?? [])])]}
      settings={settings}
      today={today}
      authorName={authorName}
    />
  );
}

/**
 * /collections/aging — the aging report from the open movements (Design 02 section 7): one row per customer, one column
 * per due month in a short window, חוב קודם before and חוב מאוחר after it so the total is the account balance, a notes
 * chip per period opening the floating notes window, and at the top when Priority was last pulled with the one
 * primary button "משוך עכשיו מפריוריטי".
 */
export default function AgingPage() {
  const scope = useOwnerScope();
  const today = todayISO();
  const { view, update, reset } = useAgingView();
  const [monthsBack, setMonthsBack] = useState<number | null>(null);
  const [monthsForward, setMonthsForward] = useState(0);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<{ code: string; key: AgingCellKey; anchor: HTMLElement } | null>(null);
  const [full, setFull] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fitWidth, setFitWidth] = useState(0);
  const enteredFullscreen = useRef(false);
  const tableRef = useRef<HTMLElement>(null);
  const [params, setParams] = useSearchParams();
  const focusCustomer = params.get('customer');

  const settingsQ = useEntityGetAll(AgentSettingsEntity);
  const monthsQ = useEntityGetAll(AgingByMonthEntity);
  const customersQ = useEntityGetAll(CustomersEntity);
  const contactsQ = useEntityGetAll(CustomerContactsEntity);
  const notesQ = useEntityGetAll(CustomerNotesEntity, { where: { column: 'status', value: 'פעילה' } });

  const settings = settingsMap(settingsQ.data);
  const back = monthsBack ?? settingNumber(settings, 'agingMonthsBack', DEFAULT_MONTHS_BACK);
  const keys = windowKeys(today, back, monthsForward);
  const data = buildAging(toMonthRows(monthsQ.data), customersQ.data ?? [], contactsQ.data ?? [], keys);
  const customers = data.customers.filter((c) => scope.isVisible(c.customerCode, c.bookkeeperName));
  const notesBy = indexNotes(notesQ.data ?? []);
  const ctx = { balances: data.balances, notes: notesBy, today };
  const months = keys.map((k) => ({ monthKey: k, label: formatMonth(k) }));
  const buckets = bucketsOf(months);
  const focus = buckets.some((b) => b.key === view.focus) ? view.focus : 'all';
  const visible = applyMonthView(customers, ctx, view, search);
  const narrowed = visible.length !== customers.length || view.customers.length > 0 || view.filters.length > 0 || search.trim() !== '';
  const totals = sumTotals(customers, keys);
  const shownTotals = narrowed ? sumTotals(visible, keys) : totals;
  const suggestions = customLabels(notesQ.data ?? []);

  const loading = monthsQ.isLoading || customersQ.isLoading || notesQ.isLoading || settingsQ.isLoading || scope.isLoading;
  const failed = monthsQ.isError || customersQ.isError || notesQ.isError;
  const openedCustomer = opened ? customers.find((c) => c.customerCode === opened.code) : undefined;
  const openedBucket = opened ? buckets.find((b) => b.key === opened.key) : undefined;
  useNinaFocus(openedCustomer?.customerCode, openedCustomer?.customerName);

  const facts = reportFacts(customers, ctx);
  const sentences = reportSentences(facts);
  const mismatches = customers.filter((c) => c.balanceMatches === false).length;
  const overdue = customers.reduce((s, c) => s + customerFlags(data.balances.get(c.customerCode ?? ''), undefined, today).overdueAmount, 0);

  const headline = loading ? (
    <Skeleton className="h-7 w-80 max-w-full" />
  ) : failed ? (
    'לא הצלחנו לבנות את דוח הגיול כרגע'
  ) : customers.length === 0 ? (
    `אין לקוחות עם תנועות פתוחות${scope.bookkeeperFilter ? ` אצל ${scope.bookkeeperFilter}` : ''}`
  ) : (
    `חוב פתוח של ${formatILS(totals.total)} אצל ${customers.length === 1 ? 'לקוח אחד' : `${customers.length} לקוחות`}. ${
      sentences.length > 0 ? `${sentences.join(', ')}.` : 'לכל חודש בפיגור יש הערה, ואין התחייבויות שלא קוימו.'
    }`
  );

  // Arriving from Today with ?customer=CODE: show that customer only, then drop the param (the view keeps it).
  useEffect(() => {
    if (!focusCustomer) return;
    update({ customers: [focusCustomer] });
    setSearch('');
    setParams(
      (p) => {
        p.delete('customer');
        return p;
      },
      { replace: true },
    );
    tableRef.current?.scrollIntoView?.({ block: 'start' });
  }, [focusCustomer]);

  function openFull() {
    setFull(true);
    // Fullscreen on the whole page, so the notes window — portaled to the body — still shows above the table.
    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreen.current = true;
        })
        .catch(() => undefined);
    }
  }

  function closeFull() {
    setFull(false);
    if (enteredFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    enteredFullscreen.current = false;
  }

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || opened) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="listbox"], [role="menu"], [role="dialog"]:not([data-aging-full])')) return;
      closeFull();
    };
    const onFullscreen = () => {
      if (document.fullscreenElement || !enteredFullscreen.current) return;
      enteredFullscreen.current = false;
      setFull(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [full, opened]);

  useEffect(
    () => () => {
      if (enteredFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    },
    [],
  );

  // The zoom: a percentage, or 'fit' = as large as fits the width without side-scrolling (CSS zoom, never transform).
  const zoomSetting = full ? view.fullZoom : view.zoom;
  const shownCols = (focus === 'all' ? buckets.length : 1) + 1;
  const naturalWidth = shownCols * 112 + 660;
  const zoom = zoomSetting === 'fit' ? (fitWidth > 0 ? clampZoom(Math.min(100, Math.floor((fitWidth / naturalWidth) * 100))) : 100) : zoomSetting;
  const setZoom = (z: number | 'fit') => update(full ? { fullZoom: z } : { zoom: z });
  const measure = (el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth));
    ro.observe(el);
    setFitWidth(el.clientWidth);
    return () => ro.disconnect();
  };

  /** The table as displayed — rows, columns and month focus on screen — as an Excel file. */
  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const shownBuckets = focus === 'all' ? buckets : buckets.filter((b) => b.key === focus);
      const rows = agingSheetRows(visible, shownBuckets, view.columns, shownTotals, narrowed ? 'סה״כ בתצוגה' : 'סה״כ');
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = rows[0].map((h, i) => ({ wch: i === 1 ? 28 : Math.max(12, String(h ?? '').length + 2) }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'דוח גיול');
      book.Workbook = { Views: [{ RTL: true }] };
      XLSX.writeFile(book, agingFileName(today));
      toast.add({ title: 'הקובץ ירד', description: `${visible.length} לקוחות, כמו שמוצג בטבלה.`, type: 'success' });
    } catch {
      toast.add({ title: 'הייצוא לא הצליח', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const countLabel = visible.length === 1 ? 'לקוח אחד' : `${visible.length} לקוחות`;

  const renderNotes = (c: AgingCustomer, b: Bucket) => {
    const code = c.customerCode ?? '';
    const { count, due } = chipFacts(notesInBucket(notesBy.get(code), b.key, keys), today);
    return <NoteChip count={count} due={due} label={b.label} onOpen={(anchor) => setOpened({ code, key: b.key, anchor })} />;
  };

  const tableCard = (
    <>
      <header className="aging-argyle shrink-0 rounded-[8px] border border-ag-border bg-ag-surface px-[21px] pt-[21px] pb-[18px] md:px-[34px] md:pt-[26px] md:pb-[21px]">
        <div className="flex flex-wrap items-start justify-between gap-[21px]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className={cn('leading-tight font-extrabold text-ag-cobalt', full ? 'text-[32px]' : 'text-[26px]')}>גיול לפי לקוח</h2>
            {!loading && !failed && (
              <Badge
                variant="outline"
                title={narrowed ? `${visible.length} מתוך ${customers.length} לקוחות בדוח` : undefined}
                className="h-6 rounded-[4px] border-transparent bg-ag-cobalt-tint px-2.5 text-sm font-semibold text-ag-cobalt"
              >
                {countLabel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="זום הטבלה" className="flex items-center overflow-hidden rounded-[6px] border border-ag-btn-border bg-ag-surface">
              <Button variant="ghost" size="icon-lg" className="size-11 rounded-none text-ag-ink" onClick={() => setZoom(stepZoom(zoom, -1))} disabled={zoom <= ZOOM_MIN} aria-label="הקטנה">
                <MinusIcon />
              </Button>
              <span className="w-12 text-center text-sm font-semibold text-ag-ink tabular-nums" aria-live="polite">
                {zoom}%
              </span>
              <Button variant="ghost" size="icon-lg" className="size-11 rounded-none text-ag-ink" onClick={() => setZoom(stepZoom(zoom, 1))} disabled={zoom >= ZOOM_MAX} aria-label="הגדלה">
                <PlusIcon />
              </Button>
              <Separator orientation="vertical" className="my-2 h-auto bg-ag-border" />
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11 rounded-none text-ag-ink aria-pressed:bg-ag-cobalt-tint aria-pressed:text-ag-cobalt"
                onClick={() => setZoom(zoomSetting === 'fit' ? 100 : 'fit')}
                aria-pressed={zoomSetting === 'fit'}
                aria-label="התאמה לרוחב המסך"
                title="התאמה לרוחב המסך"
              >
                <ScanIcon />
              </Button>
            </div>
            <Button variant="outline" size="icon-lg" className={AG_ICON_BTN} onClick={exportExcel} disabled={exporting || loading || visible.length === 0} aria-label="ייצוא לאקסל" title="ייצוא לאקסל">
              {exporting ? <Spinner /> : <FileSpreadsheetIcon className="text-ag-excel" />}
            </Button>
            {full ? (
              <Button variant="outline" size="icon-lg" className={AG_ICON_BTN} onClick={closeFull} autoFocus aria-label="יציאה ממסך מלא" title="יציאה ממסך מלא">
                <Minimize2Icon />
              </Button>
            ) : (
              <Button variant="outline" size="icon-lg" className={AG_ICON_BTN} onClick={openFull} aria-label="מסך מלא" title="מסך מלא">
                <Maximize2Icon />
              </Button>
            )}
          </div>
        </div>
        {customers.length > 0 && (
          <div className="mt-[21px]">
            <AgingToolbar view={view} update={update} reset={reset} customers={customers} buckets={buckets} focus={focus} search={search} onSearch={setSearch} />
          </div>
        )}
      </header>
      <div ref={measure} className={cn('flex min-w-0 flex-col', full && 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[21px]')}>
        {failed ? (
          <div className={cn(AG_CARD, 'p-[21px]')}>
            <LoadError what="דוח הגיול" />
          </div>
        ) : loading ? (
          <AgingCardsSkeleton />
        ) : customers.length === 0 ? (
          <div className={AG_CARD}>
            <AgentEmpty title="אין תנועות פתוחות">הדוח נבנה מהתנועות הפתוחות שנמשכות מפריוריטי בכל בוקר. אחרי המשיכה הבאה הלקוחות יופיעו כאן.<span className="mt-1 block font-semibold">ממתין לתנועות פתוחות מפריוריטי</span></AgentEmpty>
          </div>
        ) : visible.length === 0 ? (
          <div className={cn(AG_CARD, 'flex flex-col items-center gap-2 p-[34px] text-center')}>
            <p className="text-sm text-ag-muted">אין לקוחות שמתאימים לתצוגה הזו.</p>
            {(!isDefaultView(view) || search) && (
              <Button
                variant="outline"
                size="sm"
                className={AG_SECONDARY_BTN}
                onClick={() => {
                  reset();
                  setSearch('');
                }}
              >
                איפוס התצוגה
              </Button>
            )}
          </div>
        ) : (
          <div className="[zoom:var(--ag-zoom)]" style={{ '--ag-zoom': zoom / 100 } as CSSProperties}>
            <AgingCards
              customers={visible}
              buckets={buckets}
              focus={focus}
              totals={shownTotals}
              totalsLabel={narrowed ? 'סה״כ בתצוגה' : 'סה״כ'}
              columns={view.columns}
              renderNotes={renderNotes}
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <PageHeader title="דוח גיול" description="החוב של כל לקוח לפי חודש פירעון, מהתנועות הפתוחות בפריוריטי, עם ההערות של הצוות על כל חודש." />

      <div className="flex flex-wrap items-stretch gap-[21px]">
        <AgentPanel lift={false} className="min-w-[min(100%,520px)] flex-[1.618_1_0px]" subtitle="מחושב מהתנועות הפתוחות ומההערות הפעילות" headline={headline}>
          <AgingPullBar morningAt={settings.get('morningPullAt') || '06:00'} onPulled={monthsQ.refetch} />
          <div className="flex flex-wrap items-end gap-[21px]">
            <Field className="w-auto">
              <FieldLabel htmlFor="aging-back">חודשים אחורה</FieldLabel>
              <NumberSelect id="aging-back" value={back} options={BACK_OPTIONS} format={(n) => (n === 1 ? 'חודש אחד' : `${n} חודשים`)} onChange={setMonthsBack} />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="aging-forward">חודשים קדימה</FieldLabel>
              <NumberSelect
                id="aging-forward"
                value={monthsForward}
                options={FORWARD_OPTIONS}
                format={(n) => (n === 0 ? 'עד החודש הנוכחי' : n === 1 ? 'חודש אחד' : `${n} חודשים`)}
                onChange={setMonthsForward}
              />
            </Field>
          </div>
        </AgentPanel>

        <aside aria-label="סיכום הגיול" className="glass flex min-w-[min(100%,300px)] flex-[1_1_0px] flex-col gap-[13px] rounded-[26px] border p-[21px]">
          <span className="text-[13px] font-semibold text-muted-foreground">סה״כ בדוח</span>
          {loading ? (
            <Skeleton className="my-2 h-12 w-48" />
          ) : (
            <span className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums md:text-[54px]">{formatILS(totals.total)}</span>
          )}
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'בפיגור', value: formatILS(overdue) },
              { label: 'לקוחות', value: customers.length },
              { label: 'פערים מול כרטסת', value: mismatches },
            ].map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {loading ? <Skeleton className="mt-1 h-5 w-12" /> : <span className="truncate text-base font-bold tabular-nums">{s.value}</span>}
              </div>
            ))}
          </div>
          <Separator />
          <span className="text-xs text-muted-foreground">
            {scope.bookkeeperFilter ? `מסונן ללקוחות של ${scope.bookkeeperFilter}` : 'כל הלקוחות של כל האחראיות'} · {formatMonth(keys[0])} עד {formatMonth(keys[keys.length - 1])}
          </span>
        </aside>
      </div>

      {full ? (
        <section ref={tableRef} aria-label="טבלת הגיול" className={cn(AG_CARD, 'flex flex-wrap items-center justify-between gap-[13px] p-[21px]')}>
          <span className="text-sm text-ag-muted">טבלת הגיול פתוחה במסך מלא.</span>
          <Button variant="outline" size="sm" className={AG_SECONDARY_BTN} onClick={closeFull}>
            <Minimize2Icon data-icon="inline-start" />
            יציאה ממסך מלא
          </Button>
        </section>
      ) : (
        <section ref={tableRef} aria-label="טבלת הגיול" className="aging-v2 flex min-w-0 flex-col gap-[21px] rounded-[8px] p-[13px] md:p-[21px]">
          {tableCard}
        </section>
      )}
      {full &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="טבלת הגיול במסך מלא" data-aging-full="" className="aging-v2 fixed inset-0 z-40 flex">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-[13px] px-[13px] pt-[13px] md:gap-[21px] md:px-[32px] md:pt-[21px]">{tableCard}</section>
          </div>,
          document.body,
        )}

      <Popover open={!!opened && !!openedCustomer && !!openedBucket} onOpenChange={(o) => !o && setOpened(null)}>
        <PopoverContent
          anchor={opened?.anchor}
          side="bottom"
          align="start"
          className={cn(AG_MENU, 'max-h-[min(600px,80vh)] w-[min(400px,calc(100vw-24px))] gap-0 overflow-y-auto p-0')}
        >
          {openedCustomer && openedBucket && (
            <OpenedNotes
              key={`${opened?.code}:${opened?.key}`}
              customer={openedCustomer}
              bucket={openedBucket}
              keys={keys}
              activeNotes={notesBy.get(openedCustomer.customerCode ?? '') ?? []}
              balances={data.balances.get(openedCustomer.customerCode ?? '')}
              customerId={data.customerIds.get(openedCustomer.customerCode ?? '') ?? null}
              suggestions={suggestions}
              settings={settings}
              today={today}
              authorName={scope.actorName}
            />
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}