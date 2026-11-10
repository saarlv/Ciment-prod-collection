import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { SearchIcon } from 'lucide-react';
import { CreditCoversEntity, CustomerExposureEntity, CustomersEntity } from '@/product-types';
import { AgentPanel } from '@/components/AgentPanel';
import { CustomerLink } from '@/components/CustomerLink';
import { ObligoBar } from '@/components/ObligoBar';
import { useNinaActivity } from '@/hooks/useNinaActivity';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRouteUrl } from '@/lib/platform';
import { formatDate, formatILS } from '@/utils/Format';

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
  const [stage, setStage] = useState<string | null>(null);
  const [bookkeeper, setBookkeeper] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [showInternal, setShowInternal] = useState(false);

  const all = (data ?? []).filter((c) => scope.isVisible(c.customerCode, c.assignedBookkeeperName) && (showInternal || !INTERNAL_CODE.test(c.customerCode ?? '')));
  const bookkeepers = [
    ...new Set(all.map((c) => scope.ownerOf(c.customerCode, c.assignedBookkeeperName)).filter((n): n is string => !!n)),
  ].sort();
  const q = search.trim().toLowerCase();
  const rows = all.filter((c) => {
    if (q && !`${c.customerName ?? ''} ${c.customerCode ?? ''}`.toLowerCase().includes(q)) return false;
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
              <div className="relative w-full max-w-72">
                <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם או קוד לקוח"
                  className="ps-8"
                />
              </div>
              <FilterSelect
                className="w-40"
                value={stage}
                onChange={setStage}
                items={[{ label: 'כל השלבים', value: null }, ...STAGES.map((s) => ({ label: s, value: s }))]}
              />
              <FilterSelect
                className="w-44"
                value={bookkeeper}
                onChange={setBookkeeper}
                items={[{ label: 'כל האחראיות', value: null }, ...bookkeepers.map((b) => ({ label: b, value: b }))]}
              />
              <FilterSelect
                className="w-40"
                value={band}
                onChange={setBand}
                items={[{ label: 'כל רמות הביטוח', value: null }, ...OBLIGO_BANDS]}
              />
              <div className="flex items-center gap-2">
                <Switch id="show-internal" checked={showInternal} onCheckedChange={setShowInternal} />
                <Label htmlFor="show-internal" className="text-[13px]">הצג חשבונות פנימיים</Label>
              </div>
              <span className="ms-auto text-xs text-muted-foreground">{rows.length} לקוחות</span>
            </CardHeader>
            <CardContent className="px-0">
              {isLoading || scope.isLoading ? (
                <LoadingRows />
              ) : all.length === 0 ? (
                <AgentEmpty title="אין לקוחות עדיין">
                  הלקוחות יגיעו לכאן מפריוריטי אחרי החיבור, וסוכנת הגבייה תתחיל לעקוב אחרי כל אחד מהם.
                </AgentEmpty>
              ) : (
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-4">לקוח</TableHead>
                      <TableHead>שלב גבייה</TableHead>
                      <TableHead>אחראית</TableHead>
                      <TableHead>תנאים</TableHead>
                      <TableHead className="w-48">ניצול ביטוח · סטטי</TableHead>
                      <TableHead>מסגרת אשראי</TableHead>
                      <TableHead className="pe-4">תשלום אחרון</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
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
                              {c.priorityStatus === 'חסום' && ' · חסום בפריוריטי'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={c.collectionStage} />
                        </TableCell>
                        <TableCell>{scope.ownerOf(c.customerCode, c.assignedBookkeeperName) ?? '—'}</TableCell>
                        <TableCell>{c.paymentTermsLabel ?? (c.paymentTermsDays ? `שוטף+${c.paymentTermsDays}` : '—')}</TableCell>
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
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          אין לקוחות שמתאימים לסינון.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}