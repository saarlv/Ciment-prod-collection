import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentSettingsEntity, CustomerNotesEntity, CustomersEntity, OpenMovementsEntity } from '@/product-types';
import { MonthNotesPanel } from '@/components/aging/MonthNotesPanel';
import { LoadError } from '@/components/PageStates';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { customLabels, settingsMap } from '@/utils/AgingMonths';
import { AG_MENU } from '@/utils/AgingStyle';
import { formatMonth, round2, todayISO } from '@/utils/Format';

/** Which notes window to open: one customer + one month, or (dueMonth null) every month in `months` with a month picker. */
export interface NotesTarget {
  customerCode: string;
  customerName?: string | null;
  /** YYYY-MM; null = the customer's months in `months`, the form asks which one. */
  dueMonth: string | null;
  /** For dueMonth null: the months to choose from, with their open balance. */
  months?: { key: string; balance: number }[];
  anchor: HTMLElement;
}

const month7 = (v?: string | null) => (v ?? '').slice(0, 7);

/** Reads what the window needs for one customer (notes, settings, the customer row, the month's movements). */
function NotesBody({ target }: { target: NotesTarget }) {
  const scope = useOwnerScope();
  const code = target.customerCode;
  const fixed = target.dueMonth;
  const notesQ = useEntityGetAll(CustomerNotesEntity, {
    where: { column: 'customerCode', value: code },
    orderBy: [{ column: 'noteCreatedAt', direction: 'desc' }],
    page: { size: 200 },
  });
  const settingsQ = useEntityGetAll(AgentSettingsEntity);
  const customerQ = useEntityGetAll(CustomersEntity, { where: { column: 'customerCode', value: code } });
  const movementsQ = useEntityGetAll(
    OpenMovementsEntity,
    { where: { and: [{ column: 'customerCode', value: code }, { column: 'dueMonth', value: fixed ?? '' }] }, page: { size: 500 } },
    { enabled: !!fixed },
  );

  if (notesQ.isError || settingsQ.isError || customerQ.isError || (fixed && movementsQ.isError))
    return (
      <div className="p-4">
        <LoadError what="ההערות של החודש" />
      </div>
    );
  if (notesQ.isLoading || settingsQ.isLoading || customerQ.isLoading || (fixed && movementsQ.isLoading))
    return (
      <div className="flex flex-col gap-2 p-4" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full" />
      </div>
    );

  const all = notesQ.data ?? [];
  const notes = fixed ? all.filter((n) => month7(n.dueMonth) === fixed) : all;
  const months = target.months ?? [];
  const balance = fixed ? round2((movementsQ.data ?? []).reduce((s, m) => s + (m.amount ?? 0), 0)) : round2(months.reduce((s, m) => s + m.balance, 0));
  const customer = customerQ.data?.[0];
  const name = target.customerName || customer?.customerName || code;

  return (
    <MonthNotesPanel
      customerName={name}
      customerCode={code}
      customerId={customer?.id ?? null}
      periodLabel={fixed ? formatMonth(fixed) : 'כל החודשים הפתוחים'}
      balance={balance}
      months={fixed ? [] : months}
      fixedMonth={fixed}
      notes={notes}
      suggestions={customLabels(all)}
      settings={settingsMap(settingsQ.data)}
      today={todayISO()}
      authorName={scope.actorName}
    />
  );
}

/**
 * The floating notes window of the aging report (Design 02 section 7), opened from anywhere else — the customer card's
 * months table and the grouped tasks' rows. Same panel, same writes (useCustomerNotesApi), anchored to the button that
 * opened it.
 */
export function MonthNotesPopover({ target, onClose }: { target: NotesTarget | null; onClose: () => void }) {
  return (
    <Popover open={!!target} onOpenChange={(o) => !o && onClose()}>
      <PopoverContent
        anchor={target?.anchor}
        side="bottom"
        align="start"
        className={cn(AG_MENU, 'max-h-[min(600px,80vh)] w-[min(400px,calc(100vw-24px))] gap-0 overflow-y-auto p-0')}
      >
        {target && <NotesBody key={`${target.customerCode}:${target.dueMonth ?? 'all'}`} target={target} />}
      </PopoverContent>
    </Popover>
  );
}