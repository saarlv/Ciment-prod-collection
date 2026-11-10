// In-memory Blocks data platform for offline specs (never imported by a Lambda handler). Implements the
// BlocksClient surface the code actions use, with SQL-like where semantics, limit/offset paging, an
// optional server page cap, count aggregates, and a latency-depth meter (how many sequential round
// trips an action needed).
import type { Item, QueryOptions, WhereClause } from './blocks/blocks-client.ts';
import { ingestEmail } from './collections-ingest.ts';

export interface FakeCall {
  method: string;
  table?: string;
  depth: number;
  query?: QueryOptions;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function cmp(a: any, b: any): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && typeof a !== 'string' && typeof b !== 'string') return na - nb;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

const isNull = (v: unknown) => v === null || v === undefined;

export function matches(row: Item, w?: WhereClause): boolean {
  if (!w) return true;
  let ok = true;
  if (w.column !== undefined) {
    const col = String(w.column).includes('.') ? String(w.column).split('.').pop()! : String(w.column);
    const v = row[col];
    const op = w.operator ?? '=';
    switch (op) {
      case 'is null':
        ok = isNull(v);
        break;
      case 'is not null':
        ok = !isNull(v);
        break;
      case 'in':
        ok = !isNull(v) && (w.value as any[]).some((x) => cmp(v, x) === 0);
        break;
      case 'not in':
        ok = !isNull(v) && !(w.value as any[]).some((x) => cmp(v, x) === 0);
        break;
      default: {
        if (isNull(v) || isNull(w.value)) {
          ok = false;
          break;
        }
        const c = cmp(v, w.value);
        ok = op === '=' ? c === 0 : op === '!=' ? c !== 0 : op === '>' ? c > 0 : op === '>=' ? c >= 0 : op === '<' ? c < 0 : c <= 0;
      }
    }
  }
  if (ok && w.and) ok = w.and.every((x) => matches(row, x));
  if (ok && w.or) ok = w.or.some((x) => matches(row, x));
  return w.not ? !ok : ok;
}

export class FakeBlocks {
  tables = new Map<string, Item[]>();
  calls: FakeCall[] = [];
  /** Max rows the fake server returns per page (simulates a server-side cap). */
  pageCap = Infinity;
  /** When false the server ignores `select` count aggregates (returns rows), like an older server. */
  supportsCount = true;
  private nextId = 1;
  private completedDepth = 0;
  maxDepth = 0;
  failOn: ((method: string, table?: string) => boolean) | null = null;
  /** Payloads sent to the ProcessInboundEmail pipeline (played here by its ingest step only). */
  processedEmails: Item[] = [];

  /**
   * ProcessInboundEmail stand-in: the DAG's first step (IngestEmail, same shared code) on this platform;
   * its output is the pipeline's output. Maya (the agent step) does not run offline.
   */
  async processInboundEmail(client: any, input: Item) {
    this.calls.push({ method: 'invokeAction', table: 'ProcessInboundEmail', depth: this.completedDepth + 1 });
    this.processedEmails.push(clone(input));
    return ingestEmail(client, { ...clone(input), dryRun: false });
  }

  rows(table: string): Item[] {
    return this.tables.get(table) ?? [];
  }

  insert(table: string, rows: Item[]): Item[] {
    const list = this.tables.get(table) ?? [];
    const now = new Date().toISOString();
    const created = rows.map((r) => ({ ...clone(r), id: String(this.nextId++), createdAt: now, updatedAt: now }));
    list.push(...created);
    this.tables.set(table, list);
    return created;
  }

  resetDepth() {
    this.completedDepth = 0;
    this.maxDepth = 0;
  }

  private async op<T>(method: string, table: string | undefined, fn: () => T, query?: QueryOptions): Promise<T> {
    const depth = this.completedDepth + 1;
    this.maxDepth = Math.max(this.maxDepth, depth);
    this.calls.push({ method, table, depth, query });
    await new Promise((r) => setTimeout(r, 0));
    try {
      if (this.failOn?.(method, table)) throw new Error(`Failed to ${method} call ${table}: simulated`);
      return clone(fn());
    } finally {
      this.completedDepth = Math.max(this.completedDepth, depth);
    }
  }

  query(table: string, q: QueryOptions): Item[] {
    let rows = this.rows(table).filter((r) => matches(r, q.where));
    const count = q.select?.find((s) => s.function === 'count');
    if (count && this.supportsCount) return [{ [count.as ?? 'count']: rows.length }];
    if (q.orderBy?.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of q.orderBy!) {
          const c = cmp(a[o.column], b[o.column]);
          if (c) return o.direction === 'desc' ? -c : c;
        }
        return Number(a.id) - Number(b.id);
      });
    }
    const offset = q.offset ?? 0;
    const limit = Math.min(q.limit ?? Infinity, this.pageCap);
    return rows.slice(offset, offset + limit);
  }

  client() {
    const c = {
      queryTable: (table: string, q: QueryOptions) => this.op('queryTable', table, () => ({ items: this.query(table, q) }), q),
      getItem: (table: string, id: string) =>
        this.op('getItem', table, () => {
          const item = this.rows(table).find((r) => r.id === String(id));
          if (!item) throw new Error(`Failed to GET call /data/api/tables/${table}/items/${id}: Not Found`);
          return { item };
        }),
      createItem: (table: string, item: Item) => this.op('createItem', table, () => ({ item: this.insert(table, [item])[0] })),
      createItems: (table: string, items: Item[]) => this.op('createItems', table, () => ({ items: this.insert(table, items) })),
      updateItem: (table: string, id: string, item: Item) =>
        this.op('updateItem', table, () => {
          const row = this.rows(table).find((r) => r.id === String(id));
          if (!row) throw new Error(`Failed to PUT call /data/api/tables/${table}/items/${id}: Not Found`);
          Object.assign(row, clone(item), { id: row.id, updatedAt: new Date().toISOString() });
          return { item: row };
        }),
      updateItems: (table: string, items: Item[]) =>
        this.op('updateItems', table, () => {
          const out: Item[] = [];
          for (const it of items) {
            const row = this.rows(table).find((r) => r.id === String(it.id));
            if (row) {
              Object.assign(row, clone(it), { id: row.id });
              out.push(row);
            }
          }
          return { items: out };
        }),
      deleteItem: (table: string, id: string) =>
        this.op('deleteItem', table, () => {
          this.tables.set(table, this.rows(table).filter((r) => r.id !== String(id)));
          return { itemId: id };
        }),
      deleteItems: (table: string, body: { where?: WhereClause; allItems?: boolean }) =>
        this.op('deleteItems', table, () => {
          const gone = this.rows(table).filter((r) => body.allItems || matches(r, body.where));
          this.tables.set(table, this.rows(table).filter((r) => !gone.includes(r)));
          return { itemIds: gone.map((r) => r.id) };
        }),
      invokeAction: (name: string, input?: any): Promise<any> =>
        name === 'ProcessInboundEmail' ? this.processInboundEmail(c, input) : this.op('invokeAction', name, () => ({})),
      generateFileSignedUrl: (url: string) => this.op('generateFileSignedUrl', undefined, () => ({ signedUrl: url, expiration: new Date() })),
      getCurrentUser: () => this.op('getCurrentUser', undefined, () => ({ user: { id: '1', name: 'בודק', email: 'tester@example.com' } })),
    };
    return c;
  }
}

/**
 * Production-like rows that must survive every fixture operation, plus a few legacy test rows the seed
 * and DeleteTestFixtures clean up (and one TEST- row explicitly marked as not a fixture, which is skipped).
 */
export function seedRealWorld(fake: FakeBlocks) {
  fake.insert('AgentSettings', [
    { settingKey: 'agingMonthsBack', value: '3', valueType: 'מספר', isTestFixture: false },
    { settingKey: 'replySlaHours', value: '24', valueType: 'מספר', isTestFixture: false },
    { settingKey: 'openDebtsDay', value: '1', valueType: 'מספר', isTestFixture: false },
  ]);
  fake.insert('Customers', [
    { customerCode: '10001', customerName: 'אלון יזמות בע״מ', assignedBookkeeperName: 'רינה', source: 'priority-mock', ledgerBalance: 5000 },
    { customerCode: 'TEST-OLD', customerName: 'בדיקה – ישן', source: 'test-fixture' },
  ]);
  fake.insert('CustomerContacts', [
    { contactKey: '10001-1', customerCode: '10001', customerName: 'אלון יזמות בע״מ', contactName: 'אבי לוי', email: 'avi@real.example', source: 'priority-mock' },
  ]);
  fake.insert('Invoices', [
    { invoiceNumber: 'R-1', customerCode: '10001', customerName: 'אלון יזמות בע״מ', documentType: 'חשבונית', dueDate: '2026-09-30', amount: 5000, openAmount: 5000, source: 'priority-mock' },
  ]);
  fake.insert('CreditLimitRequests', [{ customerCode: 'TEST-002', requestedLimit: 100, status: 'טיוטה', isTestFixture: null }]);
  fake.insert('Disputes', [{ customerCode: 'TEST-001', disputeNumber: 'D-OLD', isTestFixture: null }]);
  fake.insert('Interactions', [{ customerCode: 'TEST-001', type: 'הערה', summary: 'ישן' }]);
  fake.insert('Approvals', [{ customerCode: 'TEST-999', kind: 'דואל', status: 'ממתין', isTestFixture: false }]);
}
