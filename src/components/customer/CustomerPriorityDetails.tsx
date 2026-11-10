import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEntityGetAll, useEntityUpdate, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ChevronDownIcon, MailIcon, PhoneIcon } from 'lucide-react';
import { CustomerContactsEntity, GetCustomerPriorityDetailsAction } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { CustomersEntity } from '@/product-types';
import { useActionQuery } from '@/hooks/useActionQuery';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/utils/Format';

type Rec = Record<string, unknown>;
type Mirror = (typeof CustomersEntity)['instanceType'];
type Output = { record?: Rec | null; readAt?: string; error?: string };
export type FactRow = { label: string; value: ReactNode };

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Known Priority CUSTOMERS columns → Hebrew label, grouped by card. A column listed here is shown in its card only. */
const GROUPS: { tab: 'details' | 'finance'; title: string; fields: [string, string][] }[] = [
  {
    tab: 'details',
    title: 'זיהוי',
    fields: [
      ['CUSTNAME', 'קוד לקוח'],
      ['CUSTDES', 'שם לקוח'],
      ['ECUSTDES', 'שם באנגלית'],
      ['VATNUM', 'ח״פ / עוסק מורשה'],
      ['ETAXNUM', 'מספר תיק מע״מ'],
      ['WTAXNUM', 'תיק ניכויים'],
      ['CTYPECODE', 'קוד סוג לקוח'],
      ['CTYPEDES', 'סוג לקוח'],
      ['BUSINESSTYPE', 'סוג עסק'],
      ['BUSINESSTYPEDES', 'סוג עסק'],
      ['BRANCHNAME', 'סניף'],
      ['BRANCHDES', 'שם סניף'],
      ['CREATEDDATE', 'נפתח בתאריך'],
      ['STATDES', 'סטטוס'],
      ['STATUSDATE', 'תאריך סטטוס'],
      ['INACTIVEFLAG', 'לא פעיל'],
      ['ZMET_BLOCKED', 'חסום'],
    ],
  },
  {
    tab: 'details',
    title: 'כתובת והתקשרות',
    fields: [
      ['ADDRESS', 'כתובת'],
      ['ADDRESS2', 'כתובת (המשך)'],
      ['ADDRESS3', 'כתובת (המשך)'],
      ['STATE', 'עיר'],
      ['STATEA', 'עיר'],
      ['ZIP', 'מיקוד'],
      ['COUNTRYNAME', 'ארץ'],
      ['COUNTRY', 'ארץ'],
      ['PHONE', 'טלפון'],
      ['FAX', 'פקס'],
      ['EMAIL', 'דוא״ל'],
      ['HOSTNAME', 'אתר'],
      ['NAME', 'איש קשר ראשי'],
      ['CELLPHONE', 'נייד איש קשר'],
    ],
  },
  {
    tab: 'details',
    title: 'שיוך',
    fields: [
      ['AGENTCODE', 'קוד סוכן'],
      ['AGENTNAME', 'סוכן'],
      ['AGENTCODE2', 'קוד סוכן נוסף'],
      ['AGENTNAME2', 'סוכן נוסף'],
      ['ZONECODE', 'קוד אזור'],
      ['ZONEDES', 'אזור'],
      ['DISTRLINECODE', 'קו חלוקה'],
      ['DISTRLINEDES', 'קו חלוקה'],
      ['OWNERLOGIN', 'בעלים בפריוריטי'],
    ],
  },
  { tab: 'details', title: 'הערות', fields: [['CUSTREMARK', 'הערה בכרטיס']] },
  {
    tab: 'finance',
    title: 'תנאי תשלום',
    fields: [
      ['PAYCODE', 'קוד תנאי תשלום'],
      ['PAYDES', 'תנאי תשלום'],
      ['PAYDAY', 'יום תשלום'],
      ['CODE', 'מטבע'],
      ['CODEDES', 'מטבע'],
      ['PLNAME', 'מחירון'],
      ['PLDES', 'מחירון'],
      ['TAXCODE', 'קוד מס'],
    ],
  },
  {
    tab: 'finance',
    title: 'אשראי וביטוח',
    fields: [
      ['OBLIGO', 'מסגרת אובליגו'],
      ['MAX_CREDIT', 'מסגרת אשראי'],
      ['MAX_OBLIGO', 'אובליגו מרבי'],
      ['CREDITLIMIT', 'מסגרת אשראי'],
      ['ZMET_REQCREDIT', 'אשראי מבוקש'],
    ],
  },
  { tab: 'finance', title: 'בנק', fields: [] },
];

const KNOWN = new Map(GROUPS.flatMap((g) => g.fields.map(([k, l]) => [k, { label: l, group: g.title }] as const)));

/** The card a column belongs to: listed columns by the map, ZMET_ columns to credit, BANK columns to bank, the rest to extras. */
function groupOf(key: string): string | null {
  const known = KNOWN.get(key);
  if (known) return known.group;
  if (key.startsWith('ZMET_')) return 'אשראי וביטוח';
  if (key.includes('BANK') || key === 'BRANCH' || key === 'PAYACCOUNT' || key === 'IBAN') return 'בנק';
  return null;
}

const MONEY = /OBLIGO|CREDIT|INSUR|SUM|AMOUNT|LIMIT|BALANCE/;
const ZMET_LABELS: [RegExp, string][] = [
  [/INSUR.*SUM|INSUR.*AMOUNT|INSUREDSUM/, 'סכום מבוטח'],
  [/INSUR.*DATE|INSUR.*VALID/, 'תוקף ביטוח'],
  [/INSUR/, 'ביטוח אשראי'],
  [/BOARD/, 'אישור דירקטוריון'],
  [/CHAIR/, 'אישור יו״ר'],
  [/MANAGER|MNGR|CEO/, 'אישור מנכ״ל'],
  [/GUAR|ARVUT/, 'ערבות אישית'],
];

function labelOf(key: string): string {
  const known = KNOWN.get(key);
  if (known) return known.label;
  if (key.startsWith('ZMET_')) {
    const hit = ZMET_LABELS.find(([re]) => re.test(key));
    return hit ? `${hit[1]} (${key})` : key;
  }
  return key;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function formatValue(key: string, v: unknown): ReactNode {
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  const s = String(v).trim();
  if (s === 'Y') return 'כן';
  if (s === 'N') return 'לא';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatDate(s);
  const n = typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  if (n !== null && MONEY.test(key)) return <span className="tabular-nums">{ILS.format(n)}</span>;
  if (key === 'EMAIL' && s.includes('@'))
    return (
      <a href={`mailto:${s}`} dir="ltr" className="text-link hover:underline">
        {s}
      </a>
    );
  if (/PHONE|FAX/.test(key))
    return (
      <span dir="ltr" className="tabular-nums">
        {s}
      </span>
    );
  return <span className="whitespace-pre-wrap">{s}</span>;
}

function FactCard({ title, rows, children }: { title: string; rows: FactRow[]; children?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-[13px] rounded-[22px] border bg-glass-inner p-[21px]">
      <h3 className="text-sm font-bold">{title}</h3>
      {rows.length > 0 && (
        <dl className="flex flex-col divide-y divide-glass-edge">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2 text-sm">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 font-semibold break-words text-ink-2">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}

function rowsOf(record: Rec, group: string): FactRow[] {
  const listed = GROUPS.find((g) => g.title === group)?.fields.map(([k]) => k) ?? [];
  const extra = Object.keys(record)
    .filter((k) => !listed.includes(k) && groupOf(k) === group)
    .sort();
  return [...listed, ...extra].filter((k) => k in record && !isEmpty(record[k])).map((k) => ({ label: labelOf(k), value: formatValue(k, record[k]) }));
}

function useCustomerPriorityRecord(code: string) {
  const { executeFunction } = useExecuteAction(GetCustomerPriorityDetailsAction);
  const q = useActionQuery(executeFunction, { customerCode: code }, { name: 'customerPriorityDetails' });
  const out = q.data as Output | undefined;
  const record = out?.record && typeof out.record === 'object' ? out.record : null;
  const failed = q.isError || !!out?.error;
  return { isLoading: q.isLoading, record, readAt: out?.readAt, failed, message: out?.error };
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-[21px] px-[21px] pb-[21px] lg:grid-cols-2">{children}</div>;
}

function LoadingCards() {
  return (
    <Grid>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-[22px]" />
      ))}
    </Grid>
  );
}

function SourceLine({ readAt, failed, message }: { readAt?: string; failed: boolean; message?: string }) {
  if (failed)
    return (
      <div className="px-[21px] pb-[13px]">
        <Alert>
          <AlertDescription>
            {message || 'לא הצלחנו לקרוא עכשיו את כרטיס הלקוח מפריוריטי.'} מוצגים הפרטים האחרונים שסונכרנו.
          </AlertDescription>
        </Alert>
      </div>
    );
  if (!readAt) return null;
  return <p className="px-[21px] pb-[13px] text-xs text-muted-foreground">נקרא מפריוריטי · {formatDateTime(readAt)}</p>;
}

function present(rows: FactRow[]): FactRow[] {
  return rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
}

type ContactRow = (typeof CustomerContactsEntity)['instanceType'] & { id: string };

/** One contact: name, title / roles, email and phone, the הנהלת חשבונות badge, and a switch to mark it here. */
function ContactItem({ ct }: { ct: ContactRow }) {
  const { updateFunction, isLoading } = useEntityUpdate(CustomerContactsEntity);
  const [error, setError] = useState(false);
  const name = ct.contactName || [ct.firstName, ct.lastName].filter(Boolean).join(' ') || '—';
  const title = [ct.position || ct.signatureTitle, ct.roleFlags].filter(Boolean).join(' · ');
  const switchId = `ap-${ct.id}`;
  async function toggle(next: boolean) {
    setError(false);
    try {
      await updateFunction({ id: ct.id, data: { isApContact: next } });
    } catch {
      setError(true);
    }
  }
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{name}</span>
        {ct.isApContact && (
          <Badge variant="outline" className="h-5 rounded-full border-transparent bg-primary/12 px-2 text-[11px] font-semibold text-link">
            הנהלת חשבונות
          </Badge>
        )}
        <label htmlFor={switchId} className="ms-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          הנהלת חשבונות
          <Switch id={switchId} size="sm" checked={!!ct.isApContact} disabled={isLoading} onCheckedChange={(v) => toggle(v)} />
        </label>
      </div>
      {title && <span className="text-xs text-muted-foreground">{title}</span>}
      <span className="flex flex-wrap gap-x-[13px]">
        {ct.email && (
          <a href={`mailto:${ct.email}`} dir="ltr" className="flex items-center gap-1 text-sm text-link hover:underline">
            <MailIcon className="size-3.5" />
            {ct.email}
          </a>
        )}
        {ct.phone && (
          <a href={`tel:${ct.phone}`} dir="ltr" className="flex items-center gap-1 text-sm text-link hover:underline">
            <PhoneIcon className="size-3.5" />
            {ct.phone}
          </a>
        )}
      </span>
      {error && <span className="text-xs font-semibold text-critical-ink">השינוי לא נשמר. נסו שוב.</span>}
    </li>
  );
}

/** אנשי קשר: the customer's CustomerContacts rows, accounts-payable contacts first, each with its הנהלת חשבונות switch. */
function ContactsCard({ code }: { code: string }) {
  const q = useEntityGetAll(CustomerContactsEntity, { where: { column: 'customerCode', value: code }, page: { size: 200 } });
  const rows = (q.data ?? [])
    .filter((c) => !c.deletedInSource)
    .sort((a, b) => Number(!!b.isApContact) - Number(!!a.isApContact) || (a.contactName ?? '').localeCompare(b.contactName ?? '', 'he'));
  return (
    <FactCard title={q.isLoading || q.isError ? 'אנשי קשר' : `אנשי קשר (${rows.length})`} rows={[]}>
      {q.isError ? (
        <LoadError what="אנשי הקשר" />
      ) : q.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין אנשי קשר בכרטיס הלקוח.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-glass-edge">
          {rows.map((ct) => (
            <ContactItem key={ct.id} ct={ct as ContactRow} />
          ))}
        </ul>
      )}
    </FactCard>
  );
}

function ExtrasCard({ record }: { record: Rec }) {
  const [open, setOpen] = useState(false);
  const rows = Object.keys(record)
    .filter((k) => groupOf(k) === null && !isEmpty(record[k]) && record[k] !== 0 && record[k] !== '0')
    .sort()
    .map((k) => ({ label: k, value: formatValue(k, record[k]) }));
  if (rows.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-[22px] border bg-glass-inner lg:col-span-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-[21px] text-sm font-bold">
        שדות נוספים מפריוריטי ({rows.length})
        <ChevronDownIcon className={cn('size-4 transition-transform duration-150', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="grid gap-x-[21px] px-[21px] pb-[21px] md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b border-glass-edge py-2 text-sm">
              <dt className="text-muted-foreground" dir="ltr">
                {r.label}
              </dt>
              <dd className="min-w-0 font-semibold break-words text-ink-2">{r.value}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** "פרטי לקוח": the full Priority customer record (identity, address, assignment, remarks) with the contacts. */
export function CustomerDetailsTab({ code, mirror, internalNotes }: { code: string; mirror?: Mirror; internalNotes?: string | null }) {
  const p = useCustomerPriorityRecord(code);
  if (p.isLoading) return <LoadingCards />;
  const r = p.record;
  const m = mirror;
  const identity = r
    ? rowsOf(r, 'זיהוי')
    : present([
        { label: 'קוד לקוח', value: m?.customerCode },
        { label: 'שם לקוח', value: m?.customerName },
        { label: 'ח״פ', value: m?.companyId },
        { label: 'סוג לקוח', value: m?.customerType },
        { label: 'סטטוס', value: m?.priorityStatus },
      ]);
  const address = r
    ? rowsOf(r, 'כתובת והתקשרות')
    : present([
        { label: 'כתובת', value: m?.address },
        { label: 'דוא״ל', value: m?.primaryEmail },
      ]);
  const assign = r
    ? rowsOf(r, 'שיוך')
    : present([
        { label: 'קוד סוכן', value: m?.salesAgentCode },
        { label: 'סוכן', value: m?.salesAgentName },
        { label: 'בעלים בפריוריטי', value: m?.priorityOwner },
      ]);
  const remarks = r ? rowsOf(r, 'הערות') : [];
  if (internalNotes) remarks.push({ label: 'הערות פנימיות', value: <span className="whitespace-pre-wrap">{internalNotes}</span> });
  return (
    <>
      <SourceLine readAt={p.readAt} failed={p.failed} message={p.message} />
      <Grid>
        {identity.length > 0 && <FactCard title="זיהוי" rows={identity} />}
        {address.length > 0 && <FactCard title="כתובת והתקשרות" rows={address} />}
        {assign.length > 0 && <FactCard title="שיוך" rows={assign} />}
        <ContactsCard code={code} />
        {remarks.length > 0 && <FactCard title="הערות" rows={remarks} />}
        {r && <ExtrasCard record={r} />}
      </Grid>
    </>
  );
}

/** The finance tab's detail cards: payment terms, credit & insurance and bank from Priority (the debt summary sits above them). */
export function CustomerFinanceTab({ code, mirror }: { code: string; mirror?: Mirror }) {
  const p = useCustomerPriorityRecord(code);
  if (p.isLoading) return <LoadingCards />;
  const r = p.record;
  const m = mirror;
  const terms = r
    ? rowsOf(r, 'תנאי תשלום')
    : present([
        { label: 'תנאי תשלום', value: m?.paymentTermsLabel },
        { label: 'קוד תנאי תשלום', value: m?.paymentTermsCode },
        { label: 'אמצעי תשלום', value: m?.paymentMethod },
      ]);
  const credit = r
    ? rowsOf(r, 'אשראי וביטוח')
    : present([
        { label: 'מסגרת אשראי', value: typeof m?.creditLimit === 'number' ? ILS.format(m.creditLimit) : null },
        { label: 'מסגרת אובליגו', value: typeof m?.obligoLimit === 'number' ? ILS.format(m.obligoLimit) : null },
        { label: 'ביטוח אשראי בפריוריטי', value: typeof m?.creditInsuredAmount === 'number' ? ILS.format(m.creditInsuredAmount) : null },
      ]);
  const bank = r ? rowsOf(r, 'בנק') : [];
  return (
    <>
      <SourceLine readAt={p.readAt} failed={p.failed} message={p.message} />
      <Grid>
        {terms.length > 0 && <FactCard title="תנאי תשלום" rows={terms} />}
        {credit.length > 0 && <FactCard title="אשראי וביטוח" rows={credit} />}
        {bank.length > 0 && <FactCard title="בנק" rows={bank} />}
      </Grid>
    </>
  );
}