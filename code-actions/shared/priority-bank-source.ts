// The bank statement lines source (Priority screen שורות דפי בנק) for SyncPriorityBankLines.
//
// The Priority API is not connected yet: the source in use reports connected: false and returns no lines, and every
// caller stops with PRIORITY_NOT_CONNECTED. The API implementation replaces it behind the same interface:
// fetchBankStatementLines({ loadDate }) → the lines of that load day. Nothing here writes anywhere or contacts anyone.

/** One line as Priority's שורות דפי בנק screen gives it. */
export interface PriorityBankLine {
  priorityLineId: string;
  bankAccount: string;
  bankName: string;
  /** YYYY-MM-DD */
  valueDate: string;
  amount: number;
  payerName: string;
  reference: string;
  /** העברה / זיכוי בנק / פירעון צ׳ק / אחר (צ׳ק / צ׳ק חוזר for older lines) */
  lineType: string;
}

export interface BankStatementQuery {
  /** the load day, YYYY-MM-DD */
  loadDate: string;
}

export interface BankStatementSource {
  /** BankLines.source of the lines this source returns */
  name: string;
  /** false = not connected: callers read and write nothing and report PRIORITY_NOT_CONNECTED */
  connected?: boolean;
  fetchBankStatementLines(q: BankStatementQuery): Promise<PriorityBankLine[]>;
}

export const LT_TRANSFER = 'העברה';
export const LT_BANK_CREDIT = 'זיכוי בנק';
export const LT_CHEQUE_CLEARED = 'פירעון צ׳ק';
export const LT_CHEQUE = 'צ׳ק';
export const LT_BOUNCED = 'צ׳ק חוזר';
export const LT_OTHER = 'אחר';
/** The line types a receipt comes from: these new lines go through IdentifyCustomers. */
export const CHECKED_LINE_TYPES = [LT_TRANSFER, LT_BANK_CREDIT];
export const PULL_LINE_TYPES = [LT_TRANSFER, LT_BANK_CREDIT, LT_CHEQUE_CLEARED, LT_OTHER];

export const PRIORITY_SOURCE = 'priority';

/** Placeholder until the Priority API is connected: not connected, no lines. */
export const notConnectedBankStatementSource: BankStatementSource = {
  name: PRIORITY_SOURCE,
  connected: false,
  async fetchBankStatementLines(): Promise<PriorityBankLine[]> {
    return [];
  },
};

/** The source in use. */
export const bankStatementSource: BankStatementSource = notConnectedBankStatementSource;

export const fetchBankStatementLines = (q: BankStatementQuery) => bankStatementSource.fetchBankStatementLines(q);
