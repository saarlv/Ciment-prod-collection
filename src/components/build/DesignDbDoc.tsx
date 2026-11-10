import type { ReactNode } from 'react';
import { DatabaseIcon, EyeIcon, LayersIcon, TableIcon } from 'lucide-react';
import { DocTable, RichText, SectionTitle, Tag } from '@/components/build/DesignParts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DESIGN_DB } from '@/utils/buildDocs/designDb';
import type { DbColumn, DbTable } from '@/utils/buildDocs/designDb';

const D = DESIGN_DB;

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>{children}</span>
    </li>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="font-mono text-xs font-semibold break-words text-ink-2">
      {children}
    </span>
  );
}

function columnRow(c: DbColumn): ReactNode[] {
  return [
    <Mono key="n">{c.name}</Mono>,
    <span key="t" dir="ltr" className="font-mono text-[11px] break-words text-muted-foreground">
      {c.type}
    </span>,
    c.enum ? (
      <span key="e" className="flex flex-wrap gap-1">
        {c.enum.map((v) => (
          <Tag key={v} className="bg-glass-inner text-ink-2">
            {v}
          </Tag>
        ))}
      </span>
    ) : (
      <span key="e" className="text-muted-foreground">
        —
      </span>
    ),
    <span key="d" dir="auto" className="text-xs">
      {c.description || '—'}
    </span>,
  ];
}

function TableItem({ table }: { table: DbTable }) {
  const isView = table.kind === 'view';
  return (
    <AccordionItem value={table.name} className="glass-inner border-none px-[13px]">
      <AccordionTrigger className="gap-2 py-[13px] hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {isView ? <EyeIcon className="size-3.5 text-muted-foreground" /> : <TableIcon className="size-3.5 text-muted-foreground" />}
            <span dir="ltr" className="font-mono text-sm font-bold text-ink-2">
              {table.name}
            </span>
            {isView && <Tag className="bg-primary/12 text-link">view</Tag>}
            {table.mirror && <Tag className="bg-glass-strong text-muted-foreground">מראה</Tag>}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{table.columns.length} עמודות</span>
          </span>
          {table.description && (
            <span dir="auto" className="text-start text-xs font-normal text-ink-2">
              {table.description}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-2.5 pb-[13px]">
        {table.technicalDescription && (
          <p dir="auto" className="rounded-[16px] bg-glass-card px-[13px] py-2 text-xs leading-relaxed text-ink-2">
            {table.technicalDescription}
          </p>
        )}
        {(table.baseTable || (table.uniqueKey && table.uniqueKey.length > 0)) && (
          <span className="flex flex-wrap gap-1.5">
            {table.baseTable && (
              <Tag className="bg-glass-card text-muted-foreground">
                טבלת בסיס: <span dir="ltr">{table.baseTable}</span>
              </Tag>
            )}
            {table.joins && table.joins.length > 0 && (
              <Tag className="bg-glass-card text-muted-foreground">
                מצטרף: <span dir="ltr">{table.joins.join(', ')}</span>
              </Tag>
            )}
            {table.uniqueKey && table.uniqueKey.length > 0 && (
              <Tag className="bg-glass-card text-muted-foreground">
                מפתח: <span dir="ltr">{table.uniqueKey.join(', ')}</span>
              </Tag>
            )}
          </span>
        )}
        <div className="overflow-x-auto">
          <DocTable head={['עמודה', 'סוג', 'ערכים מותרים', 'תיאור']} rows={table.columns.map(columnRow)} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Design · נתונים (DB): every table and view, grouped by component, generated from the artifacts (scripts/gen-db-doc.mjs). */
export function DesignDbDoc() {
  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <span className="text-xs font-semibold text-muted-foreground">Design · נוצר מהטבלאות</span>
        <div className="flex items-end gap-[13px]">
          <span className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-glass-strong text-link shadow-glass-pill">
            <DatabaseIcon className="size-6" />
          </span>
          <h2 className="pb-1 text-[30px] leading-tight font-extrabold tracking-[-0.015em]">{D.title}</h2>
        </div>
        <ul className="flex max-w-[640px] flex-col gap-1.5">
          {D.intro.map((i) => (
            <Bullet key={i}>
              <RichText text={i} />
            </Bullet>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          <Tag className="bg-primary/12 text-link">חוצה רכיבים</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.tableCount} טבלאות</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.viewCount} views</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.groups.length} קבוצות</Tag>
        </div>
      </header>

      {D.groups.map((g, i) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-[13px]">
          <SectionTitle n={i + 1} title={g.title} icon={g.mirror ? LayersIcon : DatabaseIcon} />
          <div className="glass flex min-w-0 flex-col gap-[13px] rounded-[26px] border p-[13px] md:p-[21px]">
            <span className="text-xs text-muted-foreground tabular-nums">
              {g.tables.filter((t) => t.kind === 'table').length} טבלאות
              {g.tables.some((t) => t.kind === 'view') && ` · ${g.tables.filter((t) => t.kind === 'view').length} views`}
            </span>
            <Accordion multiple className="flex flex-col gap-2 overflow-visible rounded-none border-none">
              {g.tables.map((t) => (
                <TableItem key={t.name} table={t} />
              ))}
            </Accordion>
          </div>
        </section>
      ))}
    </article>
  );
}