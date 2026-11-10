// The one customer reply draft of an InboundEmails row (shared by CreateReplyDraft and ApplyMailClassification).
// Creates – or, while it is still ממתין, replaces – the reply in the outbox (Approvals kind מענה ללקוח, to the
// original sender, from the mailbox the mail arrived in, draftedBy מאיה, status ממתין, component פניות,
// referenceCode CIM-<id>), signed in the owning bookkeeper's name from the data. Refused (nothing written)
// when it would hand customer data to a sender who is not מאומת: any attachment, or a reply to a
// כרטסת / חובות פתוחים email. Sets the email to טיוטה מוכנה. There is no send.
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { buildOwnerMap, errText, findCustomer, isFixtureCustomer, ownerOf, readAll, str } from './collections-data.ts';
import { clean, DATA_CATEGORIES, joinLines, loadVerificationData, normEmail, replySubject, signBody, verifySender, VERIFIED } from './collections-mail.ts';
import { C_INBOX, saveOutboxDraft, subjectBase, type OutboxComponent } from './collections-outbox.ts';

export const REPLY_KIND = 'מענה ללקוח';

export function attachmentList(raw: unknown): string[] {
  if (Array.isArray(raw)) return [...new Set(raw.map((x) => str(x).trim()).filter(Boolean))];
  const s = clean(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return attachmentList(parsed);
  } catch {
    // plain text: one url per line / comma
  }
  return [...new Set(s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
}

const categoriesOf = (email: Item): string[] => {
  const list = str(email.categories)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = str(email.category).trim();
  return primary && !list.includes(primary) ? [primary, ...list] : list;
};

export interface ReplyInput {
  inboundEmailId: string;
  body: string;
  reason: string;
  subject?: string;
  attachmentUrls?: unknown;
  dryRun?: boolean;
  /** Outbox component (default פניות). */
  component?: OutboxComponent;
  /** Who drafted it (default מאיה). */
  draftedBy?: string;
}

export async function createReplyDraft(client: BlocksClient, input: ReplyInput | any) {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.inboundEmailId);
  const body = str(input?.body).trim();
  const reason = str(input?.reason).trim();
  const attachments = attachmentList(input?.attachmentUrls);
  const component: OutboxComponent = (input?.component as OutboxComponent) || C_INBOX;
  const out = (o: Item) => ({ dryRun, approval: null as Item | null, replaced: false, refused: false, refusalReason: '', writeVerified: false, errors: [] as string[], ...o });

  const errors: string[] = [];
  if (!id) errors.push('חסר מזהה מייל (inboundEmailId)');
  if (!body) errors.push('חסר גוף התשובה (body)');
  if (!reason) errors.push('חסרה סיבה (reason)');
  if (errors.length) return out({ errors });

  let email: Item | undefined;
  try {
    email = (await client.getItem('InboundEmails', id))?.item;
  } catch {
    email = undefined;
  }
  if (!email) return out({ errors: [`המייל ${id} לא נמצא`] });

  const recipient = normEmail(email.fromAddress);
  const customerCode = str(email.customerCode).trim();
  const categories = categoriesOf(email);
  if (str(email.status) === 'לא רלוונטית' || str(email.category) === 'לא רלוונטי') return out({ refused: true, refusalReason: 'המייל סומן לא רלוונטי – אין מענה' });
  if (!recipient) return out({ refused: true, refusalReason: 'אין כתובת שולח תקינה למענה' });

  // verification from the data (the stored value, or the shared rule when it was never set)
  let verification = str(email.senderVerification).trim();
  if (!verification) {
    const data = await loadVerificationData(client, customerCode ? [customerCode] : []);
    verification = verifySender(recipient, customerCode || null, data.contacts, data.customersByCode).status;
  }
  const dataCategory = categories.find((c) => DATA_CATEGORIES.includes(c));
  if (verification !== VERIFIED && (attachments.length || dataCategory)) {
    const what = attachments.length ? 'לצרף קבצים' : `להכין מענה עם נתוני ${dataCategory}`;
    return out({
      refused: true,
      refusalReason: `השולח ${recipient} אינו מאומת (${verification || 'לא נבדק'}) – אסור ${what} לפני אימות השולח בטלפון`,
    });
  }

  const [customer, owners, pending] = await Promise.all([
    customerCode ? findCustomer(client, customerCode) : Promise.resolve(undefined),
    customerCode ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode }) : Promise.resolve([] as Item[]),
    readAll(client, 'Approvals', {
      and: [
        { column: 'relatedTable', value: 'InboundEmails' },
        { column: 'relatedId', value: String(email.id) },
        { column: 'kind', value: REPLY_KIND },
        { column: 'status', value: 'ממתין' },
      ],
    }),
  ]);
  const bookkeeper = (customerCode ? ownerOf(customerCode, customer, buildOwnerMap(owners)) : '') || str(email.assignedBookkeeperName) || str(email.mailboxOwnerName);
  const isTestFixture = email.isTestFixture === true || email.isTestFixture === 'true' || (!!customerCode && isFixtureCustomer(customer, customerCode));
  const existing = pending.sort((a, b) => Number(a.id) - Number(b.id))[0] ?? null;

  const draft: Item = {
    customerCode: customerCode || null,
    customerName: customerCode ? str(customer?.customerName) || str(email.customerName) || null : null,
    kind: REPLY_KIND,
    recipientName: str(email.fromName).trim() || recipient,
    recipientContact: recipient,
    subject: clean(input?.subject) || replySubject(subjectBase(email.subject)),
    body: signBody(body, bookkeeper),
    reason,
    status: 'ממתין',
    draftedBy: clean(input?.draftedBy) || 'מאיה',
    draftedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    relatedTable: 'InboundEmails',
    relatedId: String(email.id),
    fromMailbox: str(email.mailbox) || null,
    attachmentUrls: joinLines(attachments),
    batchId: null,
    inboundEmailId: str(email.messageId) || null,
    threadId: str(email.threadId) || null,
    isTestFixture,
  };

  if (dryRun) return out({ approval: existing ? { ...existing, ...draft } : draft, replaced: !!existing });

  try {
    const saved = await saveOutboxDraft(client, draft, { component, existing, mailboxId: str(email.mailboxId) || null });
    await client.updateItem('InboundEmails', String(email.id), { status: 'טיוטה מוכנה' });
    const emailBack = (await client.getItem('InboundEmails', String(email.id)))?.item;
    const back = saved.item;
    const writeVerified =
      !!back &&
      str(back.status) === 'ממתין' &&
      str(back.relatedId) === String(email.id) &&
      str(back.body) === draft.body &&
      str(back.attachmentUrls) === str(draft.attachmentUrls) &&
      str(back.referenceCode) === saved.referenceCode &&
      str(emailBack?.status) === 'טיוטה מוכנה';
    return out({ approval: back, replaced: !!existing, writeVerified });
  } catch (e) {
    return out({ approval: draft, replaced: !!existing, errors: [`שמירת הטיוטה נכשלה: ${errText(e)}`] });
  }
}
