/**
 * The deterministic layout of the ER diagram (/collections/design?doc=db&view=diagram): one box per table or view,
 * clustered by component group, and an edge per logical link (dbRelations.ts) plus a dashed edge from every view to
 * its base table and each join. Pure geometry, no React: the diagram component only draws what this returns.
 */
import { DESIGN_DB } from '@/utils/buildDocs/designDb';
import type { DbGroup, DbTable } from '@/utils/buildDocs/designDb';
import { DB_RELATIONS } from '@/utils/buildDocs/dbRelations';
import type { DbRelation } from '@/utils/buildDocs/dbRelations';

export const BOX_W = 248;
export const HEADER_H = 34;
export const ROW_H = 22;
export const FOOT_H = 20;
const BOX_PAD = 6;
const GAP_X = 64;
const GAP_Y = 34;
const CLUSTER_PAD = 30;
const CLUSTER_LABEL = 46;
const MACRO_GAP_X = 150;
const MACRO_GAP_Y = 120;

export interface DiagramRow {
  name: string;
  type: string;
  enum?: string[];
  description: string;
  /** In the unique key (or the system id other tables point at). */
  key: boolean;
  /** The column points at another table. */
  link: boolean;
  /** The platform's row id: not in the column list, shown because other tables point at it. */
  system?: boolean;
}

export interface DiagramBox {
  table: DbTable;
  group: string;
  x: number;
  y: number;
  h: number;
  /** The rows drawn (all, or only keys and links in the compact mode). */
  rows: DiagramRow[];
  /** Every row, for the details panel. */
  allRows: DiagramRow[];
  hidden: number;
}

export interface DiagramCluster {
  title: string;
  mirror: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
}

export type EdgeEnd = 'many' | 'one' | 'none';

export interface DiagramEdge {
  id: string;
  kind: 'ref' | 'view';
  from: string;
  to: string;
  fromColumn?: string;
  toColumn?: string;
  /** Points at Customers.customerCode (the edges that dominate). */
  customer: boolean;
  list: boolean;
  /** A real reference column, drawn apart from the text-key links. */
  reference: boolean;
  path: string;
  /** Marker paths at each end (crow's foot for many, bars for one). */
  fromMark: string;
  toMark: string;
}

export interface Diagram {
  boxes: Map<string, DiagramBox>;
  clusters: DiagramCluster[];
  edges: DiagramEdge[];
  width: number;
  height: number;
}

export interface DiagramOptions {
  showViews: boolean;
  /** Only key and link columns. */
  compact: boolean;
}

/**
 * Macro grid of the clusters by group index in DESIGN_DB.groups (mirrors 0, 01 1, 02 2, 03 3, 04 4, 05 5, shared 6):
 * 01 · mirrors · 04 on top, 02 · 03 · shared in the middle, 05 · משימות below 02 (it links mostly to PaymentPromises
 * and Invoices). A new group needs a slot here. OpenMovements and the AgingByMonth view sit in the mirrors cluster (0),
 * CustomerNotes with AgingNotes and PaymentPromises in 02 (2): nothing lands in "אחר".
 */
const MACRO: number[][] = [
  [1, 0, 4],
  [2, 3, 6],
  [5],
];
const CLUSTER_COLS: Record<number, number> = { 0: 3, 1: 3, 2: 2, 3: 1, 4: 3, 5: 2, 6: 3 };

function relationEnds(): { from: Map<string, Set<string>>; to: Map<string, Set<string>>; referenced: Set<string> } {
  const from = new Map<string, Set<string>>();
  const to = new Map<string, Set<string>>();
  const referenced = new Set<string>();
  for (const r of DB_RELATIONS) {
    if (r.reference) referenced.add(r.to.table);
    if (!from.has(r.from.table)) from.set(r.from.table, new Set());
    from.get(r.from.table)?.add(r.from.column);
    if (!to.has(r.to.table)) to.set(r.to.table, new Set());
    to.get(r.to.table)?.add(r.to.column);
  }
  return { from, to, referenced };
}

const ENDS = relationEnds();

function tableRows(t: DbTable): DiagramRow[] {
  const links = ENDS.from.get(t.name) ?? new Set<string>();
  const targets = ENDS.to.get(t.name) ?? new Set<string>();
  const keys = new Set(t.uniqueKey ?? []);
  const rows: DiagramRow[] = t.columns.map((c) => ({
    name: c.name,
    type: c.type,
    enum: c.enum,
    description: c.description,
    key: keys.has(c.name),
    link: links.has(c.name),
  }));
  if (targets.has('id') && !t.columns.some((c) => c.name === 'id')) {
    const description = ENDS.referenced.has(t.name)
      ? 'The platform row id; reference columns point at it, and other tables store it as text.'
      : 'The platform row id; other tables store it as text.';
    rows.unshift({ name: 'id', type: 'row id', description, key: true, link: false, system: true });
  }
  return rows;
}

function boxHeight(rows: number, hidden: number): number {
  return HEADER_H + rows * ROW_H + (hidden > 0 ? FOOT_H : 0) + BOX_PAD;
}

/** Packs one group's boxes into columns, each next box into the shortest column; Customers is pinned to the middle. */
function packCluster(group: DbGroup, cols: number, opts: DiagramOptions): { boxes: DiagramBox[]; w: number; h: number } {
  const tables = group.tables.filter((t) => opts.showViews || t.kind === 'table');
  const heights = Array.from({ length: cols }, () => 0);
  const boxes: DiagramBox[] = [];
  const ordered = [...tables].sort((a, b) => Number(b.name === 'Customers') - Number(a.name === 'Customers'));
  for (const t of ordered) {
    const allRows = tableRows(t);
    const rows = opts.compact ? allRows.filter((r) => r.key || r.link) : allRows;
    const hidden = allRows.length - rows.length;
    const h = boxHeight(rows.length, hidden);
    let col = 0;
    if (t.name === 'Customers' && cols >= 3) col = 1;
    else {
      for (let i = 1; i < cols; i++) if (heights[i] < heights[col]) col = i;
    }
    boxes.push({ table: t, group: group.title, x: col * (BOX_W + GAP_X), y: heights[col], h, rows, allRows, hidden });
    heights[col] += h + GAP_Y;
  }
  const w = cols * BOX_W + (cols - 1) * GAP_X;
  const h = Math.max(0, ...heights) - GAP_Y;
  return { boxes, w, h: Math.max(h, 0) };
}

function rowY(box: DiagramBox, column?: string): number {
  if (!column) return box.y + HEADER_H / 2;
  const i = box.rows.findIndex((r) => r.name === column);
  return i < 0 ? box.y + HEADER_H / 2 : box.y + HEADER_H + i * ROW_H + ROW_H / 2;
}

function mark(end: EdgeEnd, x: number, y: number, d: number): string {
  if (end === 'many') {
    const tip = x + d * 14;
    return `M${tip} ${y}L${x} ${y - 7}M${tip} ${y}L${x} ${y}M${tip} ${y}L${x} ${y + 7}M${x + d * 19} ${y - 6}L${x + d * 19} ${y + 6}`;
  }
  if (end === 'one') return `M${x + d * 9} ${y - 6}L${x + d * 9} ${y + 6}M${x + d * 14} ${y - 6}L${x + d * 14} ${y + 6}`;
  return '';
}

function route(a: DiagramBox, b: DiagramBox, ya: number, yb: number): { path: string; x1: number; d1: number; x2: number; d2: number } {
  const ca = a.x + BOX_W / 2;
  const cb = b.x + BOX_W / 2;
  let x1: number, d1: number, x2: number, d2: number;
  if (Math.abs(ca - cb) < BOX_W) {
    // Same column: leave and enter on the same side, looping outward.
    x1 = a.x + BOX_W;
    x2 = b.x + BOX_W;
    d1 = 1;
    d2 = 1;
    const c = Math.min(60 + Math.abs(yb - ya) * 0.18, 170);
    return { path: `M${x1} ${ya}C${x1 + c} ${ya} ${x2 + c} ${yb} ${x2} ${yb}`, x1, d1, x2, d2 };
  }
  if (cb > ca) {
    x1 = a.x + BOX_W;
    d1 = 1;
    x2 = b.x;
    d2 = -1;
  } else {
    x1 = a.x;
    d1 = -1;
    x2 = b.x + BOX_W;
    d2 = 1;
  }
  const c = Math.min(Math.max(Math.abs(x2 - x1) * 0.45, 60), 260);
  return { path: `M${x1} ${ya}C${x1 + d1 * c} ${ya} ${x2 + d2 * c} ${yb} ${x2} ${yb}`, x1, d1, x2, d2 };
}

function refEdge(r: DbRelation, a: DiagramBox, b: DiagramBox): DiagramEdge {
  const ya = rowY(a, r.from.column);
  const yb = rowY(b, r.to.column);
  const g = route(a, b, ya, yb);
  const fromEnd: EdgeEnd = r.cardinality === 'n:1' ? 'many' : 'one';
  const toEnd: EdgeEnd = r.cardinality === '1:n' ? 'many' : 'one';
  return {
    id: `${r.from.table}.${r.from.column}->${r.to.table}.${r.to.column}`,
    kind: 'ref',
    from: r.from.table,
    to: r.to.table,
    fromColumn: r.from.column,
    toColumn: r.to.column,
    customer: r.to.table === 'Customers' && r.to.column === 'customerCode',
    list: !!r.list,
    reference: !!r.reference,
    path: g.path,
    fromMark: mark(fromEnd, g.x1, ya, g.d1),
    toMark: mark(toEnd, g.x2, yb, g.d2),
  };
}

function viewEdge(view: DiagramBox, table: DiagramBox): DiagramEdge {
  const ya = rowY(view);
  const yb = rowY(table);
  const g = route(view, table, ya, yb);
  return {
    id: `${view.table.name}=>${table.table.name}`,
    kind: 'view',
    from: view.table.name,
    to: table.table.name,
    customer: false,
    list: false,
    reference: false,
    path: g.path,
    fromMark: '',
    toMark: `M${g.x2} ${yb}m${g.d2 * 5} 0a4 4 0 1 0 0.01 0`,
  };
}

/** The whole diagram for the given options. Cheap (48 boxes, ~80 edges): recomputed when an option changes. */
export function buildDiagram(opts: DiagramOptions): Diagram {
  const groups = DESIGN_DB.groups;
  const packed = groups.map((g, i) => packCluster(g, CLUSTER_COLS[i] ?? 2, opts));
  const clusterW = (i: number) => packed[i].w + CLUSTER_PAD * 2;
  const clusterH = (i: number) => packed[i].h + CLUSTER_PAD + CLUSTER_LABEL;
  const colW = [0, 1, 2].map((c) => Math.max(...MACRO.map((row) => (row[c] != null && packed[row[c]] ? clusterW(row[c]) : 0))));
  const rowH = MACRO.map((row) => Math.max(0, ...row.filter((gi) => packed[gi]).map(clusterH)));

  const boxes = new Map<string, DiagramBox>();
  const clusters: DiagramCluster[] = [];
  let y = 0;
  MACRO.forEach((row, r) => {
    let x = 0;
    row.forEach((gi, c) => {
      if (!packed[gi]) return;
      const w = clusterW(gi);
      // Side columns hug the centre; the centre column is centred.
      const cx = c === 0 ? x + colW[c] - w : c === 1 ? x + (colW[c] - w) / 2 : x;
      const cy = y;
      clusters.push({ title: groups[gi].title, mirror: groups[gi].mirror, x: cx, y: cy, w, h: clusterH(gi), count: packed[gi].boxes.length });
      for (const b of packed[gi].boxes) {
        boxes.set(b.table.name, { ...b, x: b.x + cx + CLUSTER_PAD, y: b.y + cy + CLUSTER_LABEL });
      }
      x += colW[c] + MACRO_GAP_X;
    });
    y += rowH[r] + MACRO_GAP_Y;
  });

  const edges: DiagramEdge[] = [];
  for (const r of DB_RELATIONS) {
    const a = boxes.get(r.from.table);
    const b = boxes.get(r.to.table);
    if (a && b) edges.push(refEdge(r, a, b));
  }
  for (const box of boxes.values()) {
    if (box.table.kind !== 'view') continue;
    for (const name of [box.table.baseTable, ...(box.table.joins ?? [])]) {
      const target = name ? boxes.get(name) : undefined;
      if (target) edges.push(viewEdge(box, target));
    }
  }

  const width = colW.reduce((s, w) => s + w, 0) + MACRO_GAP_X * 2;
  const height = y - MACRO_GAP_Y;
  return { boxes, clusters, edges, width, height };
}