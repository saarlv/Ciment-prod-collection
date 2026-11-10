import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CollectionQueueEntity, CustomerNotesEntity, ImportBatchesEntity } from '@/product-types';
import { useOwnerScope } from '@/hooks/useOwnerScope';
import { formatDayLabel, israelDayStartISO, previousBusinessDay, todayISO } from '@/utils/Format';

/** Commitment outcomes (CustomerNotes.outcome), the ones that need attention first. */
const STATUS_ORDER = ['לא קוימה', 'קוימה חלקית', 'קוימה', 'פתוחה'];

function countLabel(n: number, status: string) {
  if (status === 'פתוחה') return n === 1 ? 'אחת עדיין פתוחה' : `${n} עדיין פתוחות`;
  return `${n} ${status}`;
}

/**
 * What the morning run (code) has done today, from real rows: commitments checked today
 * (CustomerNotes התחייבות לתשלום, checkedAt), the open tasks (CollectionQueue) and whether the bank lines the checks
 * wait for have arrived (ImportBatches: a Priority pull, or an uploaded bank file before plan r3 stage 2). Filtered by the "שלי / של כולם" scope.
 */
export function useNinaActivity() {
  const scope = useOwnerScope();
  const today = todayISO();
  const prevDay = previousBusinessDay(today);

  const checked = useEntityGetAll(CustomerNotesEntity, {
    where: { and: [{ column: 'noteType', value: 'התחייבות לתשלום' }, { column: 'checkedAt', operator: '>=', value: israelDayStartISO(today) }] },
  });
  const tasks = useEntityGetAll(CollectionQueueEntity, {
    where: { column: 'status', operator: 'in', value: ['ממתין', 'בטיפול'] },
  });
  const bank = useEntityGetAll(ImportBatchesEntity, {
    where: {
      or: [
        { and: [{ column: 'kind', value: 'קובץ בנק' }, { column: 'status', value: 'נכתב' }] },
        { and: [{ column: 'kind', value: 'שורות דפי בנק – Priority' }, { column: 'status', operator: '!=', value: 'נכשל' }, { column: 'rowsRead', operator: '>', value: 0 }] },
      ],
    },
    orderBy: [{ column: 'uploadedAt', direction: 'desc' }],
  });

  const checkedToday = (checked.data ?? []).filter((p) => scope.isVisible(p.customerCode));
  const openTasks = (tasks.data ?? []).filter((t) => scope.isVisible(t.customerCode, t.assignedBookkeeperName));
  const lastBank = bank.data?.[0];
  // Priority pulls and legacy files carry the data date; files read on the receipts screen carried their work day.
  const lastBankDay = lastBank?.dataDate || lastBank?.workDay || null;
  const bankReady = !!lastBankDay && lastBankDay >= prevDay;

  const byStatus = new Map<string, number>();
  for (const p of checkedToday) {
    const s = p.outcome || 'פתוחה';
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  const parts = STATUS_ORDER.filter((s) => byStatus.get(s)).map((s) => countLabel(byStatus.get(s) ?? 0, s));

  const waitingFor = `הבדיקות מחכות לשורות הבנק של ${formatDayLabel(prevDay)}`;
  let summary: string;
  if (checkedToday.length > 0) {
    summary = `הבוקר ${checkedToday.length === 1 ? 'נבדקה התחייבות אחת' : `נבדקו ${checkedToday.length} התחייבויות`} מול התקבולים: ${parts.join(', ')}.`;
    if (openTasks.length > 0)
      summary += ` ${openTasks.length === 1 ? 'משימה אחת פתוחה' : `${openTasks.length} משימות פתוחות`} מחכות לטיפול.`;
  } else if (!bankReady) {
    summary = `${waitingFor} כדי לבדוק התחייבויות ולהתאים תקבולים.`;
  } else if (openTasks.length > 0) {
    summary = `שורות הבנק של ${formatDayLabel(lastBankDay)} נמשכו. ${openTasks.length === 1 ? 'משימה אחת פתוחה' : `${openTasks.length} משימות פתוחות`} מחכות לטיפול.`;
  } else {
    summary = `שורות הבנק של ${formatDayLabel(lastBankDay)} נמשכו. אין היום התחייבויות שהגיע מועד הבדיקה שלהן.`;
  }

  return {
    isLoading: checked.isLoading || tasks.isLoading || bank.isLoading || scope.isLoading,
    today,
    prevDay,
    checkedToday,
    openTasks,
    lastBank,
    lastBankDay,
    bankReady,
    waitingFor,
    summary,
  };
}