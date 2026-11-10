// The customer cards source (Priority's customers screen) for PullPriorityCustomers.
//
// The Priority API is not connected yet: the source in use reports connected: false and returns no cards, and the pull
// stops with PRIORITY_NOT_CONNECTED. The API implementation replaces it behind the same interface: fetchCustomers() →
// every customer card Priority returns, plus covers(row) → whether a Customers row is one this source speaks for (a
// covered row that is not returned is marked לא פעיל בפריוריטי; an uncovered row is never touched).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { numOrNull, str } from './collections-data.ts';

/** One customer card as Priority gives it (field names already mapped to our column names). */
export interface PriorityCustomer {
  customerCode: string;
  customerName: string;
  /** אשראי / מזומן */
  customerType: string | null;
  /** פעיל / זמני / חסום */
  priorityStatus: string | null;
  paymentTermsDays: number | null;
  paymentTermsLabel: string | null;
  creditLimit: number | null;
  salesAgentName: string | null;
  salesAgentPhone: string | null;
  apContactName: string | null;
  apContactEmail: string | null;
  apContactPhone: string | null;
  procurementContactName: string | null;
  procurementContactEmail: string | null;
  procurementContactPhone: string | null;
  primaryEmail: string | null;
  priceListCode: string | null;
  ledgerBalance: number | null;
  address: string | null;
  paymentMethod: string | null;
  /** ח.פ. – only when Priority has one (else our own value is kept) */
  companyId: string | null;
}

export interface CustomersQuery {
  /** the platform client */
  client: BlocksClient;
}

export interface CustomersSource {
  /** Customers.source of the rows this source writes */
  name: string;
  /** false = not connected: the pull reads and writes nothing and reports PRIORITY_NOT_CONNECTED */
  connected?: boolean;
  fetchCustomers(q: CustomersQuery): Promise<PriorityCustomer[]>;
  /** Is this Customers row one the source speaks for? (not returned + covered → לא פעיל בפריוריטי) */
  covers(row: Item): boolean;
}

export const INACTIVE_IN_PRIORITY = 'לא פעיל בפריוריטי';
export const PRIORITY_ACTIVE = 'פעיל';

const textOrNull = (v: unknown) => (str(v).trim() ? str(v).trim() : null);

/** A Customers row in Priority's shape. */
export function customerAsPriority(r: Item): PriorityCustomer {
  const status = textOrNull(r.priorityStatus);
  return {
    customerCode: str(r.customerCode).trim(),
    customerName: str(r.customerName).trim(),
    customerType: textOrNull(r.customerType),
    priorityStatus: !status || status === INACTIVE_IN_PRIORITY ? PRIORITY_ACTIVE : status,
    paymentTermsDays: numOrNull(r.paymentTermsDays),
    paymentTermsLabel: textOrNull(r.paymentTermsLabel),
    creditLimit: numOrNull(r.creditLimit),
    salesAgentName: textOrNull(r.salesAgentName),
    salesAgentPhone: textOrNull(r.salesAgentPhone),
    apContactName: textOrNull(r.apContactName),
    apContactEmail: textOrNull(r.apContactEmail),
    apContactPhone: textOrNull(r.apContactPhone),
    procurementContactName: textOrNull(r.procurementContactName),
    procurementContactEmail: textOrNull(r.procurementContactEmail),
    procurementContactPhone: textOrNull(r.procurementContactPhone),
    primaryEmail: textOrNull(r.primaryEmail),
    priceListCode: textOrNull(r.priceListCode),
    ledgerBalance: numOrNull(r.ledgerBalance),
    address: textOrNull(r.address),
    paymentMethod: textOrNull(r.paymentMethod),
    companyId: textOrNull(r.companyId),
  };
}

/** Placeholder until the Priority API is connected: not connected, no cards, covers nothing. */
export const notConnectedCustomersSource: CustomersSource = {
  name: 'priority',
  connected: false,
  async fetchCustomers(): Promise<PriorityCustomer[]> {
    return [];
  },
  covers: () => false,
};

/** The source in use. */
export const customersSource: CustomersSource = notConnectedCustomersSource;
