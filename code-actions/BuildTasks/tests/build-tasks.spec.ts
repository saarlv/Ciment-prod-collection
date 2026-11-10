import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';
import { writesSince } from '../../shared/fake-world.ts';
import { syncTasks } from '../../shared/collections-task-upsert.ts';
import { buildTaskRow, NOTES_RETIRED, parseTaskKey, promiseBrokenKey } from '../../shared/collections-tasks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke } from '../code.ts';

const T = '2026-10-20';
const NOW = '2026-10-20T05:00:00.000Z'; // 08:00 Israel
const LATER = '2026-10-21T05:00:00.000Z';
const C = '50001';

function world() {
  const fake = new FakeBlocks();
  fake.insert('AgentSettings', [
    { settingKey: 'taskOverdueMinDays', value: '7', valueType: 'מספר' },
    { settingKey: 'replySlaHours', value: '24', valueType: 'מספר' },
  ]);
  fake.insert('Customers', [
    { customerCode: C, customerName: 'אלפא בנייה', assignedBookkeeperName: 'רינה', preferredChannel: 'דואל' },
    { customerCode: '50002', customerName: 'בטא', assignedBookkeeperName: 'רינה' },
    { customerCode: 'TEST-777', customerName: 'בדיקה – לקוח', assignedBookkeeperName: 'רינה', source: 'test-fixture' },
  ]);
  fake.insert('CustomerOwners', [{ customerCode: C, bookkeeperName: 'דנה', setAt: '2026-10-01T08:00:00.000Z' }]);
  fake.insert('Invoices', [
    { invoiceNumber: 'INV-1', customerCode: C, customerName: 'אלפא בנייה', documentType: 'חשבונית', dueDate: '2026-09-01', amount: 20000, openAmount: 20000, remainingAmount: 20000 },
    { invoiceNumber: 'INV-2', customerCode: C, documentType: 'חשבונית', dueDate: '2026-10-18', amount: 5000, openAmount: 5000, remainingAmount: 5000 },
    { invoiceNumber: 'INV-3', customerCode: C, documentType: 'חשבונית', dueDate: '2026-08-01', amount: 7000, openAmount: 7000, remainingAmount: 7000 },
    { invoiceNumber: 'INV-T', customerCode: 'TEST-777', documentType: 'חשבונית', dueDate: '2026-09-15', amount: 3000, openAmount: 3000, remainingAmount: 3000 },
    { invoiceNumber: 'INV-B', customerCode: '50002', documentType: 'חשבונית', dueDate: '2026-09-10', amount: 4000, openAmount: 4000, remainingAmount: 4000 },
  ]);
  // INV-3's month (2026-08) has an open commitment (CustomerNotes): no overdue task for it
  fake.insert('CustomerNotes', [{ customerCode: C, dueMonth: '2026-08', noteType: 'התחייבות לתשלום', status: 'פעילה', outcome: 'פתוחה', actionDate: '2026-10-25', amount: 7000 }]);
  fake.insert('BankLines', [
    { bankLineId: 'BL-1', amount: 8000, valueDate: '2026-10-18', payerName: 'משה כהן', lineType: 'העברה', status: 'לא מזוהה', checkStage: 'לא מזוהה' },
    { bankLineId: 'BL-2', amount: 1200, valueDate: '2026-10-19', payerName: 'אלפא', reference: '4411', lineType: 'צ׳ק חוזר', status: 'חדשה', customerCode: C, checkStage: null },
  ]);
  fake.insert('InboundEmails', [
    { fromAddress: 'a@alpha.example', fromName: 'אבי', subject: 'שאלה', receivedAt: '2026-10-18T07:00:00.000Z', dueAt: '2026-10-19T07:00:00.000Z', customerCode: C, category: 'אחר', handlingState: 'לא טופל', senderVerification: 'מאומת' },
    { fromAddress: 'x@gmail.com', subject: 'כרטסת בבקשה', receivedAt: '2026-10-20T04:00:00.000Z', dueAt: '2026-10-21T04:00:00.000Z', customerCode: C, category: 'כרטסת', handlingState: 'לא טופל', senderVerification: 'לא מאומת' },
  ]);
  fake.insert('Approvals', [{ customerCode: C, kind: 'דואל', subject: 'תזכורת', status: 'ממתין', draftedBy: 'נורה', draftedAt: '2026-10-18T08:00:00.000Z' }]);
  current = fake.client();
  return fake;
}

const run = (fake: FakeBlocks, opts: any = {}) => syncTasks(fake.client() as any, { asOfDate: T, dryRun: false, nowIso: NOW, ...opts });
const task = (fake: FakeBlocks, key: string) => fake.rows('CollectionQueue').find((r) => r.taskKey === key)!;
const emailId = (fake: FakeBlocks, subject: string) => String(fake.rows('InboundEmails').find((e) => e.subject === subject)!.id);

describe('BuildTasks', () => {
  it('creates one complete task per problem', async () => {
    const fake = world();
    const r = await run(fake);
    expect(r.errors).toEqual([]);
    expect(r.writeVerified).toBe(true);
    const keys = fake.rows('CollectionQueue').map((t) => t.taskKey).sort();
    const e1 = emailId(fake, 'שאלה');
    const e2 = emailId(fake, 'כרטסת בבקשה');
    const ap = String(fake.rows('Approvals')[0].id);
    expect(keys).toEqual(
      [
        'aging-overdue:INV-1',
        'aging-overdue:INV-B',
        'aging-overdue:INV-T',
        `draft:${ap}`,
        `inbox:${e1}`,
        'receipt-bounced:BL-2',
        'receipt-customer:BL-1',
        `verify-sender:${e2}`,
      ].sort(),
    );
    expect(r.created).toBe(8);
    const t = task(fake, 'aging-overdue:INV-1');
    expect(t).toMatchObject({
      status: 'ממתין',
      taskType: 'לגבות מהלקוח',
      source: 'דוח גיול',
      queueDate: T,
      customerName: 'אלפא בנייה',
      assignedBookkeeperName: 'דנה',
      amount: 20000,
      invoiceNumbers: 'INV-1',
      openedAt: NOW,
      lastCheckedAt: NOW,
      resolvedAt: null,
      isTestFixture: false,
      recommendedAction: 'להתקשר',
    });
    expect(t.priorityScore).toBe(t.severityScore);
    expect(task(fake, 'aging-overdue:INV-T').isTestFixture).toBe(true);
    // every column set
    for (const col of ['handledBy', 'handledAt', 'relatedTable', 'relatedId', 'dueAt', 'reasons', 'title', 'severity']) expect(col in t).toBe(true);
    expect(r.bySource['דוח גיול']).toMatchObject({ found: 3, created: 3, readFailed: null });
  });

  it('a bounced cheque is always קריטית; inbox past SLA is גבוהה, a draft older than 24h is גבוהה', async () => {
    const fake = world();
    await run(fake);
    expect(task(fake, 'receipt-bounced:BL-2')).toMatchObject({ severity: 'קריטית', taskType: 'צ׳ק חוזר' });
    expect(task(fake, 'receipt-bounced:BL-2').severityScore).toBeGreaterThanOrEqual(70);
    expect(task(fake, `inbox:${emailId(fake, 'שאלה')}`)).toMatchObject({ severity: 'גבוהה', recommendedAction: 'לטפל במייל', taskType: 'מייל לטיפול' });
    expect(task(fake, `verify-sender:${emailId(fake, 'כרטסת בבקשה')}`).severity).toBe('בינונית');
    expect(task(fake, `draft:${fake.rows('Approvals')[0].id}`)).toMatchObject({ severity: 'גבוהה', recommendedAction: 'לאשר טיוטה' });
    // receipt first (r3): the unknown-payer task type is written as לא זוהה
    expect(task(fake, 'receipt-customer:BL-1')).toMatchObject({ taskType: 'לא זוהה', recommendedAction: 'להתאים תקבול', customerCode: null, needsManagerApproval: false });
  });

  it('verify-sender suppresses the inbox task while it is open, and lets it open once a person closes it', async () => {
    const fake = world();
    await run(fake);
    const e2 = emailId(fake, 'כרטסת בבקשה');
    expect(task(fake, `inbox:${e2}`)).toBeUndefined();
    task(fake, `verify-sender:${e2}`).status = 'טופל';
    const r = await run(fake, { nowIso: LATER });
    expect(task(fake, `inbox:${e2}`)).toMatchObject({ status: 'ממתין', taskType: 'מייל לטיפול' });
    expect(r.keptClosedByPerson).toBe(1);
  });

  it('a refresh keeps openedAt and status and updates amount, severity and lastCheckedAt', async () => {
    const fake = world();
    await run(fake);
    const t = task(fake, 'aging-overdue:INV-1');
    t.status = 'בטיפול';
    const inv = fake.rows('Invoices').find((i) => i.invoiceNumber === 'INV-1')!;
    inv.remainingAmount = 15000;
    const r = await run(fake, { nowIso: LATER });
    expect(r.writeVerified).toBe(true);
    const after = task(fake, 'aging-overdue:INV-1');
    expect(after).toMatchObject({ status: 'בטיפול', openedAt: NOW, lastCheckedAt: LATER, amount: 15000 });
    expect(r.changes.find((c) => c.taskKey === 'aging-overdue:INV-1')?.change).toBe('refreshed');
    expect(fake.rows('CollectionQueue').filter((x) => x.taskKey === 'aging-overdue:INV-1')).toHaveLength(1);
  });

  it('a task a person closed stays closed while the problem lasts', async () => {
    const fake = world();
    await run(fake);
    task(fake, 'aging-overdue:INV-1').status = 'נדחה';
    const r = await run(fake, { nowIso: LATER });
    expect(task(fake, 'aging-overdue:INV-1').status).toBe('נדחה');
    expect(r.keptClosedByPerson).toBe(1);
    expect(r.created).toBe(0);
    expect(r.changes.find((c) => c.taskKey === 'aging-overdue:INV-1')?.change).toBe('keptClosed');
  });

  it('an auto-closed task whose problem returns is reopened with a new openedAt', async () => {
    const fake = world();
    await run(fake);
    Object.assign(task(fake, 'aging-overdue:INV-1'), { status: 'נסגר אוטומטית', resolvedAt: NOW, resolvedReason: 'נרשמה הבטחה' });
    const r = await run(fake, { nowIso: LATER });
    expect(r.reopened).toBe(1);
    expect(task(fake, 'aging-overdue:INV-1')).toMatchObject({ status: 'ממתין', openedAt: LATER, resolvedAt: null, resolvedReason: null });
  });

  it('closes an open task whose problem is gone, with a Hebrew reason', async () => {
    const fake = world();
    await run(fake);
    const inv1 = fake.rows('Invoices').find((i) => i.invoiceNumber === 'INV-1')!;
    Object.assign(inv1, { remainingAmount: 0, openAmount: 0 });
    fake.insert('CustomerNotes', [{ customerCode: '50002', dueMonth: '2026-09', noteType: 'התחייבות לתשלום', status: 'פעילה', outcome: 'פתוחה', actionDate: '2026-10-25', amount: 4000 }]);
    fake.rows('InboundEmails').find((e) => e.subject === 'שאלה')!.handlingState = 'טופל';
    fake.rows('Approvals')[0].status = 'אושר';
    fake.rows('BankLines').find((l) => l.bankLineId === 'BL-1')!.status = 'קבלה הונפקה';
    const r = await run(fake, { nowIso: LATER });
    expect(r.writeVerified).toBe(true);
    expect(task(fake, 'aging-overdue:INV-1')).toMatchObject({ status: 'נסגר אוטומטית', resolvedAt: LATER, resolvedReason: 'החשבונית שולמה' });
    expect(task(fake, 'aging-overdue:INV-B').resolvedReason).toBe('נרשמה התחייבות לתשלום על החודש');
    expect(task(fake, `inbox:${emailId(fake, 'שאלה')}`).resolvedReason).toBe('המייל טופל');
    expect(task(fake, `draft:${fake.rows('Approvals')[0].id}`).resolvedReason).toMatch(/^הטיוטה טופלה/);
    expect(task(fake, 'receipt-customer:BL-1').resolvedReason).toBe('התקבול נסגר');
    expect(r.autoClosed).toBe(5);
  });

  it('a source whose read fails closes nothing of that source', async () => {
    const fake = world();
    await run(fake);
    fake.rows('BankLines').find((l) => l.bankLineId === 'BL-1')!.status = 'קבלה הונפקה';
    fake.rows('Invoices').find((i) => i.invoiceNumber === 'INV-1')!.remainingAmount = 0;
    fake.failOn = (method, table) => method === 'queryTable' && table === 'BankLines';
    const r = await run(fake, { nowIso: LATER });
    expect(r.bySource['תקבולים'].readFailed).toMatch(/simulated/);
    expect(task(fake, 'receipt-customer:BL-1').status).toBe('ממתין');
    expect(task(fake, 'aging-overdue:INV-1').status).toBe('נסגר אוטומטית');
    expect(r.writeVerified).toBe(false);
  });

  it('a scoped run opens and closes only keys inside its scope', async () => {
    const fake = world();
    await run(fake);
    const e1 = emailId(fake, 'שאלה');
    fake.rows('InboundEmails').find((e) => e.subject === 'שאלה')!.handlingState = 'טופל';
    fake.rows('BankLines').find((l) => l.bankLineId === 'BL-1')!.status = 'קבלה הונפקה';
    fake.rows('Invoices').find((i) => i.invoiceNumber === 'INV-B')!.remainingAmount = 0;
    fake.rows('Approvals')[0].status = 'נדחה';
    const r = await run(fake, { nowIso: LATER, scope: { emailIds: [e1] } });
    expect(task(fake, `inbox:${e1}`).status).toBe('נסגר אוטומטית');
    expect(task(fake, 'receipt-customer:BL-1').status).toBe('ממתין');
    expect(task(fake, 'aging-overdue:INV-B').status).toBe('ממתין');
    expect(task(fake, `draft:${fake.rows('Approvals')[0].id}`).status).toBe('ממתין');
    expect(r.autoClosed).toBe(1);

    const r2 = await run(fake, { nowIso: LATER, scope: { customerCode: C } });
    expect(task(fake, 'aging-overdue:INV-B').status).toBe('ממתין'); // another customer
    expect(task(fake, 'receipt-customer:BL-1').status).toBe('ממתין'); // no customer on the line
    expect(task(fake, `draft:${fake.rows('Approvals')[0].id}`).status).toBe('נסגר אוטומטית');
    expect(r2.changes.every((c) => c.customerCode === C)).toBe(true);

    const r3 = await run(fake, { nowIso: LATER, scope: { sources: ['תקבולים'] } });
    expect(task(fake, 'receipt-customer:BL-1').status).toBe('נסגר אוטומטית');
    expect(task(fake, 'aging-overdue:INV-B').status).toBe('ממתין');
    expect(Object.keys(r3.bySource)).toEqual(['תקבולים']);
  });

  it('never touches rows without a taskKey or with a manual: key', async () => {
    const fake = world();
    const [a, b] = fake.insert('CollectionQueue', [
      { customerCode: C, taskType: 'אחר', status: 'ממתין', reasons: 'ידנית', relatedTable: 'Invoices', relatedId: 'X' },
      { customerCode: C, taskType: 'אחר', status: 'ממתין', reasons: 'ידנית', taskKey: 'manual:abc' },
    ]);
    const before = JSON.stringify([a, b]);
    await run(fake);
    const after = fake.rows('CollectionQueue').filter((r) => r.id === a.id || r.id === b.id);
    expect(JSON.stringify(after.map(({ updatedAt, ...r }) => r))).toBe(JSON.stringify(JSON.parse(before).map(({ updatedAt, ...r }: any) => r)));
    expect(parseTaskKey('manual:abc')).toBeNull();
  });

  it('does not open a second task for a problem an unkeyed open row already carries', async () => {
    const fake = world();
    const e2 = emailId(fake, 'כרטסת בבקשה');
    fake.insert('CollectionQueue', [{ customerCode: C, taskType: 'לאמת שולח', status: 'ממתין', relatedTable: 'InboundEmails', relatedId: e2 }]);
    const r = await run(fake);
    expect(task(fake, `verify-sender:${e2}`)).toBeUndefined();
    expect(r.bySource['פניות'].coveredByUnkeyed).toBe(1);
    expect(task(fake, `inbox:${e2}`)).toBeUndefined(); // still suppressed: the verification is open
  });

  it('dryRun (the default) writes nothing and reports what would change', async () => {
    const fake = world();
    const mark = fake.calls.length;
    const r: any = await invoke({ asOfDate: T }, {});
    expect(r.dryRun).toBe(true);
    expect(r.created).toBe(8);
    expect(r.changes.length).toBe(8);
    expect(r.writeVerified).toBe(false);
    expect(writesSince(fake, mark)).toEqual([]);
    expect(fake.rows('CollectionQueue')).toEqual([]);
  });

  it('a בירור note on the month holds the overdue task back; a commitment not kept does not', async () => {
    const fake = world();
    fake.insert('CustomerNotes', [
      { customerCode: '50002', dueMonth: '2026-09', noteType: 'אחר', customTypeLabel: 'בירור – מחיר', noteText: 'בבירור', status: 'פעילה' },
      { customerCode: C, dueMonth: '2026-09', noteType: 'התחייבות לתשלום', status: 'פעילה', outcome: 'לא קוימה', actionDate: '2026-10-10', amount: 20000 },
    ]);
    await run(fake);
    expect(task(fake, 'aging-overdue:INV-B')).toBeUndefined();
    expect(task(fake, 'aging-overdue:INV-1')).toMatchObject({ status: 'ממתין' });
    expect(task(fake, 'aging-overdue:INV-1').reasons).toContain('אין התחייבות לתשלום פתוחה או הערת בירור על החודש');
  });

  it('a leftover promise-broken / note-followup task (old layer) is closed, never refreshed', async () => {
    const fake = world();
    const common = { reasons: 'x', recommendedAction: 'לבדוק הבטחה', severity: { score: 50, level: 'גבוהה' }, customerCode: C, customerName: 'אלפא בנייה', owner: 'דנה', amount: 5000, invoiceNumbers: ['INV-2'], dueAt: NOW, asOfDate: T, nowIso: NOW, isTestFixture: false } as const;
    fake.insert('CollectionQueue', [
      buildTaskRow({ ...common, kind: 'promise-broken', id: '12', taskType: 'הבטחה הופרה', title: 'הבטחה הופרה', relatedTable: 'Invoices', relatedId: '12' } as any),
      buildTaskRow({ ...common, kind: 'note-followup', id: '34', taskType: 'מעקב בירור – אחר', title: 'מעקב בירור', relatedTable: 'Invoices', relatedId: '34' } as any),
    ]);
    const r = await run(fake, { nowIso: LATER });
    expect(task(fake, promiseBrokenKey('12'))).toMatchObject({ status: 'נסגר אוטומטית', resolvedReason: NOTES_RETIRED });
    expect(task(fake, 'note-followup:34')).toMatchObject({ status: 'נסגר אוטומטית', resolvedReason: NOTES_RETIRED });
    expect(r.bySource['הבטחות']).toMatchObject({ found: 0, created: 0 });
  });
});
