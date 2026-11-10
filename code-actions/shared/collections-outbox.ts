// The outbox (Approvals) helper every writer of a draft uses (component 04 · פניות).
// Each outbound draft carries:
// - component: which part of the app wrote it (פניות, תקבולים, תעודות, מחירים, מנה חודשית, ביטוח)
// - mailboxId: the Mailboxes row it would be sent from (the active mailbox whose address is the draft's
//   fromMailbox, else the first active mailbox)
// - referenceCode: CIM-<Approvals id>, written back right after the row is created
// - the subject ends with " [CIM-<id>]" exactly once, so an inbound reply that keeps the subject (or quotes it)
//   is linked back to this row by IngestEmail.
// Nothing is sent: the helper only writes the draft row.
// Right after a draft is written its task (draft:<approvalId>, טיוטה לאישור) is opened / refreshed through the task
// engine (collections-task-sync.ts) — never failing the draft write. The engine is loaded lazily: it imports
// collections-documents, which imports this module.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { errText, mapLimit, readAll, str } from './collections-data.ts';

/** Opens / refreshes the draft tasks of these approvals now (never throws). */
export async function syncDraftTasks(client: BlocksClient, approvalIds: string[], customerCode?: unknown) {
  try {
    const { syncTasksAfterWrite } = await import('./collections-task-sync.ts');
    const code = str(customerCode).trim();
    return await syncTasksAfterWrite(client, { approvalIds, ...(code ? { customerCode: code } : {}) }, { label: 'outbox' });
  } catch (e) {
    console.warn(`outbox: עדכון משימת הטיוטה נכשל – ${errText(e)}`);
    return null;
  }
}

export const C_INBOX = 'פניות';
export const C_RECEIPTS = 'תקבולים';
export const C_DOCUMENTS = 'תעודות';
export const C_PRICES = 'מחירים';
export const C_MONTHLY = 'מנה חודשית';
export const C_INSURANCE = 'ביטוח';
export const OUTBOX_COMPONENTS = [C_INBOX, C_RECEIPTS, C_DOCUMENTS, C_PRICES, C_MONTHLY, C_INSURANCE] as const;
export type OutboxComponent = (typeof OUTBOX_COMPONENTS)[number];

export const REF_PREFIX = 'CIM-';
const TAG_RE = /\s*\[\s*CIM-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\s*\]/gi;
const REF_RE = /CIM-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/gi;

/** "CIM-<id>" for an Approvals row id. */
export const referenceCodeOf = (approvalId: unknown) => `${REF_PREFIX}${str(approvalId).trim()}`;

/** The subject without any " [CIM-…]" tag. */
export const subjectBase = (subject: unknown) => str(subject).replace(TAG_RE, '').replace(/\s{2,}/g, ' ').trim();

/** The subject with exactly one " [CIM-<id>]" at the end. */
export function withReference(subject: unknown, referenceCode: string): string {
  const base = subjectBase(subject);
  if (!referenceCode) return base;
  return base ? `${base} [${referenceCode}]` : `[${referenceCode}]`;
}

/** Every CIM-<id> reference in a text (subject or body), in order of appearance, de-duplicated. */
export function findReferenceCodes(text: unknown): string[] {
  const out: string[] = [];
  for (const m of str(text).matchAll(REF_RE)) {
    const code = `${REF_PREFIX}${m[1]}`;
    if (!out.some((x) => x.toLowerCase() === code.toLowerCase())) out.push(code);
  }
  return out;
}

// ---------- mailboxes ----------

const isActive = (m: Item) => !(m.active === false || m.active === 'false');

export async function readMailboxes(client: BlocksClient): Promise<Item[]> {
  try {
    return (await readAll(client, 'Mailboxes')).sort((a, b) => Number(a.id) - Number(b.id) || str(a.id).localeCompare(str(b.id)));
  } catch {
    return [];
  }
}

/** A mailbox the code works with: active, or the test mailbox (isTestFixture – kept for tests while not active). */
export const isUsableMailbox = (m: Item) => isActive(m) || m?.isTestFixture === true || m?.isTestFixture === 'true';
export { isActive as isActiveMailbox };

/**
 * The mailbox of an address (an active one, or the test mailbox); without a match, the first active mailbox (or null).
 * Plan 04.11 part C: one active mailbox (Keren's); an inactive non-test row is never used.
 */
export function pickMailbox(mailboxes: Item[], address?: unknown): Item | null {
  const a = str(address).trim().toLowerCase();
  if (a) {
    const exact = mailboxes.find((m) => isUsableMailbox(m) && str(m.address).trim().toLowerCase() === a);
    if (exact) return exact;
  }
  return mailboxes.find(isActive) ?? null;
}

/** Mailbox id for a draft: the given one, else by the draft's fromMailbox address, else the active mailbox. */
export async function resolveMailboxId(client: BlocksClient, args: { mailboxId?: unknown; address?: unknown; mailboxes?: Item[] }): Promise<string | null> {
  const given = str(args.mailboxId).trim();
  if (given) return given;
  const rows = args.mailboxes ?? (await readMailboxes(client));
  const m = pickMailbox(rows, args.address);
  return m ? str(m.id) : null;
}

// ---------- writing ----------

export interface OutboxOptions {
  component: OutboxComponent;
  /** Mailboxes.id; default: by the draft's fromMailbox, else the active mailbox. */
  mailboxId?: string | null;
  /** A pending row of the same draft to replace (its referenceCode is kept). */
  existing?: Item | null;
  /** Already-read Mailboxes rows (saves a read when many drafts are written). */
  mailboxes?: Item[];
}

export interface OutboxSaveResult {
  /** The row as read back after the write (or the best known version of it). */
  item: Item;
  id: string;
  referenceCode: string;
  created: boolean;
  /** the draft task sync (null when it could not run) */
  taskSync?: unknown;
}

/**
 * Creates the draft (or replaces `existing`) in Approvals with component, mailboxId, referenceCode and the
 * " [CIM-<id>]" subject tag, then reads it back. Throws when the platform write fails (callers already catch).
 */
export async function saveOutboxDraft(client: BlocksClient, draft: Item, opts: OutboxOptions): Promise<OutboxSaveResult> {
  const existing = opts.existing ?? null;
  const mailboxId =
    str(opts.mailboxId).trim() ||
    str(existing?.mailboxId).trim() ||
    (await resolveMailboxId(client, { address: draft.fromMailbox, mailboxes: opts.mailboxes })) ||
    null;
  const row: Item = { ...draft, component: opts.component, mailboxId };

  if (existing?.id !== undefined && existing?.id !== null && str(existing.id)) {
    const id = str(existing.id);
    const referenceCode = str(existing.referenceCode).trim() || referenceCodeOf(id);
    await client.updateItem('Approvals', id, { ...row, referenceCode, subject: withReference(row.subject, referenceCode) });
    const back = (await client.getItem('Approvals', id))?.item;
    const item = back ?? { ...existing, ...row, referenceCode, subject: withReference(row.subject, referenceCode) };
    const taskSync = await syncDraftTasks(client, [id], item.customerCode);
    return { item, id, referenceCode, created: false, taskSync };
  }

  const created = (await client.createItem('Approvals', { ...row, subject: subjectBase(row.subject) }))?.item;
  const id = str(created?.id);
  if (!id) throw new Error('Approvals: השורה נוצרה בלי מזהה');
  const referenceCode = referenceCodeOf(id);
  const subject = withReference(row.subject, referenceCode);
  await client.updateItem('Approvals', id, { referenceCode, subject });
  const back = (await client.getItem('Approvals', id))?.item;
  const item = back ?? { ...created, referenceCode, subject };
  const taskSync = await syncDraftTasks(client, [id], item.customerCode);
  return { item, id, referenceCode, created: true, taskSync };
}

/**
 * For rows a writer created in bulk (createItems): sets component, mailboxId, referenceCode and the subject tag
 * on each. Returns the stamped values per id; failures are listed, never thrown.
 */
export async function stampOutboxRows(
  client: BlocksClient,
  rows: Item[],
  opts: { component: OutboxComponent; mailboxes?: Item[] },
): Promise<{ stamped: Map<string, Item>; errors: string[] }> {
  const stamped = new Map<string, Item>();
  const errors: string[] = [];
  const list = rows.filter((r) => r && str(r.id));
  if (!list.length) return { stamped, errors };
  const mailboxes = opts.mailboxes ?? (await readMailboxes(client));
  await mapLimit(list, 6, async (r) => {
    const id = str(r.id);
    const referenceCode = str(r.referenceCode).trim() || referenceCodeOf(id);
    const patch: Item = {
      component: opts.component,
      mailboxId: str(r.mailboxId).trim() || str(pickMailbox(mailboxes, r.fromMailbox)?.id) || null,
      referenceCode,
      subject: withReference(r.subject, referenceCode),
    };
    try {
      await client.updateItem('Approvals', id, patch);
      stamped.set(id, patch);
    } catch (e) {
      errors.push(`Approvals ${id} (סימוכין): ${errText(e)}`);
    }
  });
  if (stamped.size) await syncDraftTasks(client, [...stamped.keys()]);
  return { stamped, errors };
}
