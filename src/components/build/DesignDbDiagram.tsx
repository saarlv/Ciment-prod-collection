import { useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import {
  EyeIcon,
  KeyRoundIcon,
  Link2Icon,
  MaximizeIcon,
  MinimizeIcon,
  ScanIcon,
  SearchIcon,
  TableIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { Tag } from '@/components/build/DesignParts';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { BOX_W, FOOT_H, HEADER_H, ROW_H, buildDiagram } from '@/utils/buildDocs/dbDiagram';
import type { Diagram, DiagramBox, DiagramEdge, DiagramRow } from '@/utils/buildDocs/dbDiagram';

/* ---------- Camera (pan / zoom) ---------- */

interface Cam {
  x: number;
  y: number;
  k: number;
}
interface Bounds {
  width: number;
  height: number;
}
interface CamState {
  w: number;
  h: number;
  /** null = fitted to the screen (recomputed on every resize). */
  cam: Cam | null;
}
type CamAction =
  | { type: 'resize'; w: number; h: number }
  | { type: 'set'; cam: Cam | null }
  | { type: 'zoom'; factor: number; mx?: number; my?: number; bounds: Bounds };

const MIN_K = 0.08;
const MAX_K = 2.5;

function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

function fitCam(w: number, h: number, b: Bounds): Cam {
  if (!w || !h) return { x: 0, y: 0, k: 0.4 };
  const k = clampK(Math.min((w - 48) / b.width, (h - 48) / b.height, 1.1));
  return { x: (w - b.width * k) / 2, y: (h - b.height * k) / 2, k };
}

function camReducer(s: CamState, a: CamAction): CamState {
  if (a.type === 'resize') return { ...s, w: a.w, h: a.h };
  if (a.type === 'set') return { ...s, cam: a.cam };
  const cur = s.cam ?? fitCam(s.w, s.h, a.bounds);
  const k = clampK(cur.k * a.factor);
  const mx = a.mx ?? s.w / 2;
  const my = a.my ?? s.h / 2;
  return { ...s, cam: { k, x: mx - ((mx - cur.x) * k) / cur.k, y: my - ((my - cur.y) * k) / cur.k } };
}

/* ---------- Boxes ---------- */

function RowIcon({ row }: { row: DiagramRow }) {
  if (row.key) return <KeyRoundIcon aria-label="מפתח" className="size-3 shrink-0 text-link" />;
  if (row.link) return <Link2Icon aria-label="קישור" className="size-3 shrink-0 text-muted-foreground" />;
  return <span aria-hidden className="size-3 shrink-0" />;
}

function TableBox({
  box,
  dimmed,
  active,
  hotRows,
  onSelect,
  onHover,
}: {
  box: DiagramBox;
  dimmed: boolean;
  active: boolean;
  hotRows?: Set<string>;
  onSelect: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const t = box.table;
  const isView = t.kind === 'view';
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(t.name);
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t.name}${isView ? ' (view)' : ''}`}
      data-box
      onClick={(e) => {
        e.stopPropagation();
        onSelect(t.name);
      }}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(t.name)}
      onPointerLeave={() => onHover(null)}
      style={{ left: box.x, top: box.y, width: BOX_W, height: box.h }}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-[14px] border bg-card text-card-foreground shadow-glass-card transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isView && 'border-2 border-dashed border-link/40',
        dimmed && 'opacity-20',
        active && 'ring-2 ring-primary',
      )}
    >
      <div
        style={{ height: HEADER_H }}
        className={cn(
          'flex shrink-0 items-center gap-1.5 border-b px-2.5',
          isView ? 'bg-glass-inner text-link' : t.mirror ? 'bg-muted text-ink-2' : 'bg-primary/10 text-ink-2',
        )}
      >
        {isView ? <EyeIcon className="size-3.5 shrink-0" /> : <TableIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold">{t.name}</span>
        {t.mirror && <Tag className="bg-glass-strong text-muted-foreground">מראה</Tag>}
        {isView && <Tag className="bg-primary/12 text-link">view</Tag>}
      </div>
      {box.rows.map((r) => (
        <div
          key={r.name}
          style={{ height: ROW_H }}
          className={cn('flex shrink-0 items-center gap-1.5 px-2.5 font-mono text-[11px]', hotRows?.has(r.name) && 'bg-primary/12 font-semibold')}
        >
          <RowIcon row={r} />
          <span className={cn('min-w-0 flex-1 truncate', r.system ? 'text-muted-foreground italic' : 'text-ink-2')}>{r.name}</span>
          <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">{r.type}</span>
        </div>
      ))}
      {box.hidden > 0 && (
        <div style={{ height: FOOT_H }} dir="rtl" className="flex shrink-0 items-center px-2.5 text-[10px] text-muted-foreground">
          +{box.hidden} עמודות נוספות
        </div>
      )}
    </div>
  );
}

/* ---------- Edges ---------- */

function EdgePath({ edge, hot, dim }: { edge: DiagramEdge; hot: boolean; dim: boolean }) {
  // A real reference column is a solid, stronger line in the brand colour; the text-key links stay thin and grey.
  const tone = hot
    ? 'stroke-link'
    : edge.reference
      ? 'stroke-primary'
      : edge.kind === 'view'
        ? 'stroke-link/45'
        : edge.customer
          ? 'stroke-muted-foreground/35'
          : 'stroke-muted-foreground/55';
  const dash = edge.kind === 'view' ? '6 5' : edge.list ? '1.5 3.5' : undefined;
  const width = edge.reference ? (hot ? 2.8 : 2.2) : hot ? 2.2 : 1.3;
  const markWidth = edge.reference ? (hot ? 2.6 : 2) : hot ? 2 : 1.3;
  return (
    <g className={cn('fill-none transition-opacity duration-150', dim && 'opacity-[0.07]')}>
      <path d={edge.path} className={tone} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      {edge.fromMark && <path d={edge.fromMark} className={tone} strokeWidth={markWidth} />}
      {edge.toMark && <path d={edge.toMark} className={tone} strokeWidth={markWidth} />}
    </g>
  );
}

/* ---------- Details panel ---------- */

function Details({ box, diagram, onJump, onClose }: { box: DiagramBox; diagram: Diagram; onJump: (name: string) => void; onClose: () => void }) {
  const t = box.table;
  const out = diagram.edges.filter((e) => e.from === t.name);
  const inc = diagram.edges.filter((e) => e.to === t.name);
  const link = (name: string, label: ReactNode, key: string) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => onJump(name)}
        className="flex w-full items-center gap-1.5 rounded-[10px] px-2 py-1 text-start font-mono text-[11px] text-ink-2 outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span dir="ltr" className="truncate">
          {label}
        </span>
      </button>
    </li>
  );
  return (
    <aside
      dir="rtl"
      aria-label={`פרטי ${t.name}`}
      data-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="glass absolute end-3 top-3 bottom-3 flex w-[min(340px,calc(100%-24px))] flex-col gap-2.5 overflow-y-auto rounded-[22px] border p-[13px]"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span dir="ltr" className="truncate text-end font-mono text-base font-bold text-ink-2">
            {t.name}
          </span>
          <span className="flex flex-wrap gap-1">
            <Tag className="bg-glass-strong text-ink-2">{box.group}</Tag>
            {t.kind === 'view' && <Tag className="bg-primary/12 text-link">view</Tag>}
            {t.mirror && <Tag className="bg-glass-strong text-muted-foreground">מראה</Tag>}
            <Tag className="bg-glass-strong text-ink-2">{box.allRows.filter((r) => !r.system).length} עמודות</Tag>
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="סגירה" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      {t.description && (
        <p dir="auto" className="text-xs leading-relaxed text-ink-2">
          {t.description}
        </p>
      )}
      {t.baseTable && (
        <p className="text-xs text-muted-foreground">
          טבלת בסיס: <span dir="ltr">{[t.baseTable, ...(t.joins ?? [])].join(', ')}</span>
        </p>
      )}
      <section aria-label="עמודות" className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">עמודות</span>
        <ul dir="ltr" className="flex flex-col divide-y rounded-[14px] bg-glass-inner">
          {box.allRows.map((r) => (
            <li key={r.name} className="flex flex-col gap-0.5 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <RowIcon row={r} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-2">{r.name}</span>
                <span className="max-w-[50%] truncate text-[10px] text-muted-foreground">{r.type}</span>
              </span>
              {r.enum && (
                <span className="flex flex-wrap gap-1 ps-[18px]">
                  {r.enum.map((v) => (
                    <Tag key={v} className="bg-glass-strong text-ink-2">
                      {v}
                    </Tag>
                  ))}
                </span>
              )}
              {r.description && (
                <span dir="auto" className="ps-[18px] text-[11px] text-muted-foreground">
                  {r.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {out.length > 0 && (
        <section aria-label="מצביעה על" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">מצביעה על ({out.length})</span>
          <ul className="flex flex-col">
            {out.map((e) => link(e.to, e.kind === 'view' ? `→ ${e.to}` : `${e.fromColumn} → ${e.to}.${e.toColumn}`, e.id))}
          </ul>
        </section>
      )}
      {inc.length > 0 && (
        <section aria-label="מצביעות עליה" className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">מצביעות עליה ({inc.length})</span>
          <ul className="flex flex-col">
            {inc.map((e) => link(e.from, e.kind === 'view' ? `${e.from} (view)` : `${e.from}.${e.fromColumn} → ${e.toColumn}`, e.id))}
          </ul>
        </section>
      )}
    </aside>
  );
}

/* ---------- Legend ---------- */

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-[21px] gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <KeyRoundIcon className="size-3.5 text-link" />
        מפתח
      </span>
      <span className="flex items-center gap-1.5">
        <Link2Icon className="size-3.5" />
        עמודת קישור
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14" className="fill-none stroke-muted-foreground" strokeWidth="1.3">
          <path d="M2 7H28M16 7L2 1M16 7L2 13M21 1V13" />
        </svg>
        רבים (n)
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14" className="fill-none stroke-muted-foreground" strokeWidth="1.3">
          <path d="M2 7H28M19 1V13M24 1V13" />
        </svg>
        אחד (1)
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14" className="fill-none stroke-muted-foreground" strokeWidth="1.3">
          <path d="M2 7H28" strokeDasharray="1.5 3.5" strokeLinecap="round" />
        </svg>
        רשימת קודים
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14" className="fill-none stroke-primary" strokeWidth="2.2">
          <path d="M2 7H28" strokeLinecap="round" />
        </svg>
        קישור אמיתי
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14" className="fill-none stroke-link/60" strokeWidth="1.3">
          <path d="M2 7H28" strokeDasharray="6 5" />
        </svg>
        view ← טבלה
      </span>
    </div>
  );
}

/* ---------- The diagram ---------- */

type ColumnsMode = 'keys' | 'all';

/**
 * Design · נתונים (DB), the "דיאגרמה" view: an ER diagram like DBeaver / dbdiagram. Every table a box (mirrors tinted,
 * views dashed), arrows from the exact link column to the key of the target with crow's-foot ends, clustered by
 * component. Pan by dragging, zoom with the wheel or the buttons, fit to screen, full screen; hover or click a table
 * to light up its links and neighbours; search jumps to a table.
 */
export function DesignDbDiagram() {
  const [showViews, setShowViews] = useState(true);
  const [mode, setMode] = useState<ColumnsMode>('keys');
  const [showCustomer, setShowCustomer] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [full, setFull] = useState(false);
  const [panning, setPanning] = useState(false);
  const [camState, dispatch] = useReducer(camReducer, { w: 0, h: 0, cam: null });
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; cam: Cam; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);

  const diagram = buildDiagram({ showViews, compact: mode === 'keys' });
  const bounds: Bounds = { width: diagram.width, height: diagram.height };
  const cam = camState.cam ?? fitCam(camState.w, camState.h, bounds);
  const edges = showCustomer ? diagram.edges : diagram.edges.filter((e) => !e.customer);
  const selectedBox = selected ? diagram.boxes.get(selected) : undefined;
  const active = hovered ?? (selectedBox ? selected : null);

  // What lights up: the active table's edges, their other ends, and the rows they leave from / land on.
  const hotEdges = new Set<string>();
  const neighbours = new Set<string>();
  const hotRows = new Map<string, Set<string>>();
  if (active) {
    neighbours.add(active);
    for (const e of edges) {
      if (e.from !== active && e.to !== active) continue;
      hotEdges.add(e.id);
      neighbours.add(e.from);
      neighbours.add(e.to);
      for (const [table, column] of [
        [e.from, e.fromColumn],
        [e.to, e.toColumn],
      ] as const) {
        if (!column) continue;
        if (!hotRows.has(table)) hotRows.set(table, new Set());
        hotRows.get(table)?.add(column);
      }
    }
  }
  const orderedEdges = active ? [...edges.filter((e) => !hotEdges.has(e.id)), ...edges.filter((e) => hotEdges.has(e.id))] : edges;

  const q = query.trim().toLowerCase();
  const matches = q ? [...diagram.boxes.keys()].filter((n) => n.toLowerCase().includes(q)).slice(0, 8) : [];

  // Canvas size → the fitted camera follows it.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => dispatch({ type: 'resize', w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom around the cursor (non-passive, so the page does not scroll under the diagram).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if ((e.target as HTMLElement).closest('[data-no-zoom]')) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      dispatch({ type: 'zoom', factor: Math.exp(-e.deltaY * 0.0015), mx: e.clientX - rect.left, my: e.clientY - rect.top, bounds: { width: diagram.width, height: diagram.height } });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [diagram.width, diagram.height]);

  // Full screen follows the browser (Esc leaves it); the camera re-fits to the new size.
  useEffect(() => {
    function onChange() {
      setFull(document.fullscreenElement === rootRef.current);
      dispatch({ type: 'set', cam: null });
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  }

  function refit() {
    dispatch({ type: 'set', cam: null });
  }

  function jumpTo(name: string) {
    const box = diagram.boxes.get(name);
    if (!box) return;
    const k = Math.max(cam.k, 0.85);
    const { w, h } = camState;
    dispatch({ type: 'set', cam: { k, x: w / 2 - (box.x + BOX_W / 2) * k, y: h / 2 - (box.y + Math.min(box.h, (h / k) * 0.7) / 2) * k } });
    setSelected(name);
    setQuery('');
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    justDragged.current = false;
    drag.current = { sx: e.clientX, sy: e.clientY, cam, moved: false, id: e.pointerId };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      setPanning(true);
      setHovered(null);
      e.currentTarget.setPointerCapture(d.id);
    }
    dispatch({ type: 'set', cam: { ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy } });
  }
  function onPointerUp() {
    if (drag.current?.moved) justDragged.current = true;
    drag.current = null;
    setPanning(false);
  }

  function select(name: string) {
    if (justDragged.current) return;
    setSelected((cur) => (cur === name ? null : name));
  }
  function hover(name: string | null) {
    if (!drag.current?.moved) setHovered(name);
  }

  const canFull = typeof document !== 'undefined' && document.fullscreenEnabled;

  return (
    <div
      ref={rootRef}
      className={cn('glass flex flex-col gap-[13px] rounded-[26px] border p-[13px] md:p-[21px]', full && 'h-full w-full rounded-none bg-background')}
    >
      <div className="flex flex-wrap items-center gap-[13px]">
        <div className="relative w-full sm:w-64">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              dir="ltr"
              placeholder="חיפוש טבלה"
              aria-label="חיפוש טבלה"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) jumpTo(matches[0]);
                if (e.key === 'Escape') setQuery('');
              }}
            />
          </InputGroup>
          {q && (
            <ul className="glass absolute inset-x-0 top-full z-20 mt-1 flex flex-col rounded-[16px] border p-1">
              {matches.length === 0 ? (
                <li className="px-2.5 py-1.5 text-xs text-muted-foreground">אין טבלה בשם הזה{showViews ? '' : ' (ה-views מוסתרים)'}</li>
              ) : (
                matches.map((n) => (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => jumpTo(n)}
                      className="flex w-full items-center gap-1.5 rounded-[12px] px-2.5 py-1.5 font-mono text-xs text-ink-2 outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {diagram.boxes.get(n)?.table.kind === 'view' ? <EyeIcon className="size-3.5" /> : <TableIcon className="size-3.5" />}
                      <span dir="ltr">{n}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <ToggleGroup
          aria-label="עמודות"
          variant="outline"
          size="sm"
          spacing={0}
          value={[mode]}
          onValueChange={(v) => {
            const next = v[0] as ColumnsMode | undefined;
            if (next) {
              setMode(next);
              refit();
            }
          }}
        >
          <ToggleGroupItem value="keys">מפתחות וקישורים</ToggleGroupItem>
          <ToggleGroupItem value="all">כל העמודות</ToggleGroupItem>
        </ToggleGroup>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Switch
            checked={showViews}
            onCheckedChange={(c) => {
              setShowViews(c);
              if (!c && selectedBox?.table.kind === 'view') setSelected(null);
              refit();
            }}
          />
          views
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Switch checked={showCustomer} onCheckedChange={setShowCustomer} />
          חיצים ל-Customers
        </label>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="הקטנה" title="הקטנה" onClick={() => dispatch({ type: 'zoom', factor: 1 / 1.25, bounds })}>
            <ZoomOutIcon />
          </Button>
          <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">{Math.round(cam.k * 100)}%</span>
          <Button variant="ghost" size="icon-sm" aria-label="הגדלה" title="הגדלה" onClick={() => dispatch({ type: 'zoom', factor: 1.25, bounds })}>
            <ZoomInIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="התאמה למסך" title="התאמה למסך" onClick={refit}>
            <ScanIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canFull}
            onClick={toggleFull}
            aria-label={full ? 'יציאה ממסך מלא' : 'מסך מלא'}
          >
            {full ? <MinimizeIcon data-icon="inline-start" /> : <MaximizeIcon data-icon="inline-start" />}
            {full ? 'יציאה (Esc)' : 'מסך מלא'}
          </Button>
        </div>
      </div>

      <div
        ref={canvasRef}
        dir="ltr"
        role="application"
        aria-label="דיאגרמת הטבלאות"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!justDragged.current) setSelected(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelected(null);
          if (e.key === '+' || e.key === '=') dispatch({ type: 'zoom', factor: 1.25, bounds });
          if (e.key === '-') dispatch({ type: 'zoom', factor: 1 / 1.25, bounds });
          if (e.key === '0') refit();
        }}
        className={cn(
          'relative touch-none overflow-hidden rounded-[22px] bg-glass-faint outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
          full ? 'min-h-0 flex-1' : 'h-[72vh] min-h-[480px]',
          panning ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {diagram.clusters.map((c) => (
            <div
              key={c.title}
              dir="rtl"
              style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
              className={cn('absolute rounded-[30px] border border-dashed px-[30px] pt-3', c.mirror ? 'border-ink-2/20 bg-muted/40' : 'border-link/20 bg-primary/[0.03]')}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold text-ink-2">{c.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
              </span>
            </div>
          ))}
          <svg aria-hidden width={diagram.width} height={diagram.height} className="pointer-events-none absolute top-0 left-0 overflow-visible">
            {orderedEdges.map((e) => (
              <EdgePath key={e.id} edge={e} hot={hotEdges.has(e.id)} dim={!!active && !hotEdges.has(e.id)} />
            ))}
          </svg>
          {[...diagram.boxes.values()].map((b) => (
            <TableBox
              key={b.table.name}
              box={b}
              dimmed={!!active && !neighbours.has(b.table.name)}
              active={b.table.name === selected}
              hotRows={hotRows.get(b.table.name)}
              onSelect={select}
              onHover={hover}
            />
          ))}
        </div>
        {selectedBox && <Details box={selectedBox} diagram={diagram} onJump={jumpTo} onClose={() => setSelected(null)} />}
      </div>

      <div dir="rtl" className="flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <span className="text-xs text-muted-foreground">
          {diagram.boxes.size} טבלאות · {edges.length} קשרים · גרירה להזזה, גלגלת לזום, לחיצה על טבלה לפרטים
        </span>
      </div>
    </div>
  );
}