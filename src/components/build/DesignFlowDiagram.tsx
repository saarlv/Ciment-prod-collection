import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  Code2Icon,
  CornerDownLeftIcon,
  DatabaseIcon,
  DownloadCloudIcon,
  FlagIcon,
  HourglassIcon,
  MonitorIcon,
  MousePointerClickIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UserIcon,
} from 'lucide-react';
import { RichText, TableNode, Tag } from '@/components/build/DesignParts';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useMinWidth } from '@/hooks/useMinWidth';
import { cn } from '@/lib/utils';
import { FLOW_KINDS, FLOW_STATUSES, flattenFlow } from '@/utils/buildDocs/designFlows';
import type { FlowBlock, FlowKind, FlowLadder, FlowRung, FlowStatus } from '@/utils/buildDocs/designFlows';

const KIND: Record<FlowKind, { icon: LucideIcon; tone: string }> = {
  קוד: { icon: Code2Icon, tone: 'bg-glass-inner text-muted-foreground' },
  'סוכן AI': { icon: SparklesIcon, tone: 'bg-primary/12 text-link' },
  אדם: { icon: UserIcon, tone: 'bg-success-soft text-success-ink' },
  Priority: { icon: DownloadCloudIcon, tone: 'bg-warning-soft text-warning-ink' },
  מסך: { icon: MonitorIcon, tone: 'bg-glass-strong text-ink-2 ring-1 ring-ink-2/15' },
};

const STATUS: Record<'בנוי' | FlowStatus, { icon: LucideIcon; tone: string }> = {
  בנוי: { icon: CheckIcon, tone: 'border-ink-2/20 text-ink-2' },
  'מקום בלבד': { icon: CircleDashedIcon, tone: 'border-dashed border-muted-foreground/60 bg-transparent text-muted-foreground' },
  TBD: { icon: CircleHelpIcon, tone: 'bg-warning-soft text-warning-ink' },
  // Defined and approved, waiting for its build stage: a calm blue, not a warning.
  ממתין: { icon: HourglassIcon, tone: 'border-primary/30 bg-primary/12 text-link' },
};

/** Staircase indent per rung, only when the column is wide enough (logical margin, so it steps the reading way in RTL). */
const STAIR = ['', '@[34rem]:ms-5', '@[34rem]:ms-10', '@[34rem]:ms-15', '@[34rem]:ms-20', '@[34rem]:ms-24'];

const HEBREW = /[֐-׿]/;

function KindChip({ kind }: { kind: FlowKind }) {
  const { icon: Icon, tone } = KIND[kind];
  return (
    <Tag className={tone}>
      <Icon className="size-3" />
      {kind}
    </Tag>
  );
}

function KindChips({ kind }: { kind: FlowKind | FlowKind[] }) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {kinds.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[11px] font-bold text-muted-foreground">+</span>}
          <KindChip kind={k} />
        </span>
      ))}
    </span>
  );
}

function StatusChip({ status }: { status: 'בנוי' | FlowStatus }) {
  const { icon: Icon, tone } = STATUS[status];
  return (
    <Tag className={tone}>
      <Icon className="size-3" />
      {status}
    </Tag>
  );
}

function NumberDot({ n, small }: { n: string; small?: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background tabular-nums',
        small ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-7 min-w-7 px-1 text-xs',
      )}
    >
      {n}
    </span>
  );
}

/** A child block drawn inside a rung or a gate: number + title, clickable, keeps the block's id for scrolling. */
function ChildChip({ block, selected, onSelect }: { block: FlowBlock; selected: boolean; onSelect: () => void }) {
  const Icon = KIND[block.kind].icon;
  return (
    <button
      id={`flow-block-${block.n}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-glass-strong py-1 ps-1 pe-2.5 text-start text-xs font-semibold text-ink-2 shadow-glass-pill outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-primary focus-visible:ring-primary',
      )}
    >
      <NumberDot n={block.n} small />
      <span className="min-w-0 truncate">{block.title}</span>
      <Icon aria-label={block.kind} className="size-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

type ChildProps = { byN: Map<string, FlowBlock>; picked: string | null; onPick: (n: string) => void };

function ChildChain({ ns, byN, picked, onPick }: ChildProps & { ns: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {ns.map((n, i) => {
        const child = byN.get(n);
        if (!child) return null;
        return (
          <span key={n} className="inline-flex min-w-0 max-w-full items-center gap-1">
            {i > 0 && <ArrowLeftIcon aria-hidden className="size-3.5 shrink-0 text-ink-2/40" />}
            <ChildChip block={child} selected={picked === n} onSelect={() => onPick(n)} />
          </span>
        );
      })}
    </span>
  );
}

function Rung({ rung, i, ladder, last, ...child }: ChildProps & { rung: FlowRung; i: number; ladder: FlowLadder; last: boolean }) {
  const outcome = rung.outcome ?? `${ladder.found.label ?? 'נמצא'} ← ${ladder.found.to}`;
  return (
    <li className={cn('flex flex-col', STAIR[Math.min(i, STAIR.length - 1)])}>
      <div className={cn('flex flex-col gap-1.5 rounded-[18px] bg-glass-inner p-2.5', last && 'ring-1 ring-ink-2/15')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-glass-strong text-[11px] font-extrabold text-link shadow-glass-pill tabular-nums">{i + 1}</span>
          <span className="text-[13px] font-bold text-foreground">{rung.title}</span>
          <KindChips kind={rung.kind} />
          {rung.status && <StatusChip status={rung.status} />}
          <span className="ms-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-link">{outcome}</span>
        </div>
        <p className="text-xs leading-relaxed text-ink-2">{rung.line}</p>
        {rung.blocks && <ChildChain ns={rung.blocks} {...child} />}
        {rung.tables && (
          <span dir="ltr" className="flex items-center gap-1 self-end font-mono text-[11px] text-muted-foreground">
            <DatabaseIcon aria-hidden className="size-3" />
            {rung.tables.join(' · ')}
          </span>
        )}
      </div>
      {last ? (
        <span className="mt-1.5 flex items-center gap-1.5 self-start rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-bold text-background">
          <FlagIcon aria-hidden className="size-3" />
          סוף הסולם · כל רשומה מסתיימת כאן
        </span>
      ) : (
        <span aria-label="לא נמצא, למדרגה הבאה" className="flex items-center gap-1.5 py-1 ps-3 text-[11px] font-semibold text-muted-foreground">
          <span aria-hidden className="h-4 w-px bg-ink-2/25" />
          לא נמצא
          <ArrowDownIcon aria-hidden className="size-3" />
        </span>
      )}
    </li>
  );
}

/** A block with a gate and/or ladder: header (clickable) on top, then the visible staircase. Takes the full column width. */
function LadderBlockCard({ block, selected, onSelect, tags, ...child }: ChildProps & { block: FlowBlock; selected: boolean; onSelect: () => void; tags: string[] }) {
  const gateChild = block.gate?.to ? child.byN.get(block.gate.to) : undefined;
  return (
    <div id={`flow-block-${block.n}`} className={cn('glass glass-lift flex w-full min-w-0 flex-col gap-[13px] rounded-[22px] border p-[13px]', selected && 'ring-2 ring-primary')}>
      <button type="button" aria-pressed={selected} onClick={onSelect} className="flex flex-col gap-1.5 rounded-[14px] text-start outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BlockHeader block={block} tags={tags} />
      </button>
      {block.gate && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[18px] border border-dashed border-ink-2/20 px-2.5 py-2 text-xs">
          <ShieldAlertIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold text-muted-foreground">קודם:</span>
          <span className="font-bold text-foreground">{block.gate.label}</span>
          <span aria-hidden className="text-muted-foreground">←</span>
          {gateChild && <ChildChip block={gateChild} selected={child.picked === gateChild.n} onSelect={() => child.onPick(gateChild.n)} />}
          <span className="text-ink-2">{block.gate.outcome}</span>
        </div>
      )}
      {block.ladder && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-bold text-foreground">סולם · {block.ladder.rungs.length} מדרגות</span>
            {block.ladder.foundNote && <span className="text-[11px] text-muted-foreground">{block.ladder.foundNote}</span>}
          </div>
          <ol aria-label={`הסולם של ${block.n}`} className="flex flex-col">
            {block.ladder.rungs.map((r, i, all) => (
              <Rung key={r.title} rung={r} i={i} ladder={block.ladder as FlowLadder} last={i === all.length - 1} {...child} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Children drawn inside a block's gate or ladder rungs (so not again beside it). */
function inlinedChildren(block: FlowBlock): string[] {
  return [...(block.gate?.to ? [block.gate.to] : []), ...(block.ladder?.rungs.flatMap((r) => r.blocks ?? []) ?? [])];
}

/** "The flow in one line": the main blocks as kind-colored numbered chips, clickable. */
function FlowOverview({ blocks, selected, onSelect }: { blocks: FlowBlock[]; selected: string | null; onSelect: (n: string) => void }) {
  return (
    <nav aria-label="הזרימה בשורה אחת" className="glass flex flex-col gap-2 rounded-[22px] border p-[13px]">
      <span className="text-xs font-semibold text-muted-foreground">הזרימה בשורה אחת</span>
      <ol className="flex flex-wrap items-center gap-y-2">
        {blocks.map((b, i) => {
          const { icon: Icon, tone } = KIND[b.kind];
          return (
            <li key={b.n} className="flex items-center">
              {i > 0 && <ArrowLeftIcon aria-hidden className="mx-1 size-3.5 shrink-0 text-ink-2/40" />}
              <button
                type="button"
                aria-pressed={selected === b.n}
                onClick={() => onSelect(b.n)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full py-1 ps-1 pe-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tone,
                  selected === b.n && 'ring-2 ring-primary focus-visible:ring-primary',
                )}
              >
                <NumberDot n={b.n} small />
                <span className="whitespace-nowrap">{b.title}</span>
                <Icon aria-hidden className="size-3 shrink-0" />
                {b.status && <span className="text-[10px] font-bold opacity-80">· {b.status}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The action name, small. Pure code reads LTR; a mix with Hebrew reads RTL (arrows then point the reading way). */
function ActionText({ action, className }: { action: string; className?: string }) {
  const rtl = HEBREW.test(action.replace(/`[^`]+`/g, ''));
  const text = rtl ? action.replaceAll('→', '←') : action;
  return (
    <span dir={rtl ? 'rtl' : 'ltr'} className={cn('self-start font-mono text-[11px] leading-snug text-muted-foreground', className)}>
      <RichText text={text} />
    </span>
  );
}

/** "→ 7" / "חוזר ל-6" / "סוף" for targets that aren't drawn as an arrow. */
function jumpTags(block: FlowBlock, drawn: string[], pos: Map<string, number>): string[] {
  if (block.next.length === 0) return ['סוף'];
  const self = pos.get(block.n) ?? 0;
  return block.next
    .filter((x) => !drawn.includes(x.to))
    .map((x) => {
      const back = (pos.get(x.to) ?? Infinity) <= self;
      const head = back ? `חוזר ל-${x.to}` : `→ ${x.to}`;
      return x.label ? `${head} · ${x.label}` : head;
    });
}

function BlockCard({
  block,
  selected,
  onSelect,
  tags,
  branch,
  small,
}: {
  block: FlowBlock;
  selected: boolean;
  onSelect: () => void;
  tags: string[];
  branch?: string;
  small?: boolean;
}) {
  return (
    <button
      id={`flow-block-${block.n}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'glass glass-lift flex w-full min-w-0 flex-col gap-1.5 rounded-[22px] border text-start outline-none focus-visible:ring-2 focus-visible:ring-ring',
        small ? 'p-2.5' : 'p-[13px]',
        selected && 'ring-2 ring-primary focus-visible:ring-primary',
      )}
    >
      {branch && <span className="self-start rounded-full bg-glass-inner px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{branch}</span>}
      <BlockHeader block={block} tags={tags} small={small} />
    </button>
  );
}

function BlockHeader({ block, tags, small }: { block: FlowBlock; tags: string[]; small?: boolean }) {
  return (
    <>
      <span className="flex items-start gap-2">
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background tabular-nums',
            small ? 'h-6 min-w-6 px-1 text-[11px]' : 'h-7 min-w-7 px-1 text-xs',
          )}
        >
          {block.n}
        </span>
        <span className={cn('min-w-0 flex-1 pt-0.5 font-bold text-foreground', small ? 'text-[13px]' : 'text-sm')}>{block.title}</span>
        <span className="flex flex-wrap justify-end gap-1">
          <KindChip kind={block.kind} />
          {block.status && <StatusChip status={block.status} />}
        </span>
      </span>
      <span className={cn('leading-relaxed text-ink-2', small ? 'text-xs' : 'text-[13px]')}>{block.line}</span>
      {block.action && <ActionText action={block.action} />}
      {tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-glass-inner px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {t}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/** The arrow down to the next main block; stretches when the sub-steps beside are taller. */
function DownArrow({ label }: { label?: string }) {
  return (
    <div aria-hidden className="flex min-h-10 flex-col items-center py-1">
      <span className="min-h-3 w-px flex-1 bg-ink-2/25" />
      {label && <span className="rounded-full bg-glass-inner px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{label}</span>}
      <ChevronDownIcon className="-mt-0.5 size-4 text-ink-2/40" />
    </div>
  );
}

function TableList({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {names.map((full) => {
          const m = /^(\S+)\s*(?:\((.+)\))?$/.exec(full);
          return (
            <span key={full} className="inline-flex flex-wrap items-center gap-1">
              <TableNode name={m?.[1] ?? full} />
              {m?.[2] && <span className="text-[11px] text-muted-foreground">({m[2]})</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ExplainPanel({
  block,
  byN,
  onSelect,
  heading,
}: {
  block: FlowBlock | null;
  byN: Map<string, FlowBlock>;
  onSelect: (n: string) => void;
  heading: (title: string) => ReactNode;
}) {
  if (!block)
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <MousePointerClickIcon className="size-4 shrink-0" />
        לחצו על בלוק כדי לראות מה הוא עושה
      </p>
    );
  return (
    <div className="flex flex-col gap-[13px]">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-xs font-bold text-background tabular-nums">{block.n}</span>
          {heading(block.title)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KindChip kind={block.kind} />
          {block.status && <StatusChip status={block.status} />}
          {block.action && <ActionText action={block.action} className="self-center text-xs" />}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{block.line}</p>
      </div>
      {block.explain && (
        <div className="flex flex-col gap-2 rounded-[18px] bg-glass-card p-[13px] text-[13px] leading-relaxed text-ink-2">
          {block.explain.map((part, i) =>
            typeof part === 'string' ? (
              <p key={i}>
                <RichText text={part} />
              </p>
            ) : (
              <ul key={i} className="flex list-disc flex-col gap-1 ps-5">
                {part.map((li) => (
                  <li key={li}>
                    <RichText text={li} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </div>
      )}
      {block.reads && <TableList label="קורא מ" names={block.reads} />}
      {block.writes && <TableList label="כותב ל" names={block.writes} />}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">הבא</span>
        {block.next.length === 0 ? (
          <span className="text-[13px] text-ink-2">סוף הזרימה</span>
        ) : (
          <div className="flex flex-col gap-1">
            {block.next.map((x) => {
              const target = byN.get(x.to);
              return (
                <button
                  key={x.to}
                  type="button"
                  onClick={() => onSelect(x.to)}
                  className="flex items-center gap-2 rounded-[14px] bg-glass-soft px-[13px] py-2 text-start text-[13px] text-link outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeftIcon className="size-4 shrink-0" />
                  <span className="font-bold tabular-nums">{x.to}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{target?.title}</span>
                  {x.label && <span className="shrink-0 text-xs text-muted-foreground">{x.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The "דיאגרמה" view of a component's design file: its programmatic steps as clickable blocks. */
export function DesignFlowDiagram({ blocks }: { blocks: FlowBlock[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const isLg = useMinWidth(1024);
  const flat = flattenFlow(blocks);
  const pos = new Map(flat.map((b, i) => [b.n, i]));
  const byN = new Map(flat.map((b) => [b.n, b]));
  const current = selected ? (byN.get(selected) ?? null) : null;

  function selectFromPanel(n: string) {
    setSelected(n);
    if (isLg) document.getElementById(`flow-block-${n}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function selectFromOverview(n: string) {
    setSelected(n);
    document.getElementById(`flow-block-${n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && selected && isLg) setSelected(null);
  }

  const toggle = (n: string) => setSelected((s) => (s === n ? null : n));

  return (
    <div className="flex flex-col gap-[21px]" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-x-[21px] gap-y-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">סוגי בלוקים:</span>
          {FLOW_KINDS.map((k) => (
            <KindChip key={k} kind={k} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">מצב:</span>
          {FLOW_STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </div>
      </div>
      <FlowOverview blocks={blocks} selected={selected} onSelect={selectFromOverview} />
      <div className="flex flex-col gap-[21px] lg:grid lg:grid-cols-[minmax(0,1.618fr)_minmax(0,1fr)] lg:items-start">
        <ol aria-label="בלוקים" className="@container flex min-w-0 flex-col">
          {blocks.map((b, i) => {
            const following = blocks[i + 1]?.n;
            const inlined = inlinedChildren(b);
            const hasLadder = !!(b.ladder || b.gate);
            const allKids = b.children ?? [];
            const kids = allKids.filter((k) => !inlined.includes(k.n));
            const kidNs = allKids.map((k) => k.n);
            const arrow = following ? b.next.find((x) => x.to === following) : undefined;
            /** All sub-steps continue to the next main block (e.g. the six routes of 04 · 5 → 6): the main column still flows down. */
            const viaKids = !!following && kids.length > 0 && kids.every((k) => k.next.some((x) => x.to === following));
            return (
              <li key={b.n} className={cn('grid grid-cols-1 gap-x-[13px]', !hasLadder && '@[30rem]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]')}>
                <div className="min-w-0 @[30rem]:col-start-1 @[30rem]:row-start-1">
                  {hasLadder ? (
                    <LadderBlockCard
                      block={b}
                      selected={selected === b.n}
                      onSelect={() => toggle(b.n)}
                      tags={jumpTags(b, [...kidNs, ...(following ? [following] : [])], pos)}
                      byN={byN}
                      picked={selected}
                      onPick={toggle}
                    />
                  ) : (
                    <BlockCard block={b} selected={selected === b.n} onSelect={() => toggle(b.n)} tags={jumpTags(b, [...kidNs, ...(following ? [following] : [])], pos)} />
                  )}
                </div>
                {kids.length > 0 && (
                  <ul
                    aria-label={`תתי-שלבים של ${b.n}`}
                    className={cn(
                      'ms-6 mt-2 flex min-w-0 flex-col gap-2',
                      !hasLadder && '@[30rem]:col-start-2 @[30rem]:row-span-2 @[30rem]:row-start-1 @[30rem]:ms-0 @[30rem]:mt-0 @[30rem]:self-start',
                    )}
                  >
                    {kids.map((k) => (
                      <li key={k.n} className="flex items-start gap-1">
                        <ArrowLeftIcon aria-hidden className="mt-4 hidden size-4 shrink-0 text-ink-2/40 @[30rem]:block" />
                        <CornerDownLeftIcon aria-hidden className="mt-3 size-4 shrink-0 text-ink-2/40 @[30rem]:hidden" />
                        <BlockCard
                          small
                          block={k}
                          selected={selected === k.n}
                          onSelect={() => toggle(k.n)}
                          tags={jumpTags(k, [], pos)}
                          branch={b.next.find((x) => x.to === k.n)?.label}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {following && (
                  <div className={cn('@[30rem]:col-start-1', !hasLadder && '@[30rem]:row-start-2')}>{arrow || viaKids ? <DownArrow label={arrow?.label} /> : <div aria-hidden className="h-[21px]" />}</div>
                )}
              </li>
            );
          })}
        </ol>
        {isLg && (
          <aside aria-label="הסבר על הבלוק" aria-live="polite" className="glass sticky top-[90px] flex max-h-[calc(100dvh-110px)] flex-col overflow-y-auto rounded-[26px] border p-[21px]">
            <ExplainPanel block={current} byN={byN} onSelect={selectFromPanel} heading={(t) => <h3 className="text-base font-bold text-foreground">{t}</h3>} />
          </aside>
        )}
      </div>
      {!isLg && (
        <Sheet open={!!current} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent side="left" className="glass-menu gap-0 overflow-y-auto p-[21px] pt-12 data-[side=left]:w-full data-[side=left]:sm:max-w-[460px]">
            <ExplainPanel block={current} byN={byN} onSelect={selectFromPanel} heading={(t) => <SheetTitle className="text-base font-bold">{t}</SheetTitle>} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}