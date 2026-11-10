import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { buildOwnerMap, errText, findCustomer, ownerOf, readAll, readByIds, str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { CASE_CLOSED } from '../shared/collections-cases.ts';
import {
  BY_CODE,
  CAT_DOCUMENTS,
  CAT_OPEN_DEBTS,
  CAT_OTHER,
  CAT_PRICE,
  CAT_REMITTANCE,
  categoriesOf,
  HS_OPEN,
  M_THREAD,
  verifyHard,
} from '../shared/collections-inbox.ts';
import { C_DOCUMENTS, C_MONTHLY, C_PRICES, C_RECEIPTS } from '../shared/collections-outbox.ts';

// Attaches an inbound email IngestEmail recognised as a reply (isThreadReply, threadOf / linkedTable / linkedId)
// to what it answers instead of opening a new inquiry:
// - reply to an outbox row (Approvals, threadOf): lastReplyEmailId / lastReplyAt / replyCount on that row (counted
//   from the replies themselves, so a re-run never double counts);
//   · a case (Disputes): an Interactions row on the case's customer; a closed case is set back to בטיפול;
//   · a reply we drafted to an inbound email: that original email is reopened (handlingState לא טופל).
// - reply to an earlier inbound email (same provider thread): the original goes back to לא טופל.
// The reply row: status חדשה, handlingState לא טופל, classifiedBy קוד, the inherited customer, categories and
// bookkeeper, verification re-checked against that customer. Idempotent per email. Sends nothing.

const BALL_BOOKKEEPER = 'מנהלת חשבונות';
const CASE_ACTIVE = 'בטיפול';

const truthy = (v: unknown) => v === true || v === 'true';

/** The categories a reply inherits from the outbox row's component (when there is no original email). */
const CATEGORY_BY_COMPONENT: Record<string, string> = {
  [C_RECEIPTS]: CAT_REMITTANCE,
  [C_DOCUMENTS]: CAT_DOCUMENTS,
  [C_PRICES]: CAT_PRICE,
  [C_MONTHLY]: CAT_OPEN_DEBTS,
};

export const invoke = async (input: any, context: any) => {
  const dryRun = input?.dryRun === true;
  const id = clean(input?.inboundEmailId);
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  const out = (o: Item) => ({
    dryRun,
    attachedTo: null as Item | null,
    reopenedEmailId: '',
    disputeId: '',
    summary: '',
    writeVerified: false,
    errors,
    ...o,
  });
  if (!id) return out({ errors: ['חסר מזהה מייל (inboundEmailId)'] });

  const client = new BlocksClient(context);
  const [email] = await readByIds(client, 'InboundEmails', [id]);
  if (!email) return out({ errors: [`המייל ${id} לא נמצא`] });
  const threadOf = str(email.threadOf).trim();
  const linkedTable = str(email.linkedTable).trim();
  const linkedId = str(email.linkedId).trim();
  if (!truthy(email.isThreadReply) && !threadOf) return out({ errors: [`המייל ${id} אינו תשובה בשרשור (isThreadReply=false)`] });

  // what it answers
  const [approval] = threadOf ? await readByIds(client, 'Approvals', [threadOf]) : [null];
  if (threadOf && !approval) errors.push(`השורה בדואר היוצא ${threadOf} לא נמצאה`);
  const originalId = approval
    ? str(approval.relatedTable) === 'InboundEmails'
      ? str(approval.relatedId)
      : ''
    : linkedTable === 'InboundEmails'
      ? linkedId
      : '';
  const [original] = originalId && originalId !== id ? await readByIds(client, 'InboundEmails', [originalId]) : [null];
  if (!approval && !original) return out({ errors: [...errors, 'לא נמצא למה המייל עונה (לא שורה בדואר היוצא ולא מייל קודם)'] });

  // inherited customer, categories and bookkeeper
  const customerCode = str(approval?.customerCode).trim() || str(original?.customerCode).trim() || str(email.customerCode).trim();
  const [customer, owners, contacts, salesAgents] = await Promise.all([
    customerCode ? findCustomer(client, customerCode) : Promise.resolve(undefined),
    customerCode ? readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode }) : Promise.resolve([] as Item[]),
    readAll(client, 'CustomerContacts'),
    readAll(client, 'SalesAgents').catch(() => [] as Item[]),
  ]);
  const customerName = str(customer?.customerName) || str(approval?.customerName) || str(original?.customerName) || str(email.customerName);
  const bookkeeper =
    (customerCode ? ownerOf(customerCode, customer, buildOwnerMap(owners)) : '') ||
    str(original?.assignedBookkeeperName) ||
    str(email.assignedBookkeeperName) ||
    str(email.mailboxOwnerName);
  const inherited = original ? categoriesOf(original) : [];
  const fromComponent = approval ? CATEGORY_BY_COMPONENT[str(approval.component)] : '';
  const categories = inherited.length ? inherited : fromComponent ? [fromComponent] : categoriesOf(email).length ? categoriesOf(email) : [CAT_OTHER];
  const customersByCode = new Map(customer ? [[customerCode, customer]] : []);
  const verification = verifyHard({ address: str(email.fromAddress), customerCode: customerCode || null, contacts, customersByCode, salesAgents });

  const replyUpdate: Item = {
    status: 'חדשה',
    handlingState: HS_OPEN,
    waitingFor: null,
    waitingSince: null,
    handledBy: null,
    handledAt: null,
    classifiedBy: BY_CODE,
    categories: categories.join(', '),
    category: categories[0],
    customerCode: customerCode || null,
    customerName: customerCode ? customerName || null : null,
    customerMatchMethod: customerCode && customerCode !== str(email.customerCode).trim() ? M_THREAD : str(email.customerMatchMethod) || (customerCode ? M_THREAD : null),
    senderVerification: verification.status,
    verificationBasis: verification.basis || null,
    assignedBookkeeperName: bookkeeper || null,
    isThreadReply: true,
  };
  if (approval && !str(email.threadOf)) replyUpdate.threadOf = str(approval.id);

  // the outbox row: reply count and latest reply, counted from the replies themselves
  let approvalPatch: Item | null = null;
  if (approval) {
    const replies = await readAll(client, 'InboundEmails', { column: 'threadOf', value: str(approval.id) });
    if (!replies.some((r) => str(r.id) === id)) replies.push(email);
    const latest = replies.sort((a, b) => Date.parse(str(b.receivedAt)) - Date.parse(str(a.receivedAt)) || Number(b.id) - Number(a.id))[0];
    approvalPatch = { lastReplyEmailId: str(latest.id), lastReplyAt: str(latest.receivedAt) || nowIso, replyCount: replies.length };
  }

  // a case → Interactions row, a closed case back to active
  const isCase = !!approval && str(approval.relatedTable) === 'Disputes' && !!str(approval.relatedId);
  const [dispute] = isCase ? await readByIds(client, 'Disputes', [str(approval!.relatedId)]) : [null];
  if (isCase && !dispute) errors.push(`המקרה ${str(approval!.relatedId)} לא נמצא`);
  const caseLabel = dispute ? `מקרה ${str(dispute.disputeNumber) || str(dispute.id)}` : '';
  const interactionSummary = dispute ? `תשובה ב${caseLabel}: ${str(email.subject) || '(ללא נושא)'}` : '';
  let existingInteraction: Item | null = null;
  if (dispute && str(dispute.customerCode)) {
    const rows = await readAll(client, 'Interactions', { and: [{ column: 'customerCode', value: str(dispute.customerCode) }, { column: 'type', value: 'דואל' }, { column: 'direction', value: 'נכנס' }] });
    existingInteraction = rows.find((r) => str(r.summary) === interactionSummary && Date.parse(str(r.occurredAt)) === Date.parse(str(email.receivedAt))) ?? null;
  }
  const interaction: Item | null =
    dispute && str(dispute.customerCode) && !existingInteraction
      ? {
          customerCode: str(dispute.customerCode),
          customerName: str(dispute.customerName) || customerName || null,
          occurredAt: str(email.receivedAt) || nowIso,
          type: 'דואל',
          direction: 'נכנס',
          actorName: str(email.fromName) || str(email.fromAddress) || 'שולח לא ידוע',
          summary: interactionSummary,
          relatedInvoiceNumbers: str(dispute.invoiceNumbers) || null,
        }
      : null;
  const casePatch: Item | null = dispute && str(dispute.status) === CASE_CLOSED ? { status: CASE_ACTIVE, closedAt: null, ballWith: BALL_BOOKKEEPER } : null;

  // the original inquiry → reopened
  const reopen: Item | null =
    original && (str(original.handlingState) !== HS_OPEN || str(original.waitingFor) || str(original.handledBy))
      ? { handlingState: HS_OPEN, waitingFor: null, waitingSince: null, handledBy: null, handledAt: null }
      : null;

  const attachedTo = approval
    ? {
        table: 'Approvals',
        id: str(approval.id),
        referenceCode: str(approval.referenceCode) || null,
        label: `${str(approval.kind) || 'טיוטה'} ${str(approval.referenceCode) || `#${str(approval.id)}`}${caseLabel ? ` · ${caseLabel}` : ''}${original ? ` · מענה למייל "${str(original.subject) || '(ללא נושא)'}"` : ''}`,
      }
    : { table: 'InboundEmails', id: str(original!.id), referenceCode: null, label: `מייל קודם בשרשור: "${str(original!.subject) || '(ללא נושא)'}"` };
  const parts: string[] = [];
  parts.push(approval ? `תשובה ל${attachedTo.label}` : `המשך שרשור של ${attachedTo.label}`);
  if (casePatch) parts.push(`${caseLabel} נפתח מחדש`);
  else if (dispute) parts.push(`נרשמה ב${caseLabel}`);
  if (original) parts.push(reopen ? 'הפנייה המקורית נפתחה מחדש (לא טופל)' : 'הפנייה המקורית כבר פתוחה');
  const summary = parts.join(' · ');
  const base = {
    attachedTo,
    reopenedEmailId: original ? str(original.id) : '',
    disputeId: dispute ? str(dispute.id) : '',
    summary,
  };

  if (dryRun) {
    return out({ ...base, plan: { replyUpdate, approvalPatch, interaction, casePatch, reopen } });
  }

  // ---------- writes (each failure listed, never thrown) ----------
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${label}: ${errText(e)}`);
    }
  };
  await step('InboundEmails (התשובה)', () => client.updateItem('InboundEmails', id, replyUpdate));
  if (approval && approvalPatch) await step('Approvals', () => client.updateItem('Approvals', str(approval.id), approvalPatch!));
  if (interaction) await step('Interactions', () => client.createItem('Interactions', interaction));
  if (dispute && casePatch) await step('Disputes', () => client.updateItem('Disputes', str(dispute.id), casePatch));
  if (original && reopen) await step('InboundEmails (המקורי)', () => client.updateItem('InboundEmails', str(original.id), reopen));

  // read back
  const [back] = await readByIds(client, 'InboundEmails', [id]);
  const [aBack] = approval ? await readByIds(client, 'Approvals', [str(approval.id)]) : [null];
  const [oBack] = original && reopen ? await readByIds(client, 'InboundEmails', [str(original.id)]) : [null];
  let writeVerified =
    !!back && str(back.handlingState) === HS_OPEN && str(back.classifiedBy) === BY_CODE && (str(back.customerCode) || '') === (customerCode || '');
  if (approvalPatch) writeVerified = writeVerified && !!aBack && Number(aBack.replyCount) === approvalPatch.replyCount && str(aBack.lastReplyEmailId) === approvalPatch.lastReplyEmailId;
  if (reopen) writeVerified = writeVerified && !!oBack && str(oBack.handlingState) === HS_OPEN;
  if (errors.length) writeVerified = false;
  return out({ ...base, writeVerified });
};
