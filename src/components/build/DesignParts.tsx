import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon, ChevronDownIcon, DatabaseIcon, LayersIcon, RefreshCwIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { BUILD_PAGE_PATHS } from '@/utils/buildPages';
import type { SchemaTable } from '@/utils/buildDocs/designReceipts';

/** The shared building blocks of the Design tabs (01 · תקבולים, 02 · דוח גיול, 03 · ביטוח אשראי, סנכרון). */

/** The Design page's own URL for the cross-component sync doc. */
const DESIGN_SYNC_URL = `${BUILD_PAGE_PATHS.design}?doc=sync`;

/** The "**סנכרון עם Priority:** …" pointer at the top of a component doc; the phrase links to the sync tab. */
export function SyncPointer({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">
      <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-link" />
      <span>
        <strong className="text-foreground">
          <Link to={DESIGN_SYNC_URL} className="text-link underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">
            סנכרון עם Priority
          </Link>
          :
        </strong>{' '}
        {text}
      </span>
    </p>
  );
}

/** Text with `code` (LTR monospace) and **bold** spans. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`'))
          return (
            <code key={i} dir="ltr" className="font-mono">
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith('**') && part.endsWith('**'))
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('h-5 rounded-full border-transparent px-2 text-[11px] font-semibold whitespace-nowrap', className)}>
      {children}
    </Badge>
  );
}

/** "שכבה שלנו": a column only the app writes, never the Priority sync. */
function LayerTag() {
  return (
    <Tag className="bg-primary/12 text-link">
      <LayersIcon className="size-3" />
      שכבה שלנו
    </Tag>
  );
}

export function SectionTitle({ n, title, icon: Icon }: { n: number | string; title: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-[13px]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-strong text-sm font-extrabold text-link shadow-glass-pill tabular-nums">{n}</span>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon className="size-5 text-muted-foreground" />
        {title}
      </h2>
    </div>
  );
}

export function Connector({ label }: { label?: string }) {
  return (
    <div aria-hidden className="flex flex-col items-center py-1">
      <span className="h-4 w-px bg-ink-2/25" />
      {label && <span className="rounded-full bg-glass-inner px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{label}</span>}
      <ChevronDownIcon className="-mt-0.5 size-4 text-ink-2/40" />
    </div>
  );
}

export function StepNumber({ n, className }: { n: number; className?: string }) {
  return <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background tabular-nums', className)}>{n}</span>;
}

export function TableNode({ name }: { name: string }) {
  return (
    <span dir="ltr" className="inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-glass-strong px-2.5 font-mono text-xs font-semibold text-ink-2 shadow-glass-pill">
      <DatabaseIcon className="size-3.5 text-muted-foreground" />
      {name}
    </span>
  );
}

export function Edge({ via }: { via: string }) {
  return (
    <span className="flex flex-col items-center px-0.5">
      <span dir="ltr" className="font-mono text-[10px] leading-none text-muted-foreground">
        {via}
      </span>
      <ArrowLeftIcon className="size-4 text-ink-2/50" />
    </span>
  );
}

/** A plain text table of a design file (headers + rows of text), in the glass style. */
export function DocTable({ head, rows, className }: { head: string[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[18px] bg-glass-card', className)}>
      <Table className="min-w-[620px] text-[13px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {head.map((h, i) => (
              <TableHead key={h} className={cn('h-9 text-xs font-semibold text-muted-foreground', i === 0 && 'ps-[13px]', i === head.length - 1 && 'pe-[13px]')}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, ri) => (
            <TableRow key={ri} className="align-top hover:bg-glass-faint">
              {r.map((c, ci) => (
                <TableCell
                  key={ci}
                  className={cn('py-2.5 align-top leading-relaxed whitespace-normal text-ink-2', ci === 0 && 'ps-[13px] font-bold text-foreground', ci === r.length - 1 && 'pe-[13px]')}
                >
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** One table of a schema: its columns (columns of our own layer marked "שכבה שלנו"), origin and notes. */
export function SchemaCard({ table }: { table: SchemaTable }) {
  return (
    <section aria-label={table.name} className="glass glass-lift flex min-w-0 flex-col gap-2.5 rounded-[26px] border p-[13px] md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="font-mono text-sm font-bold text-ink-2">
          {table.name}
        </span>
        <span className="text-[13px] text-muted-foreground">— {table.title}</span>
        <span className="ms-auto flex flex-wrap gap-1">
          {table.isNew && <Tag className="bg-primary/12 text-link">חדש</Tag>}
          {table.mirror && !table.layer && <Tag className="bg-glass-inner text-muted-foreground">מראה של Priority · קריאה בלבד</Tag>}
          {table.layer && <Tag className="bg-glass-inner text-muted-foreground">מראה של Priority + שכבה שלנו</Tag>}
          {table.ours && <Tag className="bg-glass-inner text-muted-foreground">שלנו</Tag>}
        </span>
      </div>
      {table.origin && (
        <span className="self-start rounded-full bg-glass-inner px-2.5 py-0.5 text-[11px] text-muted-foreground">
          במקור: <span className={cn(/^[a-z_]+$/.test(table.origin) && 'font-mono')}>{table.origin}</span>
        </span>
      )}
      {table.role && <span className="self-start rounded-full bg-glass-inner px-2.5 py-0.5 text-[11px] text-muted-foreground">{table.role}</span>}
      {table.intro && <p className="px-1 text-xs leading-relaxed text-ink-2">{table.intro}</p>}
      {table.columns && (
        <dl className="flex flex-col divide-y divide-glass-edge rounded-[16px] bg-glass-card px-[13px]">
          {table.columns.map((c) => (
            <div key={c.name} className={cn('grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] gap-x-[13px] py-1.5', c.layer && '-mx-[13px] bg-primary/[0.05] px-[13px]')}>
              <dt className="flex flex-col items-start gap-0.5">
                <span dir="ltr" className="text-start font-mono text-xs font-semibold break-words text-ink-2">
                  {c.name}
                </span>
                {c.layer && c.type === 'שכבה שלנו' ? <LayerTag /> : <span className="text-[11px] text-muted-foreground">{c.type}</span>}
                {c.layer && c.type !== 'שכבה שלנו' && <LayerTag />}
              </dt>
              <dd className="text-xs leading-relaxed text-ink-2">{c.note}</dd>
            </div>
          ))}
        </dl>
      )}
      {table.rows && (
        <dl className="flex flex-col gap-1.5">
          {table.rows.map((r) => (
            <div key={r.name} className="flex flex-col gap-0.5 rounded-[16px] bg-glass-card px-[13px] py-2">
              <dt dir="ltr" className="text-start font-mono text-xs font-semibold text-ink-2">
                {r.name}
              </dt>
              <dd className="text-xs leading-relaxed text-ink-2">{r.note}</dd>
            </div>
          ))}
        </dl>
      )}
      {table.text && <p className="rounded-[16px] bg-glass-card px-[13px] py-2 text-xs leading-relaxed text-ink-2">{table.text}</p>}
      {table.footnote && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{table.footnote}</p>}
    </section>
  );
}