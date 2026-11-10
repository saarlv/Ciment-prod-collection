// Shared by CheckInvoiceDocuments and ApplyMailClassification (moved from CheckInvoiceDocuments/code.ts).
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { buildOwnerMap, errText, findCustomer, isFixtureCustomer, num, ownerOf, readAll, readWhereIn, str } from './collections-data.ts';
import { clean } from './collections-mail.ts';
import { allocateDisputeNumber, AGENT_MAYA, isTrue } from './collections-cases.ts';
import {
  BALL_BOOKKEEPER,
  BALL_LOGISTICS,
  cancelStaleLogisticsDrafts,
  countDocuments,
  countSentence,
  DOC_DISPUTE,
  logisticsContactFor,
  OUT_PACKAGE,
  OUT_REFUSED,
  OUT_WAITING,
  openDocCaseFor,
  prepareDocumentRequest,
  preparePackage,
  productLineOf,
  reminderHours,
  ST_ESCALATED,
  ST_READY,
  ST_REMINDER,
  ST_WAITING,
} from './collections-documents.ts';

// 2c engine for a "תעודות וחשבוניות חסרות" request. Per invoice of the request's customer:
// - total = max(Invoices.deliveryNotesExpected, DeliveryNotes found), scanned = notes with scanned=true
// - all scanned → Disputes case (תעודת משלוח חסרה, מוכנה לשליחה ללקוח) + the customer package draft
//   (Approvals מענה ללקוח: invoice document + every scan; only to a מאומת sender, otherwise a לאמת שולח
//   task and no package) → outcome "חבילה מוכנה" (or "הכל סרוק – לאמת שולח")
// - something missing → the case in ממתינה לסריקה with the missing notes, product line, logistics owner,
//   nextReminderAt = now + logisticsReminderHours, and the internal logistics request draft
//   (פנייה ללוגיסטיקה, never sent) → outcome "ממתינה לסריקה"
// - an invoice that is not the customer's (or not found) is refused and nothing is written for it →
//   outcome "סורבה". Another customer's documents are never packaged.
// - all scanned on a case that already had logistics drafts → those still ממתין are closed as נדחה
//   "בוטלה – כל התעודות נסרקו" (cancelledDraftIds); the package draft is never touched
// Idempotent: an open case for the invoice is updated (its reminder timer is kept), a pending draft is
// replaced. Writes nothing to Priority; nothing is sent.

export async function checkInvoiceDocuments(client: BlocksClient, input: any) {
  const dryRun = input?.dryRun === true;
  const nowIso = new Date().toISOString();
  const raw = Array.isArray(input?.invoiceNumbers) ? input.invoiceNumbers : typeof input?.invoiceNumbers === 'string' ? String(input.invoiceNumbers).split(/[,\n;]/) : [];
  const invoiceNumbers = [...new Set(raw.map((x: unknown) => str(x).trim()).filter(Boolean))] as string[];
  const emailId = clean(input?.inboundEmailId);
  const out = (o: Item) => ({ dryRun, invoices: [] as Item[], refused: [] as Item[], writeVerified: false, errors: [] as string[], ...o });
  if (!invoiceNumbers.length) return out({ errors: ['חסרים מספרי חשבוניות (invoiceNumbers)'] });

  let email: Item | null = null;
  if (emailId) {
    try {
      email = (await client.getItem('InboundEmails', emailId))?.item ?? null;
    } catch {
      email = null;
    }
    if (!email) return out({ errors: [`המייל ${emailId} לא נמצא`] });
  }
  const customerCode = clean(input?.customerCode) || str(email?.customerCode).trim();
  if (!customerCode) {
    return out({
      refused: invoiceNumbers.map((n) => ({ invoiceNumber: n, outcome: OUT_REFUSED, reason: 'הלקוח של הבקשה לא ידוע – קודם לקשר את המייל ללקוח (ClassifyAndLinkEmail)' })),
      writeVerified: true,
    });
  }

  const [customer, owners, invoices, notes, plContacts, disputes, hours] = await Promise.all([
    findCustomer(client, customerCode),
    readAll(client, 'CustomerOwners', { column: 'customerCode', value: customerCode }),
    readWhereIn(client, 'Invoices', 'invoiceNumber', invoiceNumbers),
    readWhereIn(client, 'DeliveryNotes', 'invoiceNumber', invoiceNumbers),
    readAll(client, 'ProductLineContacts'),
    readAll(client, 'Disputes'),
    reminderHours(client),
  ]);
  if (!customer) return out({ errors: [`לקוח ${customerCode} לא נמצא`] });
  const customerName = str(customer.customerName);
  const bookkeeper = ownerOf(customerCode, customer, buildOwnerMap(owners)) || str(email?.assignedBookkeeperName);
  const isTest = isFixtureCustomer(customer, customerCode) || isTrue(email?.isTestFixture);
  const takenNumbers = new Set(disputes.map((d) => str(d.disputeNumber)).filter(Boolean));
  const messageId = str(email?.messageId) || null;

  const results: Item[] = [];
  const refused: Item[] = [];
  const errors: string[] = [];
  const cancelledDraftIds: string[] = [];
  let verified = true;

  for (const no of invoiceNumbers) {
    const inv = invoices.find((i) => str(i.invoiceNumber) === no);
    if (!inv) {
      refused.push({ invoiceNumber: no, customerCode, outcome: OUT_REFUSED, reason: 'החשבונית לא נמצאה במערכת' });
      continue;
    }
    if (str(inv.customerCode) !== customerCode) {
      refused.push({ invoiceNumber: no, customerCode, outcome: OUT_REFUSED, reason: `החשבונית אינה של ${customerName} (${customerCode}) – לא נבדקה ולא תצורף` });
      continue;
    }
    const count = countDocuments(inv, no, notes);
    const productLine = productLineOf(inv, count.notes);
    const contact = logisticsContactFor(plContacts, productLine, isTest);
    const existing = openDocCaseFor(disputes, no);
    const base: Item = {
      customerCode,
      customerName,
      disputeType: DOC_DISPUTE,
      invoiceNumbers: no,
      disputedAmount: num(inv.openAmount),
      ownerBookkeeperName: bookkeeper || null,
      productLine: productLine || null,
      inboundEmailId: str(existing?.inboundEmailId) || messageId,
      isTestFixture: isTest,
    };
    let row: Item;
    if (count.allScanned) {
      row = {
        ...base,
        status: ST_READY,
        ballWith: BALL_BOOKKEEPER,
        description: `בקשת הלקוח לתעודות של חשבונית ${no}: ${countSentence(count)} – כל התעודות סרוקות, חבילה ללקוח`,
        missingNoteNumbers: null,
        nextReminderAt: null,
      };
    } else {
      const keepTimer = existing && [ST_WAITING, ST_REMINDER, ST_ESCALATED].includes(str(existing.status));
      row = {
        ...base,
        status: keepTimer && [ST_REMINDER, ST_ESCALATED].includes(str(existing!.status)) ? str(existing!.status) : ST_WAITING,
        ballWith: keepTimer && str(existing!.ballWith) ? str(existing!.ballWith) : BALL_LOGISTICS,
        description: `בקשת הלקוח לתעודות של חשבונית ${no}: ${countSentence(count)}`,
        missingNoteNumbers: count.missingNoteNumbers.join(', ') || null,
        logisticsOwnerName: str(contact?.logisticsOwnerName) || null,
        logisticsOwnerEmail: str(contact?.email).trim().toLowerCase() || null,
        nextReminderAt: keepTimer && str(existing!.nextReminderAt) ? str(existing!.nextReminderAt) : new Date(Date.parse(nowIso) + hours * 3_600_000).toISOString(),
        reminderCount: keepTimer ? num(existing!.reminderCount) : 0,
      };
    }
    if (!existing) {
      Object.assign(row, {
        disputeNumber: allocateDisputeNumber(takenNumbers, isTest),
        openedAt: nowIso,
        closedAt: null,
        resolution: null,
        reminderCount: row.reminderCount ?? 0,
      });
    }
    const view: Item = {
      invoiceNumber: no,
      customerCode,
      customerName,
      expected: count.expected,
      scanned: count.scanned,
      missingNoteNumbers: count.missingNoteNumbers,
      missingUnknown: count.missingUnknown,
      productLine: productLine || null,
      logisticsOwnerName: str(contact?.logisticsOwnerName) || null,
      outcome: count.allScanned ? OUT_PACKAGE : OUT_WAITING,
      caseStatus: row.status,
      caseAction: existing ? 'עודכן' : 'נפתח',
      disputeId: existing?.id ? String(existing.id) : null,
      disputeNumber: str(existing?.disputeNumber) || row.disputeNumber,
      approvalId: null as string | null,
      approvalKind: null as string | null,
      note: '',
    };
    results.push(view);

    try {
      let dispute: Item = existing ? { ...existing, ...row } : row;
      if (!dryRun) {
        const saved = existing
          ? (await client.updateItem('Disputes', String(existing.id), row))?.item
          : (await client.createItem('Disputes', row))?.item;
        const id = String(saved?.id ?? existing?.id ?? '');
        const back = id ? (await client.getItem('Disputes', id))?.item : null;
        if (!back || str(back.status) !== row.status || str(back.invoiceNumbers) !== no) verified = false;
        dispute = back ?? { ...dispute, id };
        view.disputeId = id || null;
        view.disputeNumber = str(dispute.disputeNumber);
        if (!existing) disputes.push(dispute);
      }
      if (count.allScanned) {
        const pkg = await preparePackage(client, { dispute, email, dryRun, nowIso });
        errors.push(...pkg.errors);
        view.outcome = pkg.packaged ? OUT_PACKAGE : pkg.outcome;
        view.approvalId = pkg.approval?.id ? String(pkg.approval.id) : null;
        view.approvalKind = pkg.packaged ? 'מענה ללקוח' : null;
        view.attachments = pkg.attachments;
        view.note = pkg.reason;
        if (pkg.verifyTask) view.verifyTask = pkg.verifyTask;
        if (!dryRun && !pkg.writeVerified) verified = false;
        // the case is complete: its logistics drafts still waiting (בקשה / תזכורת) are cancelled
        if (dispute.id) {
          const cancel = await cancelStaleLogisticsDrafts(client, { disputeIds: [String(dispute.id)], dryRun, nowIso });
          errors.push(...cancel.errors);
          if (!dryRun && !cancel.writeVerified) verified = false;
          view.cancelledDraftIds = cancel.cancelledIds;
          cancelledDraftIds.push(...cancel.cancelledIds);
        }
      } else {
        const req = await prepareDocumentRequest(client, { dispute, kind: 'בקשה', dryRun, nowIso, onlyIfNone: true });
        errors.push(...req.errors);
        view.approvalId = req.approval?.id ? String(req.approval.id) : null;
        view.approvalKind = 'פנייה ללוגיסטיקה';
        view.note = req.skipped || (req.noContact ? `אין איש לוגיסטיקה פעיל${productLine ? ` לקו ${productLine}` : ''} – הטיוטה נכתבה בלי נמען` : `טיוטה פנימית ל${str(contact?.logisticsOwnerName) || 'לוגיסטיקה'}; התזכורת ב-${row.nextReminderAt}`);
        if (dryRun) view.draft = req.approval;
        if (!dryRun && !req.writeVerified) verified = false;
      }
    } catch (e) {
      errors.push(`${no}: ${errText(e)}`);
      verified = false;
    }
  }

  return {
    dryRun,
    customerCode,
    customerName,
    requestedBy: clean(input?.requestedBy) || AGENT_MAYA,
    invoices: results,
    refused,
    cancelledDraftIds,
    writeVerified: !dryRun && verified && errors.length === 0,
    errors,
  };
}
