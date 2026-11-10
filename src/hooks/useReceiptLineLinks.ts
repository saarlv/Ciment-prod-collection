import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { BankLinesEntity } from '@/product-types';

type BankLine = (typeof BankLinesEntity)['instanceType'];

/**
 * Where each bank line sits on the receipts screen, so `href(id)` opens it: a line pulled from Priority opens its
 * record (/collections/receipts?line=…, today's or from another day); an older line from an uploaded file opens the
 * read-only "שורות ישנות מקובץ" section on it. `lines` are the bank lines read on the way.
 */
export function useReceiptLineLinks(bankLineIds: (string | null | undefined)[]): {
  href: (bankLineId: string) => string | null;
  lines: BankLine[];
  isLoading: boolean;
  isError: boolean;
} {
  const ids = [...new Set(bankLineIds.filter((id): id is string => !!id))];
  const linesQ = useEntityGetAll(BankLinesEntity, { where: { column: 'bankLineId', operator: 'in', value: ids } }, { enabled: ids.length > 0 });
  const lines = linesQ.data ?? [];
  /** Null while the line is still loading or when it is not found: callers render no link then. */
  const href = (bankLineId: string) => {
    if (!lines.some((l) => l.bankLineId === bankLineId)) return null;
    return `/collections/receipts?${new URLSearchParams({ line: bankLineId }).toString()}`;
  };
  return {
    href,
    lines,
    isLoading: ids.length > 0 && linesQ.isLoading,
    isError: linesQ.isError,
  };
}