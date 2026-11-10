import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { buildOwnerMap, errText, isFixtureCustomer, ownerOf, readAll, readByIds, str } from '../shared/collections-data.ts';
import { clean, normEmail, VERIFIED } from '../shared/collections-mail.ts';
import { candidatesOf, M_SIGNATURE, readQuotes } from '../shared/collections-inbox.ts';
import {
  AP_ROLE,
  CONTACT_SOURCE_OURS,
  ensureManualTask,
  IDENTIFIED_BY_SIGNATURE,
  ourContactKey,
  priorityContactTaskKey,
  senderDecisionOf,
  signatureLines,
  SRC_INBOX,
  storedSignatureOf,
  TT_PRIORITY_CONTACT,
  type SenderDecision,
} from '../shared/collections-sender.ts';
import { verifySenderKey, OPEN_TASK_STATUSES, TS_DONE, TS_REJECTED } from '../shared/collections-tasks.ts';
import { applyMailClassification } from '../shared/collections-mail-route.ts';

// A person answers the "זה הלקוח X?" card of an inbound email from an unknown sender (plan 04.11 part C, stage 8).
// confirm: the sender belongs to customerCode → one CustomerContacts row (source נוסף אצלנו, isApContact true,
//   contactKey ours:<customerCode>:<address>; an existing row of ours for the same customer + address is updated, never
//   duplicated; Priority rows are never written), the email gets the customer, senderVerification מאומת, identifiedBy
//   חתימה and classificationQuotes.senderDecision; its open לאמת שולח task (verify-sender:<id>) is closed as טופל; one
//   task להוסיף איש קשר בפריוריטי (manual:priority-contact:<contactKey>) opens for the customer's bookkeeper; then
//   the email is routed again (shared/collections-mail-route.ts, idempotent) so its statement / open-debts draft is
//   prepared now.
// reject: the sender is not a customer contact – the email stays not verified, the task is closed as נדחה with the
//   note, the decision is stored on the email (the task is not opened again); nothing else is written.
// Idempotent: a second confirm of the same email for the same customer returns the existing contact and changes nothing.
// Never writes to Priority, sends nothing.

const OPEN = OPEN_TASK_STATUSES;

export const invoke = async (input: any, context: any) => {
  const emailId = clean(input?.inboundEmailId);
  const mode = clean(input?.mode);
  const decidedBy = clean(input?.decidedBy) || null;
  const note = clean(input?.note) || null;
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  const base = { mode, contactId: '', contactKey: '', customerCode: '', customerName: '', priorityTaskId: '', rerouted: false };
  const fail = (message: string) => ({ ...base, message, errors: [message] });

  if (!emailId) return fail('חסר מזהה מייל (inboundEmailId)');
  if (mode !== 'confirm' && mode !== 'reject') return fail(`mode חייב להיות confirm או reject (התקבל "${mode}")`);
  const client = new BlocksClient(context);
  const [email] = await readByIds(client, 'InboundEmails', [emailId]);
  if (!email) return fail(`המייל ${emailId} לא נמצא`);
  const address = normEmail(email.fromAddress);
  if (!address) return fail('למייל אין כתובת שולח תקינה');
  const prior = senderDecisionOf(email);
  const quotes = readQuotes(email.classificationQuotes);
  const sig = storedSignatureOf(email);

  const verifyTasks = (await readAll(client, 'CollectionQueue', { column: 'taskKey', value: verifySenderKey(emailId) }).catch(() => [] as Item[])).filter((t) =>
    OPEN.includes(str(t.status)),
  );
  const closeVerifyTasks = async (status: string, reason: string) => {
    for (const t of verifyTasks) {
      try {
        await client.updateItem('CollectionQueue', str(t.id), { status, handledBy: decidedBy, handledAt: nowIso, resolvedAt: nowIso, resolvedReason: reason, lastCheckedAt: nowIso });
      } catch (e) {
        errors.push(`סגירת המשימה ${str(t.id)}: ${errText(e)}`);
      }
    }
  };

  // ---------- reject ----------
  if (mode === 'reject') {
    const decision: SenderDecision = { mode: 'reject', customerCode: null, customerName: null, contactId: null, contactKey: null, decidedBy, decidedAt: nowIso, note };
    if (prior?.mode === 'confirm') return fail('השולח כבר אושר כאיש קשר של לקוח – אי אפשר לדחות אחרי אישור');
    if (prior?.mode !== 'reject') {
      try {
        await client.updateItem('InboundEmails', emailId, { classificationQuotes: { ...quotes, senderDecision: decision } });
      } catch (e) {
        return fail(`שמירת ההחלטה נכשלה: ${errText(e)}`);
      }
    }
    await closeVerifyTasks(TS_REJECTED, `השולח אינו איש קשר של לקוח${note ? ` – ${note}` : ''}`);
    return {
      ...base,
      message: `${address} סומן כשולח שאינו איש קשר של לקוח. המייל נשאר לא מאומת${verifyTasks.length ? ' והמשימה נסגרה' : ''}.`,
      errors,
    };
  }

  // ---------- confirm ----------
  const code = clean(input?.customerCode) || str(email.suggestedCustomerCode).trim();
  if (!code) return fail('חסר קוד לקוח (customerCode) לאישור');
  const [customers, owners] = await Promise.all([
    readAll(client, 'Customers', { column: 'customerCode', value: code }),
    readAll(client, 'CustomerOwners', { column: 'customerCode', value: code }).catch(() => [] as Item[]),
  ]);
  const customer = customers[0];
  if (!customer) return fail(`הלקוח ${code} לא נמצא`);
  const customerName = str(customer.customerName) || code;
  const bookkeeper = ownerOf(code, customer, buildOwnerMap(owners)) || str(email.assignedBookkeeperName) || str(email.mailboxOwnerName) || null;
  const isTest = isFixtureCustomer(customer, code) || email.isTestFixture === true || email.isTestFixture === 'true';
  const contactKey = ourContactKey(code, address);

  // our contact row: by key, else any row of ours for the same customer + address (never a Priority row)
  const sameAddress = (await readAll(client, 'CustomerContacts', { column: 'customerCode', value: code })).filter((c) => normEmail(c.email) === address);
  const ours = sameAddress.find((c) => str(c.contactKey) === contactKey) ?? sameAddress.find((c) => str(c.source) === CONTACT_SOURCE_OURS);

  // idempotent: the same email already confirmed for this customer
  if (prior?.mode === 'confirm' && prior.customerCode === code && ours) {
    const existingTask = (await readAll(client, 'CollectionQueue', { column: 'taskKey', value: priorityContactTaskKey(str(ours.contactKey) || contactKey) }).catch(() => [] as Item[]))[0];
    return {
      ...base,
      contactId: str(ours.id),
      contactKey: str(ours.contactKey) || contactKey,
      customerCode: code,
      customerName,
      priorityTaskId: str(existingTask?.id),
      message: `השולח ${address} כבר אושר כאיש קשר של ${customerName} – לא נעשה שינוי.`,
      errors,
    };
  }

  const contactName = clean(input?.contactName) || str(sig?.personName).trim() || str(email.fromName).trim() || null;
  const contactRow: Item = {
    contactKey: str(ours?.contactKey) || contactKey,
    customerCode: code,
    customerName,
    contactName,
    email: address,
    roleFlags: AP_ROLE,
    source: CONTACT_SOURCE_OURS,
    isApContact: true,
    signatureTitle: str(sig?.title).trim() || str(ours?.signatureTitle) || null,
    addedFromEmailId: emailId,
  };
  let contact: Item | undefined;
  try {
    if (ours) {
      const patch: Item = { ...contactRow };
      if (!clean(input?.contactName) && str(ours.contactName)) patch.contactName = str(ours.contactName);
      contact = (await client.updateItem('CustomerContacts', str(ours.id), patch))?.item ?? { ...ours, ...patch };
    } else {
      contact = (await client.createItem('CustomerContacts', { ...contactRow, phone: null, syncedAt: null }))?.item;
    }
  } catch (e) {
    return fail(`שמירת איש הקשר נכשלה: ${errText(e)}`);
  }
  const contactId = str(contact?.id);
  const finalKey = str(contact?.contactKey) || contactRow.contactKey;

  // the email: customer, verified, the decision (the re-route keeps it)
  const decision: SenderDecision = { mode: 'confirm', customerCode: code, customerName, contactId, contactKey: finalKey, decidedBy, decidedAt: nowIso, note };
  const candidates = candidatesOf(email);
  const storedCandidates = Array.isArray(quotes.candidates) ? (quotes.candidates as Item[]) : candidates;
  const withConfirmed = storedCandidates.some((c) => str(c.customerCode) === code)
    ? storedCandidates
    : [{ customerCode: code, customerName, method: M_SIGNATURE }, ...storedCandidates];
  try {
    await client.updateItem('InboundEmails', emailId, {
      customerCode: code,
      customerName,
      senderVerification: VERIFIED,
      verificationBasis: `אושר ידנית${decidedBy ? ` ע״י ${decidedBy}` : ''}: ${address} נשמר כאיש קשר בהנהלת חשבונות של ${customerName} (${code})`,
      identifiedBy: IDENTIFIED_BY_SIGNATURE,
      assignedBookkeeperName: bookkeeper,
      classificationQuotes: { ...quotes, candidates: withConfirmed, senderDecision: decision },
    });
  } catch (e) {
    return fail(`עדכון המייל נכשל: ${errText(e)}`);
  }

  await closeVerifyTasks(TS_DONE, `השולח אושר כאיש קשר של ${customerName}`);

  // the contact in Priority: by hand until there is an API
  const task = await ensureManualTask(
    client,
    {
      key: priorityContactTaskKey(finalKey),
      taskType: TT_PRIORITY_CONTACT,
      title: `${TT_PRIORITY_CONTACT} – ${customerName}: ${contactName || address}`,
      reasons: [
        `${contactName || address} <${address}> אושר כאיש קשר בהנהלת חשבונות של ${customerName} (${code})${decidedBy ? ` ע״י ${decidedBy}` : ''}, ממייל "${str(email.subject).trim() || '(ללא נושא)'}"`,
        ...signatureLines(sig),
        'להוסיף את איש הקשר בכרטיס הלקוח בפריוריטי ולסמן אותו כהנהלת חשבונות',
      ].join('. '),
      recommendedAction: 'לטפל במייל',
      source: SRC_INBOX,
      customerCode: code,
      customerName,
      owner: bookkeeper,
      relatedTable: 'CustomerContacts',
      relatedId: contactId,
      invoiceNumbers: [],
      isTestFixture: isTest,
    },
    nowIso,
  );
  if (task.error) errors.push(task.error);

  // route the email again: its statement / open-debts draft now (idempotent per email)
  let rerouted = false;
  let routeSummary = '';
  try {
    const [fresh] = await readByIds(client, 'InboundEmails', [emailId]);
    const classification = classificationFromStored(fresh ?? email, code);
    const r: Item = await applyMailClassification(client, {
      inboundEmailId: emailId,
      classification,
      classifiedBy: str(email.classifiedBy) === 'קוד' && !classification ? 'קוד' : 'מאיה',
    });
    rerouted = !!r && !(r.errors as string[] | undefined)?.some((e) => e.startsWith('שמירת המיון נכשלה'));
    routeSummary = str(r?.summary);
    errors.push(...((r?.errors ?? []) as string[]).map((e) => `ניתוב: ${e}`));
  } catch (e) {
    errors.push(`ניתוב מחדש נכשל: ${errText(e)}`);
  }

  return {
    ...base,
    contactId,
    contactKey: finalKey,
    customerCode: code,
    customerName,
    priorityTaskId: task.id,
    rerouted,
    message: `${contactName || address} נשמר כאיש קשר בהנהלת חשבונות של ${customerName}. נפתחה משימה להוסיף אותו בפריוריטי${rerouted ? `; המייל נותב מחדש${routeSummary ? ` (${routeSummary})` : ''}` : ''}.`,
    errors,
  };
};

/** Maya's sorting rebuilt from what the routing stored on the email (verified items only), for the confirmed customer. */
export function classificationFromStored(email: Item, customerCode: string): Item | null {
  const q = readQuotes(email.classificationQuotes);
  const types = (Array.isArray(q.types) ? q.types : []).filter((t: any) => t && t.verified !== false && str(t.type).trim() && str(t.quote).trim());
  if (!types.length) return null;
  const invoices = (Array.isArray(q.invoices) ? q.invoices : []).filter((i: any) => i && i.verified).map((i: any) => ({ invoiceNumber: str(i.invoiceNumber), quote: str(i.quote) }));
  const p = q.promise && typeof q.promise === 'object' ? (q.promise as Item) : null;
  const d = q.dispute && typeof q.dispute === 'object' ? (q.dispute as Item) : null;
  const s = q.signature && typeof q.signature === 'object' ? (q.signature as Item) : null;
  return {
    types: types.map((t: any) => ({ type: str(t.type), quote: str(t.quote) })),
    customerCode,
    senderRole: str(email.senderRole) || null,
    invoices,
    promise: p ? { amount: p.amount ?? null, date: p.date ?? null, method: p.method ?? null, quote: str(p.quote), invoiceNumbers: Array.isArray(p.invoiceNumbers) ? p.invoiceNumbers : [] } : null,
    dispute: d ? { reason: str(d.reason), invoiceNumbers: Array.isArray(d.invoiceNumbers) ? d.invoiceNumbers : [], quote: str(d.quote) } : null,
    signature: s ? { companyName: s.companyName ?? null, personName: s.personName ?? null, title: s.title ?? null, logoText: s.logoText ?? null, quote: str(s.quote) } : null,
    summary: str(email.agentSummary),
  };
}
