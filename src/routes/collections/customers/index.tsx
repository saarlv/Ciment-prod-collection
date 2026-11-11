import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import { CreditCoversEntity, CustomerExposureEntity, CustomersEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { ObligoBar } from '@/components/ObligoBar';
import { useNinaActivity } from '@/hooks/useNinaActivity';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRouteUrl } from '@/lib/platform';
import { formatDate, formatILS, formatNumber } from '@/utils/Format';

const STAGES = ['תקין', 'תזכורת', 'פנייה שנייה', 'שיחה', 'הוסלם למנהל'];
const OBLIGO_BANDS = [
  { value: 'insured', label: 'מבוטחים' },
  { value: 'under80', label: 'סטטי מתחת ל־80%' },
  { value: 'over80', label: 'סטטי 80% ומעלה' },
  { value: 'uninsured', label: 'ללא ביטוח' },
];

/** Internal accounts in Priority (1000xx) — hidden unless asked for. */
const INTERNAL_CODE = /^1000\d{2}$/;

type Cover = (typeof CreditCoversEntity)['instanceType'];

/** Activity columns of a Customers row (calc, RefreshCustomerAggregates) — null until the aggregates first run. */
type Activity = { count: number | null; last: string | null; debt: number | null };

const ILS2 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRIORITY_STATUSES = ['פעיל', 'לא פעיל', 'חסום', 'זמני', 'חסום BDI', 'בטיפול', 'פעיל-ח.ניירת', 'חס-חסר ניירת'];
const PAGE_SIZE = 50;
const PILL = 'h-8 rounded-[16px] px-3 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill';
const RECENCY = [
  { value: '12', label: 'מסמך ב־12 חודשים' },
  { value: '24', label: 'מסמך ב־24 חודשים' },
];
const SORTS = [
  { value: 'last', label: 'מיון: מסמך אחרון' },
  { value: 'name', label: 'מיון: שם' },
  { value: 'count', label: 'מיון: מספר מסמכים' },
  { value: 'debt', label: 'מיון: חוב פעיל' },
];

function activityByCode(rows: (typeof CustomersEntity)['instanceType'][]): Map<string, Activity> {
  const out = new Map<string, Activity>();
  for (const r of rows) {
    if (!r.customerCode) continue;
    const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    out.set(r.customerCode, { count: num(r.documentCount), last: r.lastDocumentDate ? r.lastDocumentDate.slice(0, 10) : null, debt: num(r.openBalance) });
  }
  return out;
}

function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function StatusFilter({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const label = selected.length === 0 ? 'כל הסטטוסים' : selected.length === 1 ? selected[0] : `${selected.length} סטטוסים`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="w-40 justify-between" />}>
        <span className="truncate">{label}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuGroup>
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o}
              checked={selected.includes(o)}
              closeOnClick={false}
              onCheckedChange={(on) => onChange(on ? [...selected, o] : selected.filter((x) => x !== o))}
            >
              {o}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={selected.length === 0} onClick={() => onChange([])}>
            כל הסטטוסים
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The cover that counts: the newest in תקף (the same rule GetCreditExposure uses for the use %). */
function validCoverByCustomer(covers: Cover[]): Map<string, Cover> {
  const byCode = new Map<string, Cover>();
  for (const c of covers) {
    if (!c.customerCode || c.status !== 'תקף') continue;
    const prev = byCode.get(c.customerCode);
    if (!prev || (c.validUntil ?? '') > (prev.validUntil ?? '')) byCode.set(c.customerCode, c);
  }
  return byCode;
}

function FilterSelect({
  items,
  value,
  onChange,
  className,
}: {
  items: { label: string; value: string | null }[];
  value: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange((v as string | null) ?? null)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((i) => (
            <SelectItem key={i.value ?? 'all'} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const scope = useOwnerScope();
  const nina = useNinaActivity();
  const { data, isLoading, isError } = useEntityGetAll(CustomersEntity, {
    orderBy: [{ column: 'customerName', direction: 'asc' }],
  });
  const activity = activityByCode(data ?? []);
  const coversQ = useEntityGetAll(CreditCoversEntity);
  const exposureQ = useEntityGetAll(CustomerExposureEntity);
  const insuredCodes = new Set((coversQ.data ?? []).map((c) => c.customerCode).filter((c): c is string => !!c));
  const validCover = validCoverByCustomer(coversQ.data ?? []);
  const staticObligo = new Map((exposureQ.data ?? []).map((e) => [e.customerCode ?? '', e.obligoTotal]));
  /** Static obligo (as in Priority) against the insured amount of the valid cover; null without one. */
  const staticPct = (code?: string): number | null => {
    const cover = code ? validCover.get(code) : undefined;
    const obligo = code ? staticObligo.get(code) : undefined;
    if (!cover?.insuredAmount || obligo === undefined || obligo === null) return null;
    return Math.round((obligo / cover.insuredAmount) * 1000) / 10;
  };
  // The search box is driven by `?q=` so the top-bar customer search lands here pre-filtered.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  function setSearch(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }
  const [page, setPage] = useState(1);
  /** Every filter change starts again from the first page. */
  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }
  const [stage, setStage] = useState<string | null>(null);
  const [bookkeeper, setBookkeeper] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [showInternal, setShowInternal] = useState(false);
  const [scopeAll, setScopeAll] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [agent, setAgent] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [recency, setRecency] = useState<string | null>(null);
  const [sort, setSort] = useState<string>('last');

  const all = (data ?? []).filter((c) => scope.isVisible(c.customerCode, c.assignedBookkeeperName) && (showInternal || !INTERNAL_CODE.test(c.customerCode ?? '')));
  const bookkeepers = [
    ...new Set(all.map((c) => scope.ownerOf(c.customerCode, c.assignedBookkeeperName)).filter((n): n is string => !!n)),
  ].sort();
  const actOf = (code?: string) => (code ? activity.get(code) : undefined);
  // Before the aggregates first run the count is unknown: keep the customer in view rather than hide everyone.
  const hasActivity = (code?: string) => {
    const count = actOf(code)?.count;
    return count === null || count === undefined || count > 0;
  };
  const activeCount = all.filter((c) => hasActivity(c.customerCode)).length;
  const agents = [...new Set(all.map((c) => c.salesAgentName).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'he'));
  const termsList = [...new Set(all.map((c) => c.paymentTermsLabel).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'he'));
  const statusOptions = [...PRIORITY_STATUSES, ...new Set(all.map((c) => c.priorityStatus).filter((s): s is NonNullable<typeof s> => !!s && !PRIORITY_STATUSES.includes(s)))];
  const recencyFrom = recency ? monthsAgoISO(Number(recency)) : null;
  const q = search.trim().toLowerCase();
  // A search always looks through every customer, with documents or without.
  const filtered = all.filter((c) => {
    const act = actOf(c.customerCode);
    if (q) {
      if (!`${c.customerName ?? ''} ${c.customerCode ?? ''} ${c.companyId ?? ''}`.toLowerCase().includes(q)) return false;
    } else {
      if (!scopeAll && !hasActivity(c.customerCode)) return false;
      if (recencyFrom && (!act?.last || act.last < recencyFrom)) return false;
    }
    if (statuses.length > 0 && !statuses.includes(c.priorityStatus ?? '')) return false;
    if (agent && c.salesAgentName !== agent) return false;
    if (terms && c.paymentTermsLabel !== terms) return false;
    if (stage && c.collectionStage !== stage) return false;
    if (bookkeeper && scope.ownerOf(c.customerCode, c.assignedBookkeeperName) !== bookkeeper) return false;
    const p = staticPct(c.customerCode);
    const isInsured = !!c.customerCode && insuredCodes.has(c.customerCode);
    if (band === 'insured' && !isInsured) return false;
    if (band === 'uninsured' && isInsured) return false;
    if (band === 'under80' && (p === null || p >= 80)) return false;
    if (band === 'over80' && (p === null || p < 80)) return false;
    return true;
  });
  const rows = [...filtered].sort((a, b) => {
    if (sort === 'name') return (a.customerName ?? '').localeCompare(b.customerName ?? '', 'he');
    const x = actOf(a.customerCode);
    const y = actOf(b.customerCode);
    if (sort === 'debt') return (y?.debt ?? -Infinity) - (x?.debt ?? -Infinity) || (a.customerName ?? '').localeCompare(b.customerName ?? '', 'he');
    if (sort === 'count') return (y?.count ?? 0) - (x?.count ?? 0) || (a.customerName ?? '').localeCompare(b.customerName ?? '', 'he');
    return (y?.last ?? '').localeCompare(x?.last ?? '') || (a.customerName ?? '').localeCompare(b.customerName ?? '', 'he');
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, rows.length);
  const loading = isLoading || scope.isLoading;
  const overThreshold = all.filter((c) => (staticPct(c.customerCode) ?? 0) >= 80).length;
  const escalated = all.filter((c) => c.collectionStage === 'הוסלם למנהל').length;

  return (
    <>
      <PageHeader title="לקוחות" description="כל לקוחות האשראי, שלב הגבייה וניצול הביטוח — מסונכרן מפריוריטי." />
      {isError ? (
        <LoadError what="רשימת הלקוחות" />
      ) : (
        <>
          <AgentPanel
            headline={
              isLoading || scope.isLoading ? (
                <Skeleton className="h-7 w-80 max-w-full" />
              ) : all.length === 0 ? (
                'רשימת הלקוחות עדיין ריקה'
              ) : (
                `${all.length} לקוחות במעקב${scope.bookkeeperFilter ? ` של ${scope.bookkeeperFilter}` : ''}: ${overThreshold} באובליגו סטטי של 80% ומעלה מהמסגרת המבוטחת, ${escalated} הוסלמו למנהל`
              )
            }
            description={nina.summary}
          />
          <Card className="glass glass-lift border">
            <CardHeader className="flex flex-row flex-wrap items-center gap-[13px]">
              <ToggleGroup
                aria-label="אילו לקוחות"
                value={[scopeAll ? 'all' : 'active']}
                onValueChange={(v) => {
                  if (v[0]) reset(setScopeAll)(v[0] === 'all');
                }}
                className="gap-0.5 rounded-[20px] bg-glass-card p-1"
              >
                <ToggleGroupItem value="active" className={PILL}>
                  עם פעילות
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className={PILL}>
                  הכל
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="relative w-full max-w-72">
                <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="חיפוש לפי שם, קוד לקוח או ח״פ"
                  className="ps-8"
                />
              </div>
              <FilterSelect
                className="w-40"
                value={stage}
                onChange={reset(setStage)}
                items={[{ label: 'כל השלבים', value: null }, ...STAGES.map((s) => ({ label: s, value: s }))]}
              />
              <FilterSelect
                className="w-44"
                value={bookkeeper}
                onChange={reset(setBookkeeper)}
                items={[{ label: 'כל האחראיות', value: null }, ...bookkeepers.map((b) => ({ label: b, value: b }))]}
              />
              <FilterSelect
                className="w-40"
                value={band}
                onChange={reset(setBand)}
                items={[{ label: 'כל רמות הביטוח', value: null }, ...OBLIGO_BANDS]}
              />
              <StatusFilter options={statusOptions} selected={statuses} onChange={reset(setStatuses)} />
              <FilterSelect
                className="w-40"
                value={agent}
                onChange={reset(setAgent)}
                items={[{ label: 'כל הסוכנים', value: null }, ...agents.map((a) => ({ label: a, value: a }))]}
              />
              <FilterSelect
                className="w-40"
                value={terms}
                onChange={reset(setTerms)}
                items={[{ label: 'כל תנאי התשלום', value: null }, ...termsList.map((t) => ({ label: t, value: t }))]}
              />
              <FilterSelect
                className="w-44"
                value={recency}
                onChange={reset(setRecency)}
                items={[{ label: 'מסמך אחרון: הכל', value: null }, ...RECENCY]}
              />
              <FilterSelect className="w-44" value={sort} onChange={(v) => reset(setSort)(v ?? 'last')} items={SORTS} />
              <div className="flex items-center gap-2">
                <Switch id="show-internal" checked={showInternal} onCheckedChange={reset(setShowInternal)} />
                <Label htmlFor="show-internal" className="text-[13px]">הצג חשבונות פנימיים</Label>
              </div>
              <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                {q || scopeAll || statuses.length || agent || terms || recency || stage || bookkeeper || band ? `${formatNumber(rows.length)} מתאימים · ` : ''}
                {formatNumber(activeCount)} עם פעילות · {formatNumber(all.length)} בסך הכל
              </span>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <LoadingRows />
              ) : all.length === 0 ? (
                <AgentEmpty title="אין לקוחות עדיין">
                  הלקוחות יגיעו לכאן מפריוריטי אחרי החיבור, וסוכנת הגבייה תתחיל לעקוב אחרי כל אחד מהם.
                </AgentEmpty>
              ) : (
                <Table className="min-w-[1300px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-4">לקוח</TableHead>
                      <TableHead>שלב גבייה</TableHead>
                      <TableHead>אחראית</TableHead>
                      <TableHead>סוכן</TableHead>
                      <TableHead>תנאים</TableHead>
                      <TableHead>חוב פעיל</TableHead>
                      <TableHead>מסמכים</TableHead>
                      <TableHead>מסמך אחרון</TableHead>
                      <TableHead className="w-48">ניצול ביטוח · סטטי</TableHead>
                      <TableHead>מסגרת אשראי</TableHead>
                      <TableHead className="pe-4">תשלום אחרון</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => c.customerCode && navigate(getRouteUrl('collections/customers/:code', { code: c.customerCode }))}
                      >
                        <TableCell className="ps-4">
                          <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <CustomerLink code={c.customerCode} name={c.customerName} />
                            <span className="text-xs text-muted-foreground">
                              {c.customerCode}
                              {c.priorityStatus && c.priorityStatus !== 'פעיל' && ` · ${c.priorityStatus}`}
                            </span>
                            {!hasActivity(c.customerCode) && (
                              <Badge variant="outline" className="mt-0.5 h-5 self-start rounded-full border-transparent bg-glass-inner px-2 text-[11px] font-semibold text-muted-foreground">
                                ללא מסמכים
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={c.collectionStage} />
                        </TableCell>
                        <TableCell>{scope.ownerOf(c.customerCode, c.assignedBookkeeperName) ?? '—'}</TableCell>
                        <TableCell>{c.salesAgentName || '—'}</TableCell>
                        <TableCell>{c.paymentTermsLabel ?? (c.paymentTermsDays ? `שוטף+${c.paymentTermsDays}` : '—')}</TableCell>
                        <TableCell className="font-semibold tabular-nums">{actOf(c.customerCode)?.debt == null ? '—' : ILS2.format(actOf(c.customerCode)?.debt ?? 0)}</TableCell>
                        <TableCell className="tabular-nums">{actOf(c.customerCode)?.count ? formatNumber(actOf(c.customerCode)?.count) : '—'}</TableCell>
                        <TableCell className="tabular-nums">{formatDate(actOf(c.customerCode)?.last)}</TableCell>
                        <TableCell>
                          {coversQ.isLoading || exposureQ.isLoading ? (
                            <Skeleton className="h-2 w-full" />
                          ) : staticPct(c.customerCode) !== null ? (
                            <ObligoBar pct={staticPct(c.customerCode)} />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {c.customerCode && insuredCodes.has(c.customerCode) ? 'אין מכסה בתוקף' : 'ללא ביטוח'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatILS(c.creditLimit)}</TableCell>
                        <TableCell className="pe-4">{formatDate(c.lastPaymentDate)}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                          אין לקוחות שמתאימים לסינון.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {!loading && rows.length > PAGE_SIZE && (
              <CardFooter className="flex flex-wrap items-center justify-between gap-[13px]">
                <span className="text-xs text-muted-foreground tabular-nums">
                  מציג {formatNumber(from)}–{formatNumber(to)} מתוך {formatNumber(rows.length)}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-full" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    <ChevronRightIcon data-icon="inline-start" />
                    הקודם
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    עמוד {currentPage} מתוך {pageCount}
                  </span>
                  <Button variant="outline" size="sm" className="rounded-full" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                    הבא
                    <ChevronLeftIcon data-icon="inline-end" />
                  </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </>
      )}
    </>
  );
}