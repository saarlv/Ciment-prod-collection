import { describe, expect, it } from 'vitest';
import { DESIGN_DB } from '@/utils/buildDocs/designDb';
import { DB_RELATIONS } from '@/utils/buildDocs/dbRelations';
import { buildDiagram } from '@/utils/buildDocs/dbDiagram';

const tables = new Map(DESIGN_DB.groups.flatMap((g) => g.tables).map((t) => [t.name, t]));

describe('DB_RELATIONS', () => {
  it('links real columns of real tables', () => {
    for (const r of DB_RELATIONS) {
      const from = tables.get(r.from.table);
      const to = tables.get(r.to.table);
      expect(from, r.from.table).toBeDefined();
      expect(to, r.to.table).toBeDefined();
      expect(from?.columns.some((c) => c.name === r.from.column), `${r.from.table}.${r.from.column}`).toBe(true);
      if (r.to.column !== 'id') expect(to?.columns.some((c) => c.name === r.to.column), `${r.to.table}.${r.to.column}`).toBe(true);
    }
  });
});

describe('buildDiagram', () => {
  it('lays out every table and view without overlaps, with an edge per relation', () => {
    const d = buildDiagram({ showViews: true, compact: false });
    expect(d.boxes.size).toBe(DESIGN_DB.tableCount + DESIGN_DB.viewCount);
    expect(d.edges.filter((e) => e.kind === 'ref')).toHaveLength(DB_RELATIONS.length);
    const list = [...d.boxes.values()];
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        const overlap = a.x < b.x + 248 && b.x < a.x + 248 && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.table.name} / ${b.table.name}`).toBe(false);
      }
    }
  });

  it('hides views on request', () => {
    const d = buildDiagram({ showViews: false, compact: true });
    expect(d.boxes.size).toBe(DESIGN_DB.tableCount);
    expect(d.edges.every((e) => e.kind === 'ref')).toBe(true);
  });
});