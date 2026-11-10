import { str } from '../shared/collections-data.ts';
import { EXPECTED_COLUMNS } from './parse.ts';

// Imports an uploaded Priority export into the mirror tables. Since Iteration 9 the bank-file path is
// closed: bank files are uploaded on the receipts screen (/collections/receipts) and read by ReadBankFile,
// so kind "קובץ בנק" returns an error pointing there and writes nothing. The other kinds are kept for the
// future and are not active yet. Never writes anything and never writes to Priority.
const BANK = 'קובץ בנק';
const KINDS = ['דוח גיול', 'קובץ בנק', 'חשבוניות פתוחות', 'כרטיסי לקוח', 'אנשי קשר'];
export const BANK_MOVED_ERROR = 'קובץ בנק מועלה עכשיו במסך תקבולים (/collections/receipts)';

export const invoke = async (input: any, _context: any) => {
  const kind = str(input?.kind).trim();
  const out = {
    dryRun: input?.dryRun !== false,
    kind,
    fileName: str(input?.fileName).trim(),
    dataDate: null as string | null,
    isTestFile: false,
    expectedColumns: EXPECTED_COLUMNS,
    rowsRead: 0,
    toWrite: [],
    skippedExisting: [],
    rowErrors: [],
    importBatch: null,
    writeVerified: false,
    verifyDetails: { note: 'לא נכתב דבר.' },
    errors: [] as string[],
  };
  if (!KINDS.includes(kind)) return { ...out, errors: [`סוג קובץ לא מוכר: "${kind}"`] };
  if (kind === BANK) return { ...out, errors: [BANK_MOVED_ERROR] };
  return { ...out, errors: [`סוג הקובץ ${kind} עדיין לא פעיל`] };
};
