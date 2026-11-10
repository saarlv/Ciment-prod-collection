/**
 * The arrows of the ER diagram (/collections/design?doc=db&view=diagram), copied from memories/files/DESIGN_DB.md,
 * section "קשרים (ERD)". Most are logical links by text key, from.column → to.key. Since 05.11 the first real reference
 * columns exist (CustomerNotes.customer and OpenMovements.customer → Customers.id), marked `reference` and drawn apart.
 * Add a line here (and there) when a table gains a link column. Views are linked from designDb.ts (baseTable / joins).
 */

export interface DbRelation {
  from: { table: string; column: string };
  to: { table: string; column: string };
  /** n:1 = many rows of `from` point at one row of `to`; 1:n = the reverse; 1:1 = one each. */
  cardinality: 'n:1' | '1:1' | '1:n';
  /** The source column holds a list of keys. */
  list?: boolean;
  /** A real reference column (the platform links the rows), not a text key. */
  reference?: boolean;
}

function many(tables: string[], column: string, toTable: string, toColumn: string): DbRelation[] {
  return tables.map((table) => ({ from: { table, column }, to: { table: toTable, column: toColumn }, cardinality: 'n:1' }));
}

function one(fromTable: string, column: string, toTable: string, toColumn: string, extra?: Partial<DbRelation>): DbRelation {
  return { from: { table: fromTable, column }, to: { table: toTable, column: toColumn }, cardinality: 'n:1', ...extra };
}

export const DB_RELATIONS: DbRelation[] = [
  // customerCode → Customers.customerCode
  ...many(
    [
      'Approvals',
      'BankAliases',
      'BankLines',
      'CollectionQueue',
      'CreditCovers',
      'CreditLimitRequests',
      'CustomerContacts',
      'CustomerDailySummaries',
      'DeliveryNotes',
      'Disputes',
      'ExposureItems',
      'InboundEmails',
      'Interactions',
      'InvoiceLines',
      'Invoices',
      'LedgerEntries',
      'MatchProposals',
      'Payments',
      'PriceListItems',
      'ReceiptAllocations',
      'ReceiptThreads',
      'Receipts',
    ],
    'customerCode',
    'Customers',
    'customerCode',
  ),
  one('CustomerExposure', 'customerCode', 'Customers', 'customerCode', { cardinality: '1:1' }),
  one('CustomerOwners', 'customerCode', 'Customers', 'customerCode', { cardinality: '1:1' }),
  // customer → Customers.id: the first real reference columns (05.11)
  one('CustomerNotes', 'customer', 'Customers', 'id', { reference: true }),
  one('OpenMovements', 'customer', 'Customers', 'id', { reference: true }),
  // CollectionQueue.itemsJson[].noteIds → CustomerNotes.id (a grouped task's rows)
  one('CollectionQueue', 'itemsJson', 'CustomerNotes', 'id', { list: true }),
  // OpenMovements.importBatchId → ImportBatches.id (the pull that wrote the movement)
  one('OpenMovements', 'importBatchId', 'ImportBatches', 'id'),
  // Customers.priceListCode → PriceListItems.priceListCode (one price list, many items)
  one('Customers', 'priceListCode', 'PriceListItems', 'priceListCode', { cardinality: '1:n' }),
  // invoiceNumber → Invoices.invoiceNumber
  ...many(['InvoiceLines', 'DeliveryNotes', 'ReceiptAllocations'], 'invoiceNumber', 'Invoices', 'invoiceNumber'),
  one('Invoices', 'paidSeenBankLineIds', 'BankLines', 'bankLineId', { list: true }),
  // bankLineId → BankLines.bankLineId
  ...many(
    ['MatchProposals', 'ReceiptCheckSteps', 'ReceiptAllocations', 'ReceiptThreads', 'Receipts', 'Payments', 'InboundEmails', 'AgentFeedback'],
    'bankLineId',
    'BankLines',
    'bankLineId',
  ),
  one('BankAliases', 'proposedFromBankLineId', 'BankLines', 'bankLineId'),
  // importBatchId → ImportBatches.id
  ...many(['BankLines', 'MatchProposals', 'ReceiptCheckSteps', 'Receipts', 'AgentFeedback'], 'importBatchId', 'ImportBatches', 'id'),
  one('AgentBriefings', 'triggeredByImportId', 'ImportBatches', 'id'),
  // matchProposalId → MatchProposals.id
  one('Receipts', 'matchProposalId', 'MatchProposals', 'id'),
  // inboundEmailId → InboundEmails.id
  ...many(['EmailAttachments', 'Disputes', 'Approvals', 'ReceiptThreads'], 'inboundEmailId', 'InboundEmails', 'id'),
  one('BankAliases', 'evidenceEmailId', 'InboundEmails', 'id'),
  one('MatchProposals', 'evidenceEmailIds', 'InboundEmails', 'id', { list: true }),
  one('Approvals', 'lastReplyEmailId', 'InboundEmails', 'id'),
  // mailboxId → Mailboxes.id
  ...many(['InboundEmails', 'Approvals', 'MailAutomations'], 'mailboxId', 'Mailboxes', 'id'),
  one('MailAutomationRuns', 'automationId', 'MailAutomations', 'id'),
  one('ReceiptThreads', 'approvalId', 'Approvals', 'id'),
  // 05 · משימות: the invoice layer's open dispute (the old aging notes and payment promises were removed in wave 3, 08.11)
  one('Invoices', 'openDisputeId', 'Disputes', 'id'),
];