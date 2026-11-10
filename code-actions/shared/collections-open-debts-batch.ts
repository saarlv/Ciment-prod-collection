// The open-debts batch (block 2ב / the monthly mail automation), shared by PrepareOpenDebtsBatch (batch screen),
// RunMailAutomation (automations tab, הרץ עכשיו) and RunDueAutomations (hourly schedule), so all three apply the
// same rules and write the same drafts.
//
// As of asOfDate. Eligible: a debit end-of-card balance (last LedgerEntries running balance, else
// Customers.ledgerBalance), not marked doNotContact, no receipts waiting for a match, and a registered accounts
// contact; with customerCodes only those customers. Each exclusion carries its Hebrew reason (יתרת זכות, יתרה
// אפסית, לא ליצור קשר, תקבולים פתוחים להתאמה, אין איש קשר רשום להנהלת חשבונות). For every eligible customer:
// one open-debts PDF from the shared statement template – its documents from OpenMovements (the same builder as
// GenerateStatementPdf / GetOpenDebts; an empty OpenMovements table makes no PDF and no draft, only an error) – (Yaniv's layout, signed by the owning bookkeeper with her
// phone) and one outbox draft (Approvals, kind מנת חובות פתוחים, component מנה חודשית, batchId open-debts-YYYY-MM,
// CIM reference, status ממתין). Subject and body come from the automation's templates ({{customerName}},
// {{customerCode}}, {{contactName}}, {{asOfDate}}, {{month}}, {{openTotal}}, {{bookkeeperName}},
// {{bookkeeperPhone}}); without them Yaniv's wording is used. A re-run replaces the batch's pending drafts (and
// removes pending drafts of customers no longer eligible), never duplicates, and leaves drafts a person already
// decided. dryRun lists only (no PDFs, nothing written), except the preview of one customer (previewCustomerCode):
// its rendered subject / body and a preview PDF file – still no table row. Sends nothing.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { hebrewMonthLabel } from './collections-dates.ts';
import {
  buildOwnerMap,
  deleteByIds,
  errText,
  formatIls,
  isFixtureCustomer,
  isTestCode,
  mapLimit,
  ownerOf,
  readAll,
  round2,
  str,
} from './collections-data.ts';
import { accountsContact, buildOpenDebts, endOfCard, MIRROR_EMPTY_NOTE, openReceiptsFor, UNDECIDED_PROPOSAL, type OpenDebtsResult } from './collections-ledger.ts';
import { signBody } from './collections-mail.ts';
import { C_MONTHLY, readMailboxes, saveOutboxDraft } from './collections-outbox.ts';
import { signerOf } from './collections-statement-pdf.ts';
import { amount2, asOfLabel, htmlToPdf, renderOpenDebtsHtml, shortDateYear, statementFileName, type StatementSigner } from './collections-statement.ts';

export const KIND = 'מנת חובות פתוחים';
const EPS = 0.005;

export const REASON_CREDIT = 'יתרת זכות';
export const REASON_ZERO = 'יתרה אפסית';
export const REASON_RECEIPTS = 'תקבולים פתוחים להתאמה';
export const REASON_NO_CONTACT = 'אין איש קשר רשום להנהלת חשבונות';
export const REASON_DO_NOT_CONTACT = 'לא ליצור קשר';
export const REASON_NOT_FOUND = 'הלקוח לא נמצא';

export const batchIdOf = (asOf: string) => `open-debts-${asOf.slice(0, 7)}`;

/** Yaniv's wording (his open-debts printout), used when the automation has no template. */
export const DEFAULT_SUBJECT_TEMPLATE = 'חובות פתוחים – {{customerName}} – נכון ל-{{asOfDate}}';
export const DEFAULT_BODY_TEMPLATE = [
  'שלום {{contactName}},',
  '',
  'מצורף דוח חשבוניות פתוחות לבדיקה התאמה ומועדי תשלום.',
  'לבירורים ניתן לפנות בחזרה למייל / נייד {{bookkeeperPhone}}',
  '',
  '{{bookkeeperName}} - מנהלת חשבונות',
  'סימנט אי.אס. בע״מ',
].join('\n');

export const TEMPLATE_VARIABLES = ['customerName', 'customerCode', 'contactName', 'asOfDate', 'month', 'openTotal', 'bookkeeperName', 'bookkeeperPhone'] as const;
export type TemplateVars = Record<(typeof TEMPLATE_VARIABLES)[number], string>;

const groupBy = (rows: Item[], key = 'customerCode') => {
  const m = new Map<string, Item[]>();
  for (const r of rows) {
    const k = str(r[key]);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
};

export interface Candidate {
  customerCode: string;
  customerName: string;
  balance: number;
  balanceSource: string;
  customer: Item;
  debts: OpenDebtsResult;
  contact: Item | null;
  bookkeeper: string;
}

const isTrueish = (v: unknown) => v === true || v === 'true';

/** One customer as a batch candidate, without any exclusion rule (also used for the preview). */
export function candidateOf(
  c: Item,
  data: { asOf: string; movBy: Map<string, Item[]>; ledBy: Map<string, Item[]>; contacts: Item[]; ownerMap: Map<string, string>; mirrorEmpty?: boolean },
): Candidate {
  const code = str(c.customerCode);
  const ledRows = data.ledBy.get(code) ?? [];
  const movRows = data.movBy.get(code) ?? [];
  const { balance, source } = endOfCard(c, ledRows);
  const debts = buildOpenDebts({ customerCode: code, customer: c, movements: movRows, ledgerRows: ledRows, proposals: [], bankLines: [], asOf: data.asOf, movementsMirrorEmpty: data.mirrorEmpty === true });
  return {
    customerCode: code,
    customerName: str(c.customerName) || code,
    balance: round2(balance),
    balanceSource: source,
    customer: c,
    debts,
    contact: accountsContact(data.contacts, code),
    bookkeeper: ownerOf(code, c, data.ownerMap),
  };
}

/** Eligible / excluded split. Pure: every rule from the data. customerCodes (non-empty) limits it to those customers. */
export function evaluateBatch(args: {
  asOf: string;
  customers: Item[];
  /** OpenMovements rows (all customers) */
  movements: Item[];
  ledger: Item[];
  proposals: Item[];
  bankLines: Item[];
  contacts: Item[];
  owners: Item[];
  customerCodes?: string[] | null;
}) {
  const { asOf, customers, movements, ledger, proposals, bankLines, contacts, owners } = args;
  const only = args.customerCodes?.length ? new Set(args.customerCodes.map((c) => str(c).trim()).filter(Boolean)) : null;
  const data = { asOf, movBy: groupBy(movements), ledBy: groupBy(ledger), contacts, ownerMap: buildOwnerMap(owners), mirrorEmpty: !movements.length };
  const eligible: Candidate[] = [];
  const excluded: Item[] = [];
  const sorted = [...customers].sort((a, b) => str(a.customerCode).localeCompare(str(b.customerCode), 'en', { numeric: true }));
  const seen = new Set<string>();
  for (const c of sorted) {
    const code = str(c.customerCode);
    if (!code || seen.has(code)) continue;
    if (only && !only.has(code)) continue;
    seen.add(code);
    const { balance, source } = endOfCard(c, data.ledBy.get(code) ?? []);
    const hasOpenDocs = (data.movBy.get(code) ?? []).some((m) => Math.abs(Number(m.amount) || 0) > EPS);
    const name = str(c.customerName) || code;
    const ex = (reason: string, extra: Item = {}) =>
      excluded.push({ customerCode: code, customerName: name, reason, balance: round2(balance), balanceSource: source, ...extra });
    if (Math.abs(balance) <= EPS && !hasOpenDocs) {
      // nothing to say about this customer; listed only when it was asked for by code
      if (only) ex(REASON_ZERO);
      continue;
    }
    if (balance < -EPS) {
      ex(REASON_CREDIT);
      continue;
    }
    if (Math.abs(balance) <= EPS) {
      ex(REASON_ZERO);
      continue;
    }
    if (isTrueish(c.doNotContact)) {
      ex(REASON_DO_NOT_CONTACT);
      continue;
    }
    const receipts = openReceiptsFor(code, proposals, bankLines, asOf);
    if (receipts.length) {
      ex(REASON_RECEIPTS, {
        openReceipts: receipts.map((r) => ({ bankLineId: r.bankLineId, amount: r.amount, valueDate: r.valueDate, source: r.source })),
      });
      continue;
    }
    const cand = candidateOf(c, data);
    if (!cand.contact) {
      ex(REASON_NO_CONTACT);
      continue;
    }
    eligible.push(cand);
  }
  if (only) {
    for (const code of only) {
      if (!seen.has(code)) excluded.push({ customerCode: code, customerName: code, reason: REASON_NOT_FOUND, balance: null, balanceSource: null });
    }
  }
  return { eligible, excluded };
}

// ---------- templates ----------

export function templateVars(cand: Candidate, asOf: string, signer: StatementSigner | null): TemplateVars {
  return {
    customerName: cand.customerName,
    customerCode: cand.customerCode,
    contactName: str(cand.contact?.contactName).trim(),
    asOfDate: shortDateYear(asOf),
    month: hebrewMonthLabel(asOf.slice(0, 7)),
    openTotal: amount2(cand.debts.totalOpen),
    bookkeeperName: str(signer?.name || cand.bookkeeper).trim(),
    bookkeeperPhone: str(signer?.phone).trim(),
  };
}

const VAR_RE = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const PHONE_PHRASE = /\s*(?:[/|,-]\s*)?(?:נייד|טלפון|טל[׳']?)\s*:?\s*\{\{\s*bookkeeperPhone\s*\}\}/g;

/**
 * Renders {{variables}}. Unknown names are left as written (so a typo shows in the preview). When the bookkeeper
 * has no phone, "נייד {{bookkeeperPhone}}" / "/ נייד …" is dropped from its line, and a line still holding the
 * empty phone is removed. "שלום ," left by an empty contact name becomes "שלום,".
 */
export function renderTemplate(template: string, vars: Partial<TemplateVars>): string {
  let t = str(template).replace(/\r\n/g, '\n');
  if (!str(vars.bookkeeperPhone).trim()) {
    t = t.replace(PHONE_PHRASE, '');
    t = t
      .split('\n')
      .filter((line) => !/\{\{\s*bookkeeperPhone\s*\}\}/.test(line))
      .join('\n');
  }
  const out = t.replace(VAR_RE, (m, name: string) => (name in vars ? str((vars as Item)[name]) : m));
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+([,.])/g, '$1').replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

/** True when the body template carries its own signature (then no automatic signature is added). */
const signsItself = (template: string) => /\{\{\s*bookkeeperName\s*\}\}/.test(template);

export interface DraftOptions {
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  signer?: StatementSigner | null;
  automationName?: string | null;
}

/** The rendered subject and body of one customer's mail. */
export function renderMail(cand: Candidate, asOf: string, opts: DraftOptions = {}) {
  const signer = opts.signer ?? (cand.bookkeeper ? { name: cand.bookkeeper, role: 'מנהלת חשבונות', phone: '' } : null);
  const vars = templateVars(cand, asOf, signer);
  const subjectTpl = str(opts.subjectTemplate).trim() || DEFAULT_SUBJECT_TEMPLATE;
  const bodyTpl = str(opts.bodyTemplate).trim() || DEFAULT_BODY_TEMPLATE;
  const subject = renderTemplate(subjectTpl, vars).replace(/\s*\n\s*/g, ' ');
  const rendered = renderTemplate(bodyTpl, vars);
  const body = signsItself(bodyTpl) ? rendered : signBody(rendered, vars.bookkeeperName);
  return { subject, body, vars };
}

export function draftFor(cand: Candidate, asOf: string, batchId: string, url: string, fromMailbox: string | null, opts: DraftOptions = {}): Item {
  const contactName = str(cand.contact?.contactName).trim();
  const overdue = cand.debts.totalOverdue;
  const { subject, body } = renderMail(cand, asOf, opts);
  return {
    customerCode: cand.customerCode,
    customerName: cand.customerName,
    kind: KIND,
    recipientName: contactName || str(cand.contact?.email),
    recipientContact: str(cand.contact?.email).trim().toLowerCase(),
    subject,
    body,
    reason: `${opts.automationName ? `אוטומציה "${opts.automationName}" – ` : ''}מנת חובות פתוחים ${hebrewMonthLabel(asOf.slice(0, 7))}: יתרת סוף כרטיס ${formatIls(cand.balance)} ש״ח (לפי ${cand.balanceSource}), ${cand.debts.documents.length} מסמכים פתוחים${overdue > EPS ? `, ${formatIls(overdue)} ש״ח בפיגור` : ''}; אין תקבולים שממתינים להתאמה. מיועד לאיש הקשר הרשום להנהלת חשבונות${contactName ? ` ${contactName}` : ''}.`,
    status: 'ממתין',
    draftedBy: 'מאיה',
    draftedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'Customers',
    relatedId: cand.customerCode,
    fromMailbox,
    attachmentUrls: url,
    batchId,
    inboundEmailId: null,
    isTestFixture: isFixtureCustomer(cand.customer, cand.customerCode),
  };
}

// ---------- the run ----------

export interface BatchInput {
  asOf: string;
  dryRun: boolean;
  customerCodes?: string[] | null;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  automationId?: string | null;
  automationName?: string | null;
  mailboxId?: string | null;
  requestedBy?: string | null;
  /** dryRun: render this customer's subject, body and a preview PDF */
  previewCustomerCode?: string | null;
}

export interface BatchPreview {
  customerCode: string;
  customerName: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  pdfUrl: string;
  eligible: boolean;
  note: string;
}

/** customerCodes from an array, a JSON string or a comma list. */
export function parseCodes(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  let v: unknown = raw;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        v = JSON.parse(s);
      } catch {
        v = s;
      }
    }
  }
  const list = Array.isArray(v) ? v.map((x) => str(x)) : str(v).split(/[,;\n]/);
  return [...new Set(list.map((x) => x.trim()).filter(Boolean))];
}

export async function runOpenDebtsBatch(client: BlocksClient, o: BatchInput) {
  const { asOf, dryRun } = o;
  const batchId = batchIdOf(asOf);
  const codes = o.customerCodes?.length ? o.customerCodes : null;
  const base = {
    dryRun,
    skipped: false,
    skipReason: '',
    asOfDate: asOf,
    batchId,
    automationId: str(o.automationId) || null,
    customerCodes: codes ?? [],
    eligible: [] as Item[],
    excluded: [] as Item[],
    draftsCreated: [] as Item[],
    draftsReplaced: 0,
    draftsRemoved: 0,
    writeVerified: false,
    errors: [] as string[],
    preview: null as BatchPreview | null,
  };

  const [customers, movements, ledger, proposals, bankLines, contacts, owners, team, batchRows] = await Promise.all([
    readAll(client, 'Customers'),
    readAll(client, 'OpenMovements'),
    readAll(client, 'LedgerEntries'),
    readAll(client, 'MatchProposals', { column: 'status', value: UNDECIDED_PROPOSAL }),
    readAll(client, 'BankLines', { column: 'customerCode', operator: 'is not null' }),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'CustomerOwners'),
    readAll(client, 'TeamMembers').catch(() => [] as Item[]),
    readAll(client, 'Approvals', { and: [{ column: 'batchId', value: batchId }, { column: 'kind', value: KIND }] }),
  ]);
  const mailboxes = await readMailboxes(client);
  const chosenMailbox = o.mailboxId ? mailboxes.find((m) => str(m.id) === str(o.mailboxId)) ?? null : null;
  const errors: string[] = [];
  if (o.mailboxId && !chosenMailbox) errors.push(`התיבה ${o.mailboxId} לא נמצאה – הטיוטות נרשמות לתיבה של האחראית`);

  const mirrorEmpty = !movements.length;
  if (mirrorEmpty) errors.push(`${MIRROR_EMPTY_NOTE} לא הופקו PDF ולא נכתבו טיוטות – להריץ שוב אחרי משיכת התנועות.`);
  const { eligible: all, excluded } = evaluateBatch({ asOf, customers, movements, ledger, proposals, bankLines, contacts, owners, customerCodes: codes });
  // a draft a person already decided in this batch is kept as is (no second draft for that customer)
  const decided = new Map<string, Item>();
  const pendingByCode = new Map<string, Item[]>();
  for (const r of batchRows) {
    const code = str(r.customerCode);
    if (str(r.status) === 'ממתין') {
      if (!pendingByCode.has(code)) pendingByCode.set(code, []);
      pendingByCode.get(code)!.push(r);
    } else decided.set(code, r);
  }
  const eligible: Candidate[] = [];
  for (const c of all) {
    const d = decided.get(c.customerCode);
    if (d) {
      excluded.push({ customerCode: c.customerCode, customerName: c.customerName, reason: `כבר הוחלט על הטיוטה במנה הזו (${str(d.status)})`, balance: c.balance, balanceSource: c.balanceSource });
    } else eligible.push(c);
  }
  const signerFor = (c: Candidate) => signerOf(c.bookkeeper, team);
  const eligibleOut = eligible.map((c) => {
    const signer = signerFor(c);
    return {
      customerCode: c.customerCode,
      customerName: c.customerName,
      balance: c.balance,
      balanceSource: c.balanceSource,
      totalOpen: c.debts.totalOpen,
      openTotal: c.debts.totalOpen,
      totalOverdue: c.debts.totalOverdue,
      documents: c.debts.documents.length,
      contactName: str(c.contact?.contactName),
      contactEmail: str(c.contact?.email).trim().toLowerCase(),
      recipientName: str(c.contact?.contactName),
      recipientContact: str(c.contact?.email).trim().toLowerCase(),
      bookkeeperName: c.bookkeeper,
      bookkeeperPhone: signer?.phone ?? '',
      pendingDraftId: pendingByCode.get(c.customerCode)?.[0]?.id ?? null,
      isTestFixture: isFixtureCustomer(c.customer, c.customerCode),
    };
  });
  const eligibleCodes = new Set(eligible.map((c) => c.customerCode));
  // without a customer list, pending drafts of customers no longer eligible are removed; with a list, only those
  // customers' drafts are touched
  const stale = batchRows.filter((r) => str(r.status) === 'ממתין' && !eligibleCodes.has(str(r.customerCode)) && (!codes || codes.includes(str(r.customerCode))));
  const extraPending = [...pendingByCode.entries()].filter(([code]) => eligibleCodes.has(code)).flatMap(([, rows]) => rows.sort((a, b) => Number(a.id) - Number(b.id)).slice(1));
  const draftOpts = (c: Candidate): DraftOptions => ({ subjectTemplate: o.subjectTemplate, bodyTemplate: o.bodyTemplate, signer: signerFor(c), automationName: o.automationName });

  if (dryRun) {
    let preview: BatchPreview | null = null;
    const pc = str(o.previewCustomerCode).trim();
    if (pc) {
      const customer = customers.find((c) => str(c.customerCode) === pc);
      if (!customer) errors.push(`לקוח התצוגה המקדימה ${pc} לא נמצא`);
      else {
        const cand =
          eligible.find((c) => c.customerCode === pc) ??
          candidateOf(customer, { asOf, movBy: groupBy(movements), ledBy: groupBy(ledger), contacts, ownerMap: buildOwnerMap(owners), mirrorEmpty });
        const isEligible = eligibleCodes.has(pc);
        const ex = excluded.find((e) => str(e.customerCode) === pc);
        const signer = signerFor(cand);
        const { subject, body } = renderMail(cand, asOf, draftOpts(cand));
        let pdfUrl = '';
        try {
          if (!mirrorEmpty) pdfUrl = await htmlToPdf(client, renderOpenDebtsHtml(cand.debts, asOf, { signer }), statementFileName('חובות פתוחים', pc, asOf));
        } catch (e) {
          errors.push(`הפקת PDF לתצוגה המקדימה נכשלה: ${errText(e)}`);
        }
        preview = {
          customerCode: pc,
          customerName: cand.customerName,
          to: str(cand.contact?.email).trim().toLowerCase(),
          toName: str(cand.contact?.contactName),
          subject,
          body,
          pdfUrl,
          eligible: isEligible,
          note: isEligible ? '' : ex ? `הלקוח לא ייכלל בהרצה: ${str(ex.reason)}` : 'הלקוח לא בקהל של האוטומציה',
        };
      }
    }
    return {
      ...base,
      eligible: eligibleOut,
      excluded,
      draftsReplaced: eligibleOut.filter((e) => e.pendingDraftId).length,
      draftsRemoved: stale.length + extraPending.length,
      errors,
      preview,
    };
  }

  const mailboxOf = (name: string) => {
    if (chosenMailbox) return str(chosenMailbox.address).trim().toLowerCase() || null;
    const m = team.find((t) => str(t.name).trim() === name.trim() && t.active !== false && /@/.test(str(t.email)));
    return m ? str(m.email).trim().toLowerCase() : null;
  };
  // an empty OpenMovements mirror: nothing is drafted (the run counts as failed and the hourly runner tries again)
  const results = await mapLimit(mirrorEmpty ? [] : eligible, 3, async (c) => {
    try {
      const signer = signerFor(c);
      const html = renderOpenDebtsHtml(c.debts, asOf, { signer });
      const url = await htmlToPdf(client, html, statementFileName('חובות פתוחים', c.customerCode, asOf));
      const draft = draftFor(c, asOf, batchId, url, mailboxOf(c.bookkeeper), draftOpts(c));
      const existing = pendingByCode.get(c.customerCode)?.sort((a, b) => Number(a.id) - Number(b.id))[0];
      const saved = await saveOutboxDraft(client, draft, { component: C_MONTHLY, existing: existing ?? null, mailboxes, mailboxId: chosenMailbox ? str(chosenMailbox.id) : null });
      return { id: saved.id, replaced: !!existing, draft, url, referenceCode: saved.referenceCode };
    } catch (e) {
      errors.push(`${c.customerCode}: ${errText(e)}`);
      return null;
    }
  });
  const removeIds = mirrorEmpty ? [] : [...stale, ...extraPending].map((r) => String(r.id));
  let removed = 0;
  if (removeIds.length) removed = await deleteByIds(client, 'Approvals', removeIds);

  // read back the whole batch
  const after = await readAll(client, 'Approvals', { and: [{ column: 'batchId', value: batchId }, { column: 'kind', value: KIND }] });
  const byId = new Map(after.map((r) => [String(r.id), r]));
  const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
  const draftsCreated = ok.map((r) => {
    const row = byId.get(r.id);
    return {
      approvalId: r.id,
      referenceCode: r.referenceCode,
      customerCode: r.draft.customerCode,
      customerName: r.draft.customerName,
      recipientContact: r.draft.recipientContact,
      url: r.url,
      replaced: r.replaced,
      verified: !!row && str(row.status) === 'ממתין' && str(row.attachmentUrls) === r.url && str(row.customerCode) === r.draft.customerCode,
    };
  });
  const pendingAfter = after.filter((r) => str(r.status) === 'ממתין' && (!codes || codes.includes(str(r.customerCode))));
  const writeVerified =
    errors.filter((e) => !e.startsWith('התיבה ')).length === 0 &&
    draftsCreated.every((d) => d.verified) &&
    removeIds.every((id) => !byId.has(id)) &&
    pendingAfter.length === draftsCreated.length;

  return {
    ...base,
    eligible: eligibleOut,
    excluded,
    draftsCreated,
    draftsReplaced: draftsCreated.filter((d) => d.replaced).length,
    draftsRemoved: removed,
    writeVerified,
    errors,
    requestedBy: str(o.requestedBy) || null,
    asOfLabel: asOfLabel(asOf),
  };
}

/** "<code> <name> – יתרת זכות" per line. */
export const excludedSummaryOf = (excluded: Item[]) =>
  excluded.map((e) => `${str(e.customerCode)} ${str(e.customerName) && str(e.customerName) !== str(e.customerCode) ? `${str(e.customerName)} ` : ''}– ${str(e.reason)}`).join('\n');

/** True when every customer of the run is a test customer (the run row is then a test fixture). */
export const allTestCodes = (codes: string[]) => codes.length > 0 && codes.every((c) => isTestCode(c));
