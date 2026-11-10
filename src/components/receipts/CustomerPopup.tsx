import { useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { getRouteUrl, useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { ArrowUpLeftIcon, MailIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import { BankAliasesEntity, CustomerContactsEntity, CustomersEntity, InvoicesEntity, CustomerNotesEntity, ReceiptAllocationsEntity, ReceiptsEntity } from '@/product-types';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { InvoiceNumberLink } from '@/components/receipts/InvoicePopup';
import { ReceiptStatusBadges } from '@/components/receipts/ReceiptStatusBadges';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { HIDDEN_DOC_STATUSES, daysOverdue, formatDate, formatForeignExtra, formatILS, formatMoney, formatNumber, isILS, round2 } from '@/utils/Format';
import { Switch } from '@/components/ui/switch';
import { RECEIPT_APPROVED, RECEIPT_ISSUED } from '@/utils/ReceiptRecord';

const HEAD = 'h-8 text-xs font-semibold text-muted-foreground';
const stop = (e: SyntheticEvent) => e.stopPropagation();

function Block({ title, count, children, className }: { title: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('flex min-w-0 flex-col gap-2 rounded-[22px] bg-glass-inner p-[13px]', className)}>
      <h3 className="text-[13px] font-bold">
        {title}
        {count !== undefined && <span className="font-medium text-muted-foreground"> ({formatNumber(count)})</span>}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px] font-semibold text-ink-2">{children}</dd>
    </div>
  );
}

function ContactLine({ icon: Icon, value, ltr }: { icon: typeof MailIcon; value?: string | null; ltr?: boolean }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      <span dir={ltr ? 'ltr' : undefined}>{value}</span>
    </span>
  );
}

/**
 * "כרטיס לקוח – מה שחשוב לתקבולים": not the whole 360, only what verifying a receipt needs — identity and
 * terms, the approved bank names, the accounts contact, open invoices with what is overdue, open commitments,
 * and the last approved receipts. A clear link leads to the full card. Every read filters by customerCode.
 */
function HiddenToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
      הצג מבוטלות וטיוטות
    </label>
  );
}

export function CustomerPopup({ customerCode, onClose }: { customerCode: string; onClose: () => void }) {
  const scope = useOwnerScope();
  const byCode = { column: 'customerCode', value: customerCode };
  const customer = useEntityGetAll(CustomersEntity, { where: byCode });
  const aliases = useEntityGetAll(BankAliasesEntity, { where: byCode });
  const contacts = useEntityGetAll(CustomerContactsEntity, { where: byCode });
  const invoices = useEntityGetAll(InvoicesEntity, {
    where: { and: [byCode, { column: 'openAmount', operator: '>', value: 0 }] },
    orderBy: [{ column: 'dueDate', direction: 'asc' }],
  });
  const commitmentRows = useEntityGetAll(CustomerNotesEntity, {
    where: { and: [byCode, { column: 'noteType', value: 'התחייבות לתשלום' }, { column: 'status', value: 'פעילה' }] },
    orderBy: [{ column: 'actionDate', direction: 'asc' }],
  });
  // Open commitments: active and not kept yet (the aging report's rule).
  const commitments = (commitmentRows.data ?? []).filter((n) => n.outcome !== 'קוימה');
  const receipts = useEntityGetAll(ReceiptsEntity, {
    where: { and: [byCode, { column: 'receiptStatus', operator: 'in', value: [RECEIPT_APPROVED, RECEIPT_ISSUED] }] },
    orderBy: [{ column: 'valueDate', direction: 'desc' }],
    page: { size: 5 },
  });

  const c = customer.data?.[0];
  const aliasRows = (aliases.data ?? []).filter((a) => a.status === 'מאושר' || a.status === 'מוצע');
  const [showHidden, setShowHidden] = useState(false);
  const allOpen = invoices.data ?? [];
  const hiddenCount = allOpen.filter((i) => HIDDEN_DOC_STATUSES.includes(i.priorityDocStatus ?? '')).length;
  const openRows = showHidden ? allOpen : allOpen.filter((i) => !HIDDEN_DOC_STATUSES.includes(i.priorityDocStatus ?? ''));
  const ilsRows = openRows.filter((i) => isILS(i.currencyCode));
  const totalOpen = round2(ilsRows.reduce((s, i) => s + (i.openAmount ?? 0), 0));
  const totalOverdue = round2(ilsRows.filter((i) => (daysOverdue(i.dueDate) ?? 0) > 0).reduce((s, i) => s + (i.openAmount ?? 0), 0));
  const foreignExtra = formatForeignExtra(openRows.map((i) => ({ amount: i.openAmount, currencyCode: i.currencyCode })));
  const lastReceipts = (receipts.data ?? []).slice(0, 5);
  const lastKeys = lastReceipts.map((r) => r.receiptKey ?? '').filter(Boolean);
  const allocations = useEntityGetAll(ReceiptAllocationsEntity, { where: { column: 'receiptKey', operator: 'in', value: lastKeys } }, { enabled: lastKeys.length > 0 });
  const terms = c?.paymentTermsLabel || (c?.paymentTermsDays ? `שוטף+${c.paymentTermsDays}` : '—');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-menu flex max-h-[88vh] w-[92vw] max-w-[1000px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1000px]">
        <DialogHeader className="flex flex-row flex-wrap items-end justify-between gap-[13px] border-b border-glass-edge px-[21px] py-[13px] pe-14">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold text-muted-foreground">כרטיס לקוח – מה שחשוב לתקבולים</span>
            <DialogTitle className="text-xl leading-tight font-bold">{c?.customerName ?? customerCode}</DialogTitle>
            <DialogDescription className="text-xs">
              <span dir="ltr">{customerCode}</span>
              {c?.priorityStatus ? ` · ${c.priorityStatus}` : ''}
            </DialogDescription>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="rounded-full"
            render={<Link to={getRouteUrl('collections/customers/:code', { code: customerCode })} />}
          >
            לכרטיס הלקוח המלא
            <ArrowUpLeftIcon data-icon="inline-end" />
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-[13px] overflow-y-auto p-[21px]">
          {customer.isError ? (
            <LoadError what="כרטיס הלקוח" />
          ) : customer.isLoading ? (
            <LoadingRows rows={2} />
          ) : !c ? (
            <p className="text-[13px] text-muted-foreground">הלקוח <span dir="ltr">{customerCode}</span> לא נמצא ברשימת הלקוחות שנטענה מ-Priority.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-[21px] gap-y-[13px] rounded-[22px] bg-glass-inner p-[13px] sm:grid-cols-4">
              <Fact label="ח״פ">
                <span dir="ltr">{c.companyId || '—'}</span>
              </Fact>
              <Fact label="אחראית">{scope.ownerOf(customerCode, c.assignedBookkeeperName) ?? '—'}</Fact>
              <Fact label="סוכן">{c.salesAgentName || '—'}</Fact>
              <Fact label="תנאי תשלום">{terms}</Fact>
            </dl>
          )}

          <div className="grid gap-[13px] md:grid-cols-2">
            <Block title="שמות בבנק" count={aliasRows.length}>
              {aliases.isError ? (
                <LoadError what="הכינויים" />
              ) : aliases.isLoading ? (
                <LoadingRows rows={1} />
              ) : aliasRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין כינויים מאושרים. הזיהוי נעשה לפי שם הלקוח, הח״פ ואנשי הקשר.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {aliasRows.map((a) => (
                    <li
                      key={a.id}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                        a.status === 'מאושר' ? 'bg-glass-strong text-ink-2' : 'border border-dashed border-warning-ink/40 bg-warning-soft text-warning-ink',
                      )}
                      title={a.source ? `מקור: ${a.source}` : undefined}
                    >
                      {a.bankName}
                      {a.status === 'מוצע' && <span className="font-medium">· מוצע</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="אנשי קשר">
              {c && (c.apContactName || c.apContactEmail || c.apContactPhone) && (
                <div className="flex flex-col gap-0.5 rounded-[16px] bg-glass-card px-[13px] py-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <UserRoundIcon className="size-3.5 text-muted-foreground" />
                    {c.apContactName || 'הנהלת חשבונות'}
                    <StatusBadge value="הנהלת חשבונות" tone="info" className="h-5 px-2 text-[11px]" />
                  </span>
                  <span className="flex flex-wrap gap-x-[13px]">
                    <ContactLine icon={MailIcon} value={c.apContactEmail} ltr />
                    <ContactLine icon={PhoneIcon} value={c.apContactPhone} ltr />
                  </span>
                </div>
              )}
              {contacts.isError ? (
                <LoadError what="אנשי הקשר" />
              ) : contacts.isLoading ? (
                <LoadingRows rows={1} />
              ) : (contacts.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">אין אנשי קשר רשומים נוספים.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {(contacts.data ?? []).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-[13px] gap-y-0.5 text-[13px]">
                      <span className="font-semibold">{p.contactName || '—'}</span>
                      {p.roleFlags && <span className="text-xs text-muted-foreground">{p.roleFlags}</span>}
                      <ContactLine icon={MailIcon} value={p.email} ltr />
                      <ContactLine icon={PhoneIcon} value={p.phone} ltr />
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>

          <Block title="חשבוניות פתוחות" count={openRows.length}>
            {invoices.isError ? (
              <LoadError what="החשבוניות" />
            ) : invoices.isLoading ? (
              <LoadingRows rows={3} />
            ) : openRows.length === 0 ? (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>אין ללקוח חשבוניות פתוחות.</p>
                <p className="font-semibold">ממתין לתנועות פתוחות מפריוריטי</p>
                {hiddenCount > 0 && <HiddenToggle checked={showHidden} onChange={setShowHidden} />}
              </div>
            ) : (
              <>
                {hiddenCount > 0 && <HiddenToggle checked={showHidden} onChange={setShowHidden} />}
                <dl className="flex flex-wrap gap-x-[21px] text-[13px]">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">פתוח</dt>
                    <dd className="font-bold tabular-nums">{formatILS(totalOpen)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">מתוכו באיחור</dt>
                    <dd className={cn('font-bold tabular-nums', totalOverdue > 0 && 'text-critical-ink')}>{formatILS(totalOverdue)}</dd>
                  </div>
                  {foreignExtra && <div className="text-muted-foreground tabular-nums">{foreignExtra}</div>}
                </dl>
                <div className="max-h-64 overflow-y-auto rounded-[16px] bg-glass-card">
                  <Table className="text-[13px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={cn(HEAD, 'ps-[13px]')}>חשבונית</TableHead>
                        <TableHead className={HEAD}>פירעון</TableHead>
                        <TableHead className={cn(HEAD, 'pe-[13px]')}>פתוח</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openRows.map((i) => {
                        const late = daysOverdue(i.dueDate) ?? 0;
                        return (
                          <TableRow key={i.id} className="hover:bg-glass-faint">
                            <TableCell className="ps-[13px] py-1.5">
                              <InvoiceNumberLink invoiceNumber={i.invoiceNumber} customerLink={false} />
                            </TableCell>
                            <TableCell className="py-1.5">
                              {formatDate(i.dueDate)}
                              {late > 0 && <span className="ms-1.5 text-xs font-semibold text-critical-ink">באיחור {formatNumber(late)} ימים</span>}
                            </TableCell>
                            <TableCell className="pe-[13px] py-1.5 font-semibold tabular-nums">{formatMoney(i.openAmount, i.currencyCode)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Block>

          <div className="grid gap-[13px] md:grid-cols-2">
            <Block title="התחייבויות פתוחות" count={commitments.length}>
              {commitmentRows.isError ? (
                <LoadError what="ההתחייבויות" />
              ) : commitmentRows.isLoading ? (
                <LoadingRows rows={1} />
              ) : commitments.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין התחייבויות פתוחות.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {commitments.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-x-2 text-[13px]">
                      <span className="font-semibold tabular-nums">{formatILS(n.amount ?? n.balanceAtNote)}</span>
                      <span className="text-muted-foreground">· {formatDate(n.actionDate)}</span>
                      <StatusBadge value={n.outcome || 'פתוחה'} className="h-5 px-2 text-[11px]" />
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="תקבולים אחרונים שאושרו" count={lastReceipts.length}>
              {receipts.isError ? (
                <LoadError what="התקבולים" />
              ) : receipts.isLoading ? (
                <LoadingRows rows={2} />
              ) : lastReceipts.length === 0 ? (
                <p className="text-xs text-muted-foreground">עוד אין תקבולים מאושרים ללקוח.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {lastReceipts.map((p) => {
                    const list = [...new Set((allocations.data ?? []).filter((a) => a.receiptKey === p.receiptKey).map((a) => a.invoiceNumber ?? '').filter(Boolean))];
                    return (
                      <li key={p.id} className="flex flex-col gap-0.5 text-[13px]">
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="font-semibold tabular-nums">{formatILS(p.amount)}</span>
                          <span className="text-muted-foreground">· {formatDate(p.valueDate)}</span>
                          <span className="truncate text-ink-2">· {p.payerName || p.receiptSource || '—'}</span>
                          <ReceiptStatusBadges receipt={p} size="sm" />
                        </span>
                        {list.length > 0 && (
                          <span className="flex flex-wrap gap-x-1.5 text-xs">
                            {list.map((n) => (
                              <InvoiceNumberLink key={n} invoiceNumber={n} customerLink={false} />
                            ))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Block>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A customer name (and code) that opens the receipts pop-up of the customer card. Safe inside clickable rows. */
export function CustomerPopupLink({
  code,
  name,
  showCode = false,
  className,
}: {
  code?: string | null;
  name?: string | null;
  showCode?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = name || code || '—';
  if (!code) return <span className={className}>{label}</span>;
  return (
    <span className="contents" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        title="כרטיס הלקוח – מה שחשוב לתקבולים"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex cursor-pointer flex-col rounded-[6px] text-start font-semibold text-foreground outline-none hover:text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <span>{label}</span>
        {showCode && <span className="text-xs font-normal text-muted-foreground">{code}</span>}
      </button>
      {open && <CustomerPopup customerCode={code} onClose={() => setOpen(false)} />}
    </span>
  );
}