import { describe, expect, it, vi } from 'vitest';
import { FakeBlocks } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));
// the task engine blows up: the writer's own result must not change
vi.mock('../../shared/collections-task-upsert.ts', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  syncTasks: vi.fn(async () => {
    throw new Error('engine down');
  }),
}));

import { invoke } from '../code.ts';

describe('a throwing syncTasks never fails the writer', () => {
  it('SetEmailHandling still updates, verifies and reports no error of its own', async () => {
    const fake = new FakeBlocks();
    const [e] = fake.insert('InboundEmails', [{ subject: 'x', handlingState: 'לא טופל', fromAddress: 'a@b.example' }]);
    current = fake.client();
    const r = await invoke({ inboundEmailIds: [String(e.id)], state: 'טופל', by: 'דנה' }, {});
    expect(r.updated).toBe(1);
    expect(r.errors).toEqual([]);
    expect(r.emails[0]).toMatchObject({ handlingState: 'טופל', handledBy: 'דנה', changed: true });
    expect(fake.rows('InboundEmails')[0].handlingState).toBe('טופל');
    expect(r.taskSync.writeVerified).toBe(false);
    expect(r.taskSync.errors[0]).toContain('engine down');
  });
});
