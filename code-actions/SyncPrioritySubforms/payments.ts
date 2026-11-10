// payments scope: list receipt headers (TINVOICES, 12 months), then read TINVOICES(...)/TPAYMENT_SUBFORM per receipt.
// Resumable through the PrioritySyncCursors 'payments' row.
import type { Item } from '../shared/blocks/blocks-client.ts';
import {
  PD_SOURCE, priorityRead, queryAll, writeChunks, sameFields, mapLimit, str, errText, odataStr, isNotFound,
  numOrNull, textOrNull, dateOnly,
} from '../shared/priority-direct.ts';
import { type RunCtx, type ScopeResult, newResult, loadCursor, saveCursor, verifySample, flag } from './common.ts';

const LIST_PAGE = 100;
const BATCH = 50; // receipts per write + cursor save
const DELTA_DAYS = 14;
const DRY_RUN_LINE_READS = 20; // a dry run samples this many receipts' lines and estimates the rest
const DATE_FIELDS = ['receiptDate', 'checkDueDate', 'paymentDate'];

/** Compact receipt header kept in the cursor. */
interface Hdr {
  IVNUM: string;
  DEBIT: string;
  CUSTNAME: string | null;
  CDES: string | null;
  IVDATE: string | null;
  TOTPRICE: number | null;
  STATDES: string | null;
  AGENTNAME: string | null;
  DETAILS: string | null;
}
const toHdr = (h: Item): Hdr => ({
  IVNUM: str(h.IVNUM).trim(),
  DEBIT: str(h.DEBIT).trim() || 'D',
  CUSTNAME: textOrNull(h.CUSTNAME),
  CDES: textOrNull(h.CDES),
  IVDATE: dateOnly(h.IVDATE),
  TOTPRICE: numOrNull(h.TOTPRICE),
  STATDES: textOrNull(h.STATDES),
  AGENTNAME: textOrNull(h.AGENTNAME),
  DETAILS: textOrNull(h.DETAILS)?.slice(0, 300) ?? null,
});

function methodOf(details: string | null, payDate: string | null, ivDate: string | null): string | undefined {
  const d = details ?? '';
  if (/צ['׳’]ק/.test(d)) return payDate && ivDate && payDate > ivDate ? 'צ׳ק דחוי' : 'צ׳ק';
  if (/העברה/.test(d)) return 'העברה בנקאית';
  if (/אשראי/.test(d)) return 'כרטיס אשראי';
  return undefined;
}

function mapLine(h: Hdr, l: Item): Item {
  const key = `${h.IVNUM}:${l.KLINE}`;
  const payDate = dateOnly(l.PAYDATE);
  const wt = [l.WTAX, l.WTAX2, l.WTAX3].map(numOrNull);
  const lineDetails = textOrNull(l.DETAILS);
  const m: Item = {
    paymentRef: key,
    priorityKey: key,
    receiptNumber: h.IVNUM,
    customerCode: h.CUSTNAME,
    customerName: h.CDES,
    receiptDate: h.IVDATE,
    receiptTotal: h.TOTPRICE,
    receiptStatus: h.STATDES,
    receiptAgentName: h.AGENTNAME,
    receiptDetails: h.DETAILS,
    collectedBy: h.AGENTNAME,
    lineNumber: numOrNull(l.KLINE),
    paymentId: numOrNull(l.PAYMENT),
    amount: numOrNull(l.QPRICE),
    lineTotal: numOrNull(l.TOTPRICE),
    currency: textOrNull(l.CODE),
    checkDueDate: payDate,
    paymentDate: h.IVDATE,
    chequeNumber: textOrNull(l.CARDNUM),
    bankCode: textOrNull(l.BANKCODE),
    bankName: textOrNull(l.BANKNAME),
    branch: textOrNull(l.BRANCH),
    bankAccount: textOrNull(l.PAYACCOUNT),
    withholdingTax: wt.every((x) => x === null) ? null : wt.reduce((a: number, x) => a + (x ?? 0), 0),
    isReversal: flag(l.STORNOFLAG),
    paymentType: lineDetails,
    cashflowCode: textOrNull(l.CASHFLOWCODE),
    source: PD_SOURCE,
    deletedInSource: false,
  };
  const method = methodOf(lineDetails, payDate, h.IVDATE);
  if (method) m.method = method;
  return m;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function runPayments(ctx: RunCtx): Promise<ScopeResult> {
  const res = newResult('payments', 'Payments', 'TINVOICES/TPAYMENT_SUBFORM');
  const { client } = ctx;
  const written: string[] = [];
  res.receiptsListed = 0;
  res.receiptsRead = 0;
  res.receiptsWithoutLines = 0;
  res.receiptsFailed = 0;
  try {
    const cur = await loadCursor(client, 'payments');
    let cursorId: string | null = str(cur?.id) || null;
    const c0: Item = (cur?.cursor && typeof cur.cursor === 'object' ? cur.cursor : {}) as Item;
    const lastFullReadAt = cur?.lastFullReadAt ?? null;
    const emptyReceipts: Record<string, string> = c0.emptyReceipts && typeof c0.emptyReceipts === 'object' ? { ...c0.emptyReceipts } : {};
    const open = ctx.resume && cur && ['רשימה', 'קריאת שורות'].includes(str(cur.phase)) && c0.sinceDate;

    // pass state
    let mode: string;
    let phase: string;
    let sinceDate: string;
    let lastIvnum: string;
    let listed: Set<string>;
    let pending: Hdr[];
    let doneCount: number;
    let passRunId: string;
    if (open) {
      mode = str(cur!.mode) || (lastFullReadAt ? 'דלתא' : 'טעינה ראשונה');
      phase = str(cur!.phase);
      sinceDate = str(c0.sinceDate);
      lastIvnum = str(c0.lastIvnum);
      listed = new Set(Array.isArray(c0.listedIvnums) ? c0.listedIvnums.map(str) : []);
      pending = Array.isArray(c0.pendingReceipts) ? c0.pendingReceipts : [];
      doneCount = Number(c0.doneCount) || 0;
      passRunId = str(cur!.runId) || ctx.runId;
    } else {
      mode = lastFullReadAt ? 'דלתא' : 'טעינה ראשונה';
      phase = 'רשימה';
      const since = new Date(ctx.nowIso);
      since.setUTCMonth(since.getUTCMonth() - 12);
      sinceDate = isoDay(since);
      lastIvnum = '';
      listed = new Set();
      pending = [];
      doneCount = 0;
      passRunId = ctx.runId;
    }
    res.mode = mode;
    const deltaFrom = isoDay(new Date(Date.parse(ctx.nowIso) - DELTA_DAYS * 86400000));
    console.log(`[payments] mode=${mode} phase=${phase} since=${sinceDate} resume=${open ? 'yes' : 'no'} pending=${pending.length} listed=${listed.size}`);

    // mirror
    const all = await queryAll(client, 'Payments');
    const byRef = new Map(all.map((r) => [str(r.paymentRef), r]));
    const pdByReceipt = new Map<string, Item[]>();
    for (const r of all) {
      if (str(r.source) !== PD_SOURCE) continue;
      const k = str(r.receiptNumber);
      if (!pdByReceipt.has(k)) pdByReceipt.set(k, []);
      pdByReceipt.get(k)!.push(r);
    }
    console.log(`[payments] mirror rows=${all.length} priority-direct receipts=${pdByReceipt.size}`);

    const wanted = (h: Hdr): boolean => {
      if (mode === 'טעינה ראשונה') return true;
      if (h.IVDATE && h.IVDATE >= deltaFrom) return true;
      const rows = pdByReceipt.get(h.IVNUM);
      if (!rows?.length) return emptyReceipts[h.IVNUM] === undefined || emptyReceipts[h.IVNUM] !== str(h.STATDES);
      return rows.some((r) => str(r.receiptStatus) !== str(h.STATDES));
    };

    const cursorFields = () => ({
      runId: passRunId, mode, phase,
      cursor: { sinceDate, lastIvnum, listedIvnums: [...listed], pendingReceipts: pending, doneCount, emptyReceipts },
      pendingCount: pending.length,
    });
    const meta = () => ({ syncedAt: ctx.nowIso, syncRunId: ctx.runId });

    // ---- phase 1: header list ----
    if (phase === 'רשימה') {
      const pendingSet = new Set(pending.map((p) => p.IVNUM));
      while (true) {
        if (Date.now() >= ctx.readDeadline) {
          res.needsResume = true;
          break;
        }
        const filter = `IVDATE ge ${sinceDate}T00:00:00Z${lastIvnum ? ` and IVNUM gt ${odataStr(lastIvnum)}` : ''}`;
        const page = await priorityRead(client, {
          entityName: 'TINVOICES', select: 'IVNUM,CUSTNAME,CDES,IVDATE,TOTPRICE,STATDES,AGENTNAME,DETAILS,IVTYPE,DEBIT',
          filter, orderby: 'IVNUM', top: LIST_PAGE,
        }, `TINVOICES list after ${lastIvnum || '-'}`);
        res.calls++;
        for (const raw of page) {
          const h = toHdr(raw);
          if (!h.IVNUM) continue;
          listed.add(h.IVNUM);
          if (!pendingSet.has(h.IVNUM) && wanted(h)) {
            pending.push(h);
            pendingSet.add(h.IVNUM);
          }
        }
        if (page.length) lastIvnum = str(page[page.length - 1].IVNUM).trim();
        if (page.length < LIST_PAGE) {
          phase = 'קריאת שורות';
          break;
        }
      }
      res.receiptsListed = listed.size;
      cursorId = await saveCursor(ctx, 'payments', cursorId, cursorFields());
      console.log(`[payments] list ${phase === 'קריאת שורות' ? 'complete' : 'stopped'}: listed=${listed.size} pending=${pending.length}`);
    }

    // ---- phase 2: lines per receipt ----
    if (phase === 'קריאת שורות') {
      let dryLeft = DRY_RUN_LINE_READS;
      let consecutiveFailures = 0;
      while (pending.length) {
        if (Date.now() >= ctx.readDeadline || (ctx.dryRun && dryLeft <= 0) || consecutiveFailures >= 10) {
          res.needsResume = !ctx.dryRun || pending.length > 0;
          break;
        }
        const batch = pending.slice(0, ctx.dryRun ? Math.min(BATCH, dryLeft) : BATCH);
        const results = await mapLimit(batch, 2, async (h) => {
          if (Date.now() >= ctx.readDeadline) return { h, skipped: true as const };
          const path = `TINVOICES(IVNUM=${odataStr(h.IVNUM)},IVTYPE='T',DEBIT='${h.DEBIT === 'C' ? 'C' : 'D'}')/TPAYMENT_SUBFORM`;
          try {
            const lines = await priorityRead(client, { entityName: path }, `TPAYMENT ${h.IVNUM}`);
            return { h, lines };
          } catch (e) {
            if (isNotFound(e)) return { h, notFound: true as const };
            return { h, error: errText(e) };
          }
        });
        const creates: Item[] = [];
        const updates: Item[] = [];
        const done = new Set<string>();
        for (const r of results) {
          if (!r || 'skipped' in r) continue;
          res.calls++;
          const h = r.h;
          if ('error' in r && r.error) {
            res.receiptsFailed++;
            consecutiveFailures++;
            if (res.notes.length < 5) res.notes.push(`${h.IVNUM}: ${r.error}`);
            continue;
          }
          consecutiveFailures = 0;
          done.add(h.IVNUM);
          res.receiptsRead++;
          if ('notFound' in r) continue; // vanished between list and read: leave its rows as they are
          const lines = (r.lines ?? []).filter((l: Item) => l?.KLINE !== null && l?.KLINE !== undefined);
          if (!lines.length) {
            res.receiptsWithoutLines++;
            emptyReceipts[h.IVNUM] = str(h.STATDES);
          } else delete emptyReceipts[h.IVNUM];
          const keysHere = new Set<string>();
          for (const l of lines) {
            const m = mapLine(h, l);
            keysHere.add(m.paymentRef);
            res.sourceRows++;
            const ex = byRef.get(m.paymentRef);
            if (ex && str(ex.source) !== PD_SOURCE) {
              res.skippedAppRows++;
              continue;
            }
            if (!ex) {
              creates.push({ ...m, ...meta() });
              res.inserted++;
              written.push(m.paymentRef);
            } else if (sameFields(ex, m, DATE_FIELDS)) res.unchanged++;
            else {
              updates.push({ id: ex.id, ...m, ...meta() });
              res.updated++;
              written.push(m.paymentRef);
            }
          }
          // the receipt's lines were fully re-read: priority-direct lines that are gone are marked deleted
          for (const ex of pdByReceipt.get(h.IVNUM) ?? []) {
            if (!keysHere.has(str(ex.paymentRef)) && !ex.deletedInSource) {
              updates.push({ id: ex.id, deletedInSource: true, ...meta() });
              res.markedDeletedInSource++;
            }
          }
        }
        if (ctx.dryRun) dryLeft -= batch.length;
        if (!ctx.dryRun) {
          if (creates.length) await writeChunks(creates, (c) => client.createItems('Payments', c));
          if (updates.length) await writeChunks(updates, (c) => client.updateItems('Payments', c));
        }
        // failed receipts move to the back so one bad receipt never blocks the pass
        const failed = batch.filter((h) => !done.has(h.IVNUM) && results.some((r) => r && 'error' in r && r.h.IVNUM === h.IVNUM));
        pending = [...pending.filter((h) => !batch.includes(h)), ...failed, ...batch.filter((h) => !done.has(h.IVNUM) && !failed.includes(h))];
        doneCount += done.size;
        if (!ctx.dryRun) cursorId = await saveCursor(ctx, 'payments', cursorId, cursorFields());
        if (Date.now() >= ctx.hardDeadline) {
          res.needsResume = true;
          break;
        }
        if (done.size === 0 && batch.every((h) => !done.has(h.IVNUM)) && results.every((r) => !r || 'skipped' in r)) break;
      }

      if (!pending.length) {
        // pass complete: receipts gone from the full 12-month header list → their lines marked deleted
        const gone: Item[] = [];
        for (const [iv, rows] of pdByReceipt) {
          if (listed.has(iv)) continue;
          for (const r of rows) {
            const d = dateOnly(r.receiptDate);
            if (!r.deletedInSource && d && d > sinceDate) gone.push({ id: r.id, deletedInSource: true, ...meta() });
          }
        }
        res.markedDeletedInSource += gone.length;
        if (!ctx.dryRun && gone.length) await writeChunks(gone, (c) => client.updateItems('Payments', c));
        phase = 'הושלם';
        res.complete = true;
        res.needsResume = false;
        cursorId = await saveCursor(ctx, 'payments', cursorId, {
          runId: passRunId, mode, phase, pendingCount: 0, lastFullReadAt: new Date().toISOString(),
          cursor: { sinceDate, lastIvnum: null, pendingReceipts: [], doneCount, emptyReceipts },
        });
      }
    }

    res.pendingCount = pending.length;
    res.doneCount = doneCount;
    res.receiptsListed = listed.size;
    res.expectedRows = null;
    res.estimatedRemainingCalls = phase === 'רשימה' ? null : pending.length;
    res.gate = res.complete ? 'passed' : 'incomplete read';
    if (ctx.dryRun && !res.complete) res.notes.push(`הרצת בדיקה: נקראו שורות של ${res.receiptsRead} קבלות לדוגמה; נותרו כ-${pending.length} קריאות`);
    else if (!res.complete) res.notes.push(`נעצר בתקציב הזמן; נותרו ${pending.length} קבלות לקריאה — ההרצה הבאה תמשיך`);
  } catch (e) {
    res.error = errText(e);
    res.gate = 'incomplete read';
    console.error(`[payments] ${res.error}`);
  }
  if (res.receiptsFailed && !res.error) res.error = `${res.receiptsFailed} קבלות לא נקראו (ינוסו שוב בהרצה הבאה)`;
  res.writeVerified = await verifySample(ctx, 'Payments', 'paymentRef', written);
  console.log(`[payments] calls=${res.calls} listed=${res.receiptsListed} read=${res.receiptsRead} noLines=${res.receiptsWithoutLines} failed=${res.receiptsFailed} lines=${res.sourceRows} +${res.inserted} ~${res.updated} =${res.unchanged} del=${res.markedDeletedInSource} pending=${res.pendingCount} complete=${res.complete}`);
  return res;
}
