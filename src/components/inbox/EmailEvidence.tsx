import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useEntityGetAll, useExecuteAction } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, FolderOpenIcon, LandmarkIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react';
import { AnalyzePriceGapAction, BankLinesEntity, DeliveryNotesEntity, InvoicesEntity, ProductLineContactsEntity } from '@/product-types';
import { StatusBadge } from '@/components/StatusBadge';
import { PriceEvidence } from '@/components/disputes/PriceCase';
import { useActionQuery } from '@/hooks/useActionQuery';
import { useReceiptLineLinks } from '@/hooks/useReceiptLineLinks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getRouteUrl } from '@/lib/platform';
import { countDocs, disputeTone, invoicesOf, isPriceGapResult } from '@/utils/Disputes';
import type { DeliveryNote, Dispute, InvoiceRow, PriceGapResult } from '@/utils/Disputes';
import { formatDate, formatILS } from '@/utils/Format';
import type { InboundEmail } from '@/utils/Inbox';

export function PanelSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function CaseLink({ d }: { d: Dispute }) {
  return (
    <Link
      to={getRouteUrl('collections/disputes/:disputeId', { disputeId: d.id })}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-link hover:underline"
    >
      <FolderOpenIcon className="size-4" />
      דף המקרה {d.disputeNumber ?? ''}
      <ArrowUpLeftIcon className="size-3.5" />
    </Link>
  );
}

/** Type 3: the scan counter of each documents case, the logistics contact with phone, WhatsApp (not active yet). */
export function DocumentsSide({ disputes }: { disputes: Dispute[] }) {
  const invs = [...new Set(disputes.flatMap(invoicesOf))];
  const lines = [...new Set(disputes.map((d) => d.productLine).filter((p): p is string => !!p))];
  const notesQ = useEntityGetAll(DeliveryNotesEntity, { where: { column: 'invoiceNumber', operator: 'in', value: invs } }, { enabled: invs.length > 0 });
  const invoicesQ = useEntityGetAll(InvoicesEntity, { where: { column: 'invoiceNumber', operator: 'in', value: invs } }, { enabled: invs.length > 0 });
  const contactsQ = useEntityGetAll(ProductLineContactsEntity, { where: { column: 'productLine', operator: 'in', value: lines } }, { enabled: lines.length > 0 });
  const notes = (notesQ.data ?? []) as DeliveryNote[];
  const invoices = (invoicesQ.data ?? []) as InvoiceRow[];

  if (disputes.length === 0)
    return <p className="text-[13px] text-muted-foreground">לא נפתח מקרה תעודות מהמייל הזה (לרוב: אין מספרי חשבוניות מאומתים של הלקוח; הטיוטה מבקשת אותם).</p>;

  return (
    <div className="flex flex-col gap-[13px]">
      {disputes.map((d) => {
        const count = countDocs(invoicesOf(d), invoices, notes);
        const contact = (contactsQ.data ?? []).find((c) => c.productLine === d.productLine && c.active !== false);
        const loading = notesQ.isLoading || invoicesQ.isLoading;
        return (
          <div key={d.id} className="glass-inner flex flex-col gap-[13px] p-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">חשבונית {invoicesOf(d).join(', ') || '—'}</span>
              <StatusBadge value={d.status} tone={disputeTone(d.status)} />
              <span className="ms-auto">
                <CaseLink d={d} />
              </span>
            </div>
            <div className="flex items-end gap-[13px]">
              {loading ? (
                <Skeleton className="h-10 w-20" />
              ) : (
                <span dir="ltr" className="text-[34px] leading-none font-extrabold tabular-nums">
                  {count.scanned}/{count.expected}
                </span>
              )}
              <span className="pb-1 text-[13px] text-muted-foreground">תעודות סרוקות</span>
            </div>
            {notesQ.isError ? (
              <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את תעודות המשלוח.</p>
            ) : (
              count.missing.length > 0 && <p className="text-[13px]">חסרות: <span dir="ltr">{count.missing.join(', ')}</span></p>
            )}
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-xs text-muted-foreground">לוגיסטיקה · קו מוצר {d.productLine || '—'}</span>
              {contactsQ.isLoading ? (
                <Skeleton className="h-4 w-48" />
              ) : contact || d.logisticsOwnerName ? (
                <div className="flex flex-wrap items-center gap-x-[13px] gap-y-1">
                  <span className="font-semibold">{contact?.logisticsOwnerName || d.logisticsOwnerName}</span>
                  {(contact?.email || d.logisticsOwnerEmail) && <span dir="ltr">{contact?.email || d.logisticsOwnerEmail}</span>}
                  {contact?.phone ? (
                    <a href={`tel:${contact.phone}`} dir="ltr" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                      <PhoneIcon className="size-3.5" />
                      {contact.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">אין טלפון רשום</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">אין איש לוגיסטיקה רשום לקו המוצר. מוסיפים אותו בהגדרות → תפקידים.</span>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" disabled>
                  <MessageCircleIcon data-icon="inline-start" />
                  WhatsApp
                </Button>
                <span className="text-xs text-muted-foreground">לא פעיל עדיין</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Type 4: the per-line gap analysis and the two approvals with evidence, per price case. */
function PriceCaseBlock({ d }: { d: Dispute }) {
  const invs = invoicesOf(d);
  const { executeFunction: analyze } = useExecuteAction(AnalyzePriceGapAction);
  const gap = useActionQuery(analyze, { invoiceNumber: invs[0] ?? '', dryRun: true }, { enabled: invs.length > 0, cache: 'priceGap', validate: isPriceGapResult });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">
          חשבונית {invs.join(', ') || '—'} · פער {formatILS((gap.data as PriceGapResult | undefined)?.totalGap ?? d.disputedAmount)}
        </span>
        <StatusBadge value={d.status} tone={disputeTone(d.status)} />
        <span className="ms-auto">
          <CaseLink d={d} />
        </span>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <PriceEvidence
          dispute={d}
          gap={{ data: gap.data as PriceGapResult | undefined, isLoading: gap.isLoading, isError: gap.isError, isRefreshing: gap.isRefreshing }}
          onMarked={gap.refresh}
        />
      </div>
    </div>
  );
}

export function PriceSide({ disputes }: { disputes: Dispute[] }) {
  if (disputes.length === 0)
    return <p className="text-[13px] text-muted-foreground">לא נפתח מקרה מחיר מהמייל הזה (אין פער מול המחירון, או שחסר מספר חשבונית מאומת של הלקוח).</p>;
  return (
    <div className="flex flex-col gap-[21px]">
      {disputes.map((d) => (
        <PriceCaseBlock key={d.id} d={d} />
      ))}
    </div>
  );
}

/** Type 5: the receipts record of the transfer(s) this payment detail belongs to. */
export function RemittanceSide({ email }: { email: InboundEmail }) {
  const explicit = [email.bankLineId, email.linkedTable === 'BankLines' ? email.linkedId : null].filter((x): x is string => !!x);
  const customerLines = useEntityGetAll(
    BankLinesEntity,
    { where: { column: 'customerCode', value: email.customerCode ?? '' }, orderBy: [{ column: 'valueDate', direction: 'desc' }], page: { size: 8 } },
    { enabled: !!email.customerCode },
  );
  const fromCustomer = (customerLines.data ?? []).map((l) => l.bankLineId).filter((x): x is string => !!x);
  const links = useReceiptLineLinks([...explicit, ...fromCustomer]);
  const shown = [...new Set([...explicit, ...fromCustomer])];

  if (!email.customerCode && explicit.length === 0)
    return <p className="text-[13px] text-muted-foreground">הלקוח לא זוהה, ולכן הפירוט לא שויך לשורת בנק. קודם מקשרים לקוח (משימה אצל האחראית).</p>;
  if (customerLines.isLoading || links.isLoading) return <Skeleton className="h-24 w-full rounded-[22px]" />;
  if (customerLines.isError || links.isError) return <p className="text-[13px] text-muted-foreground">לא הצלחנו לטעון את שורות הבנק של הלקוח.</p>;
  if (shown.length === 0)
    return (
      <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
        <p>אין עדיין שורת בנק של הלקוח. הפירוט שויך ללקוח, וכשהתקבול ייקלט בתקבולים הוא ייבדק מולו.</p>
        <Link to="/collections/receipts" className="font-semibold text-link hover:underline">
          למסך התקבולים
        </Link>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((id) => {
        const l = links.lines.find((x) => x.bankLineId === id) ?? (customerLines.data ?? []).find((x) => x.bankLineId === id);
        return (
          <li key={id} className="glass-inner flex flex-wrap items-center gap-[13px] p-[13px]">
            <LandmarkIcon className="size-4 text-muted-foreground" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold tabular-nums">
                {formatILS(l?.amount)} · {formatDate(l?.valueDate)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {l?.payerName || '—'}
                {explicit.includes(id) ? ' · קושר למייל הזה' : ''}
              </span>
            </div>
            <StatusBadge value={l?.status} />
            {links.href(id) && (
              <Link to={links.href(id) ?? ''} className="ms-auto inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
                הרשומה בתקבולים
                <ArrowUpLeftIcon className="size-3.5" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}