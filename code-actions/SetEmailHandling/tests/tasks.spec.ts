import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke as ingest } from '../../IngestEmail/code.ts';
import { invoke } from '../code.ts';

const ctx: any = {};

describe('SetEmailHandling keeps the email task in step at once (no 06:00 wait)', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-21T06:00:00.000Z'));
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
  });
  afterAll(() => vi.useRealTimers());

  it('לא טופל opens inbox:<id>, ממתין and טופל close it automatically', async () => {
    const m = await ingest(
      { mailProvider: 'gmail', mailbox: 'saar@blocks.diy', mailboxOwnerName: 'סער', sourceLabel: 'Ciment-Test', receivedAt: '1792560600', messageId: 'set-1', fromAddress: 'someone@example.com', subject: 'שאלה', bodyText: 'שלום' },
      ctx,
    );
    const id = String(m.inboundEmailId);
    const task = () => fake.rows('CollectionQueue').filter((t) => t.taskKey === `inbox:${id}`);

    const waiting = await invoke({ inboundEmailIds: [id], state: 'ממתין', waitingFor: 'הלקוח', by: 'דנה' }, ctx);
    expect(waiting.errors).toEqual([]);
    expect(waiting.taskSync).toMatchObject({ created: 0, errors: [] });
    expect(task()).toHaveLength(0);

    const open = await invoke({ inboundEmailIds: [id], state: 'לא טופל', by: 'דנה' }, ctx);
    expect(open.taskSync).toMatchObject({ created: 1, errors: [], writeVerified: true });
    expect(task()).toHaveLength(1);
    expect(task()[0]).toMatchObject({ status: 'ממתין', taskType: 'מייל לטיפול', source: 'פניות', relatedTable: 'InboundEmails', relatedId: id });

    const done = await invoke({ inboundEmailIds: [id], state: 'טופל', by: 'דנה' }, ctx);
    expect(done.updated).toBe(1);
    expect(done.taskSync).toMatchObject({ autoClosed: 1, errors: [] });
    expect(task()).toHaveLength(1);
    expect(task()[0]).toMatchObject({ status: 'נסגר אוטומטית', resolvedReason: 'המייל טופל' });

    // an unchanged state is not a change: no sync at all
    const same = await invoke({ inboundEmailIds: [id], state: 'טופל', by: 'דנה' }, ctx);
    expect(same.taskSync).toBeNull();
  });
});
