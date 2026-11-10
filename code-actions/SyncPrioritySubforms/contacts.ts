// contacts scope: CUSTOMERS?$select=CUSTNAME,CUSTDES&$expand=CUSTPERSONNEL_SUBFORM, 50 per read, keyset on CUSTNAME.
import type { Item } from '../shared/blocks/blocks-client.ts';
import {
  PD_SOURCE, priorityRead, queryAll, writeChunks, sameFields, str, errText, odataStr, isInternalCustomer, numOrNull, textOrNull,
} from '../shared/priority-direct.ts';
import { type RunCtx, type ScopeResult, newResult, loadCursor, saveCursor, verifySample, flag } from './common.ts';

const PAGE = 50;

// accounts / bookkeeping contacts: only ever set isApContact true; never reset (a person may flag it in the app)
const AP_RE = /הנה["״׳']?ח|הנהלת חשבונות|חשבונות|חשבי?ן|כספים|גבי[יה]|accounts?|bookkeep|\bAP\b|finance/i;

function contactsOf(cust: Item): Item[] {
  let c = cust?.CUSTPERSONNEL_SUBFORM;
  if (typeof c === 'string') {
    try {
      c = JSON.parse(c);
    } catch {
      throw new Error(`CUSTPERSONNEL_SUBFORM של ${str(cust.CUSTNAME)} חזר כטקסט שאינו JSON`);
    }
  }
  if (Array.isArray(c)) return c;
  if (Array.isArray(c?.value)) return c.value;
  return [];
}

function mapContact(cust: Item, c: Item): Item {
  const code = str(cust.CUSTNAME).trim();
  const key = `${code}:${c.PHONE}`;
  const first = textOrNull(c.FIRSTNAME);
  const last = textOrNull(c.LASTNAME);
  const position = textOrNull(c.POSITIONDES);
  const contactName = textOrNull(c.NAME) ?? ([first, last].filter(Boolean).join(' ') || null);
  const isAp = AP_RE.test(position ?? '') || AP_RE.test(contactName ?? '');
  return {
    contactKey: key,
    priorityKey: key,
    priorityContactId: numOrNull(c.PHONE),
    customerCode: code,
    customerName: textOrNull(cust.CUSTDES),
    contactName,
    firstName: first,
    lastName: last,
    position,
    email: textOrNull(c.EMAIL),
    phone: textOrNull(c.PHONENUM),
    mobile: textOrNull(c.CELLPHONE),
    officePhone: textOrNull(c.OFFICEPHONE),
    fax: textOrNull(c.FAX),
    priorityStatus: textOrNull(c.STATDES),
    isInactive: flag(c.INACTIVE),
    firm: textOrNull(c.FIRM),
    source: PD_SOURCE,
    deletedInSource: false,
    ...(isAp ? { isApContact: true } : {}),
  };
}

export async function runContacts(ctx: RunCtx): Promise<ScopeResult> {
  const res = newResult('contacts', 'CustomerContacts', 'CUSTOMERS/CUSTPERSONNEL_SUBFORM');
  const { client } = ctx;
  const written: string[] = [];
  try {
    const cur = await loadCursor(client, 'contacts');
    let cursorId: string | null = str(cur?.id) || null;
    const open = ctx.resume && cur && str(cur.phase) !== 'הושלם' && str(cur.cursor?.lastCustomerKey);
    let last = open ? str(cur!.cursor.lastCustomerKey) : '';
    const seen = new Set<string>(open && Array.isArray(cur!.cursor?.seenCustomers) ? cur!.cursor.seenCustomers.map(str) : []);
    const passRunId = open ? str(cur!.runId) || ctx.runId : ctx.runId;
    res.mode = cur?.lastFullReadAt ? 'דלתא' : 'טעינה ראשונה';
    console.log(`[contacts] mode=${res.mode} resume=${open ? `after ${last}` : 'no'}`);

    const existing = await queryAll(client, 'CustomerContacts');
    const byKey = new Map(existing.map((r) => [str(r.contactKey), r]));
    const pdByCustomer = new Map<string, Item[]>();
    for (const r of existing) {
      if (str(r.source) !== PD_SOURCE || r.addedFromEmailId) continue;
      const k = str(r.customerCode);
      if (!pdByCustomer.has(k)) pdByCustomer.set(k, []);
      pdByCustomer.get(k)!.push(r);
    }
    console.log(`[contacts] mirror rows=${existing.length}`);

    const meta = () => ({ syncedAt: ctx.nowIso, syncRunId: ctx.runId });
    const flush = async (creates: Item[], updates: Item[]) => {
      if (ctx.dryRun) return;
      if (creates.length) await writeChunks(creates, (c) => client.createItems('CustomerContacts', c));
      if (updates.length) await writeChunks(updates, (c) => client.updateItems('CustomerContacts', c));
    };

    while (true) {
      if (Date.now() >= ctx.readDeadline) {
        res.needsResume = true;
        break;
      }
      const page = await priorityRead(client, {
        entityName: 'CUSTOMERS', select: 'CUSTNAME,CUSTDES', expand: 'CUSTPERSONNEL_SUBFORM', top: PAGE, orderby: 'CUSTNAME',
        ...(last ? { filter: `CUSTNAME gt ${odataStr(last)}` } : {}),
      }, `CUSTOMERS after ${last || '-'}`);
      res.calls++;
      const creates: Item[] = [];
      const updates: Item[] = [];
      for (const cust of page) {
        const code = str(cust.CUSTNAME).trim();
        if (!code) continue;
        seen.add(code);
        if (isInternalCustomer(code)) continue;
        const keysHere = new Set<string>();
        for (const c of contactsOf(cust)) {
          if (c?.PHONE === null || c?.PHONE === undefined || c?.PHONE === '') continue;
          const m = mapContact(cust, c);
          keysHere.add(m.contactKey);
          res.sourceRows++;
          const ex = byKey.get(m.contactKey);
          if (ex && (str(ex.source) !== PD_SOURCE || ex.addedFromEmailId)) {
            res.skippedAppRows++;
            continue;
          }
          if (!ex) {
            creates.push({ ...m, ...meta() });
            res.inserted++;
            written.push(m.contactKey);
          } else if (sameFields(ex, m)) res.unchanged++;
          else {
            updates.push({ id: ex.id, ...m, ...meta() });
            res.updated++;
            written.push(m.contactKey);
          }
        }
        // the customer was read in full: its priority-direct contacts that are gone are marked deleted
        for (const r of pdByCustomer.get(code) ?? []) {
          if (!keysHere.has(str(r.contactKey)) && !r.deletedInSource) {
            updates.push({ id: r.id, deletedInSource: true, ...meta() });
            res.markedDeletedInSource++;
          }
        }
      }
      await flush(creates, updates);
      if (page.length) last = str(page[page.length - 1].CUSTNAME).trim();
      if (page.length < PAGE) {
        res.complete = true;
        break;
      }
      cursorId = await saveCursor(ctx, 'contacts', cursorId, {
        runId: passRunId, mode: res.mode, phase: 'רשימה', cursor: { lastCustomerKey: last, seenCustomers: [...seen] }, pendingCount: null,
      });
    }

    if (res.complete) {
      // customers that no longer exist in Priority: their contacts are marked deleted
      const gone: Item[] = [];
      for (const [code, rows] of pdByCustomer) {
        if (seen.has(code)) continue;
        for (const r of rows) if (!r.deletedInSource) gone.push({ id: r.id, deletedInSource: true, ...meta() });
      }
      res.markedDeletedInSource += gone.length;
      await flush([], gone);
      cursorId = await saveCursor(ctx, 'contacts', cursorId, {
        runId: passRunId, mode: res.mode, phase: 'הושלם', cursor: { lastCustomerKey: null }, pendingCount: 0, lastFullReadAt: new Date().toISOString(),
      });
      res.gate = 'passed';
    } else {
      res.gate = 'incomplete read';
      res.notes.push(`נעצר בתקציב הזמן אחרי ${last}; ההרצה הבאה תמשיך משם`);
    }
    res.expectedRows = res.sourceRows;
    res.estimatedRemainingCalls = res.complete ? 0 : null;
  } catch (e) {
    res.error = errText(e);
    res.gate = 'incomplete read';
    console.error(`[contacts] ${res.error}`);
  }
  res.writeVerified = await verifySample(ctx, 'CustomerContacts', 'contactKey', written);
  console.log(`[contacts] calls=${res.calls} rows=${res.sourceRows} +${res.inserted} ~${res.updated} =${res.unchanged} del=${res.markedDeletedInSource} skipApp=${res.skippedAppRows} complete=${res.complete}`);
  return res;
}
