// The exposure source (Priority's אובליגו screen: open invoices, delivery notes not yet invoiced, cheques not yet
// cleared, open orders) for PullOpenOrders.
//
// The Priority API is not connected yet: the source in use reports connected: false and returns nothing, and the pull
// stops with PRIORITY_NOT_CONNECTED. The API implementation replaces it behind the same interface: fetchExposure() → one
// entry per customer with Priority's obligo total and the documents behind it. Nothing here writes anywhere or contacts
// anyone.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { toIsraelDate } from './collections-dates.ts';
import { num, round2, str } from './collections-data.ts';

export interface PriorityExposureItem {
  /** חשבונית פתוחה / תעודת משלוח שלא חויבה / צ׳ק שלא הופקד / הזמנה פתוחה */
  itemType: string;
  reference: string;
  amount: number;
  docDate: string | null;
  dueDate: string | null;
  /** when Priority computed it (ISO) */
  asOf: string | null;
}

export interface PriorityExposure {
  customerCode: string;
  customerName: string;
  obligoTotal: number;
  /** when Priority computed it (ISO) */
  asOf: string | null;
  items: PriorityExposureItem[];
}

export interface ExposureQuery {
  client: BlocksClient;
}

export interface ExposureSource {
  /** CustomerExposure / ExposureItems.source of the rows this source writes */
  name: string;
  /** false = not connected: the pull reads and writes nothing and reports PRIORITY_NOT_CONNECTED */
  connected?: boolean;
  fetchExposure(q: ExposureQuery): Promise<PriorityExposure[]>;
}

const isoOrNull = (v: unknown) => (str(v).trim() ? str(v).trim() : null);

/** Exposure mirror rows in Priority's shape (pure). */
export function exposureFromRows(exposure: Item[], items: Item[]): PriorityExposure[] {
  const byCode = new Map<string, PriorityExposure>();
  for (const e of [...exposure].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))) {
    const code = str(e.customerCode).trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, { customerCode: code, customerName: str(e.customerName).trim(), obligoTotal: round2(num(e.obligoTotal)), asOf: isoOrNull(e.asOf), items: [] });
  }
  for (const i of items) {
    const code = str(i.customerCode).trim();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, { customerCode: code, customerName: str(i.customerName).trim(), obligoTotal: 0, asOf: isoOrNull(i.asOf), items: [] });
    byCode.get(code)!.items.push({
      itemType: str(i.itemType).trim(),
      reference: str(i.reference).trim(),
      amount: round2(num(i.amount)),
      docDate: toIsraelDate(i.docDate),
      dueDate: toIsraelDate(i.dueDate),
      asOf: isoOrNull(i.asOf),
    });
  }
  return [...byCode.values()].sort((a, b) => a.customerCode.localeCompare(b.customerCode));
}

/** Placeholder until the Priority API is connected: not connected, no exposure. */
export const notConnectedExposureSource: ExposureSource = {
  name: 'priority',
  connected: false,
  async fetchExposure(): Promise<PriorityExposure[]> {
    return [];
  },
};

/** The source in use. */
export const exposureSource: ExposureSource = notConnectedExposureSource;
