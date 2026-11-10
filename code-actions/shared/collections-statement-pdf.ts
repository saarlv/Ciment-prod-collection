// Shared by GenerateStatementPdf and ApplyMailClassification (moved from GenerateStatementPdf/code.ts).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { errText, findCustomer, ownerForCustomer, readAll, str } from './collections-data.ts';
import { clean } from './collections-mail.ts';
import { loadLedger, loadOpenDebts, MIRROR_EMPTY_NOTE, resolveRange } from './collections-ledger.ts';
import {
  asOfLabel,
  htmlToPdf,
  renderLedgerHtml,
  renderOpenDebtsHtml,
  type StatementKind,
  statementFileName,
  type StatementSigner,
} from './collections-statement.ts';

const DEFAULT_ROLE = 'מנהלת חשבונות';

/** The signer of a bookkeeper name: her TeamMembers row (role, phone), else the name alone. */
export function signerOf(name: string, team: Item[]): StatementSigner | null {
  const n = str(name).trim();
  if (!n) return null;
  const row =
    team.find((t) => str(t.name).trim() === n && t.active !== false && t.active !== 'false') ?? team.find((t) => str(t.name).trim() === n) ?? null;
  return { name: n, role: str(row?.role).trim() || DEFAULT_ROLE, phone: str(row?.phone).trim() };
}

/** The owning bookkeeper of a customer as the statement's signer (CustomerOwners override, else Priority's). */
export async function loadStatementSigner(client: BlocksClient, customerCode: string, customer?: Item): Promise<StatementSigner | null> {
  const c = customer ?? (await findCustomer(client, customerCode));
  const [owner, team] = await Promise.all([ownerForCustomer(client, customerCode, c), readAll(client, 'TeamMembers').catch(() => [] as Item[])]);
  return signerOf(owner, team);
}

// Builds the statement PDF of one customer – כרטסת (GetLedger data: LedgerEntries) or חובות פתוחים (GetOpenDebts
// data: OpenMovements, refused while that mirror is empty) – from the one shared Hebrew RTL template (shared/collections-statement.ts) and converts it with
// the platform HtmlToPdf action. Returns the protected PDF url: the same url goes into
// Approvals.attachmentUrls and the preview, so preview and attachment are one file.
// Writes no table rows and sends nothing.
const KINDS: StatementKind[] = ['כרטסת', 'חובות פתוחים'];

export async function generateStatementPdf(client: BlocksClient, input: any) {
  const customerCode = clean(input?.customerCode);
  const kind = clean(input?.kind) as StatementKind;
  const base = { url: '', fileName: '', kind, customerCode, customerName: '', asOfLabel: '', totals: {}, rows: 0 };
  const errors: string[] = [];
  if (!customerCode) errors.push('חסר קוד לקוח (customerCode)');
  if (!KINDS.includes(kind)) errors.push(`סוג מסמך לא מוכר: "${kind}" (כרטסת או חובות פתוחים)`);
  let range: ReturnType<typeof resolveRange> | null = null;
  try {
    range = resolveRange(input);
  } catch (e) {
    errors.push(errText(e));
  }
  if (errors.length || !range) return { ...base, errors };
  const { asOf, fromDate, toDate } = range;

  const fileName = statementFileName(kind, customerCode, asOf);
  const stamp = asOfLabel(asOf);
  let html: string;
  let out: Record<string, any>;
  if (kind === 'כרטסת') {
    const data = await loadLedger(client, customerCode, fromDate, toDate);
    out = {
      customerName: data.customerName,
      totals: { openingBalance: data.openingBalance, totalDebit: data.totalDebit, totalCredit: data.totalCredit, closingBalance: data.closingBalance, fromDate, toDate },
      rows: data.entries.length,
    };
    if (!data.customerName && !data.hasLedger) return { ...base, ...out, fileName, asOfLabel: stamp, errors: [`הלקוח ${customerCode} לא נמצא`] };
    if (!data.hasLedger) return { ...base, ...out, fileName, asOfLabel: stamp, errors: [data.note || `אין שורות כרטסת ללקוח ${customerCode}`] };
    const signer = await loadStatementSigner(client, customerCode).catch(() => null);
    html = renderLedgerHtml(data, asOf, { signer });
  } else {
    const data = await loadOpenDebts(client, customerCode, asOf);
    out = {
      customerName: data.customerName,
      totals: {
        totalOpen: data.totalOpen,
        totalOverdue: data.totalOverdue,
        totalNotDue: data.totalNotDue,
        endOfCardBalance: data.endOfCardBalance,
        balanceSource: data.balanceSource,
        openReceipts: data.openReceipts.length,
        source: data.source,
      },
      rows: data.documents.length,
    };
    if (!data.customerName) return { ...base, ...out, fileName, asOfLabel: stamp, errors: [`הלקוח ${customerCode} לא נמצא`] };
    // an empty mirror is "unknown", never "no debts": no PDF until the open movements are pulled
    if (data.movementsMirrorEmpty) return { ...base, ...out, fileName, asOfLabel: stamp, errors: [MIRROR_EMPTY_NOTE] };
    const signer = await loadStatementSigner(client, customerCode).catch(() => null);
    html = renderOpenDebtsHtml(data, asOf, { signer });
    out.signer = signer;
  }

  try {
    const url = await htmlToPdf(client, html, fileName);
    return { ...base, ...out, url, fileName, asOfLabel: stamp, errors: [] };
  } catch (e) {
    return { ...base, ...out, fileName, asOfLabel: stamp, errors: [`הפקת ה-PDF נכשלה: ${errText(e)}`] };
  }
}
