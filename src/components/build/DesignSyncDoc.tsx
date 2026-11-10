import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpLeftIcon, CompassIcon, CopyIcon, DatabaseIcon, HourglassIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { DocTable, SectionTitle, Tag } from '@/components/build/DesignParts';
import { Button } from '@/components/ui/button';
import { BUILD_PAGE_PATHS } from '@/utils/buildPages';
import { DESIGN_SYNC } from '@/utils/buildDocs/designSync';

const D = DESIGN_SYNC;

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>{children}</span>
    </li>
  );
}

/** Design · סנכרון עם Priority — the cross-component doc, in the style of Design 01–03: principle, mechanisms, entities, gaps, mirror vs enrichment, today. */
export function DesignSyncDoc() {
  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <span className="text-xs font-semibold text-muted-foreground">Design · {D.date}</span>
        <div className="flex items-end gap-[13px]">
          <span className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-glass-strong text-link shadow-glass-pill">
            <RefreshCwIcon className="size-6" />
          </span>
          <h2 className="pb-1 text-[30px] leading-tight font-extrabold tracking-[-0.015em]">{D.title}</h2>
        </div>
        <p className="max-w-[560px] text-sm text-ink-2">{D.lead}</p>
        <div className="flex flex-wrap gap-1.5">
          <Tag className="bg-primary/12 text-link">חוצה רכיבים</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.mechanisms.rows.length} מנגנונים</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.entities.rows.length} ישויות</Tag>
          <Tag className="bg-glass-inner text-muted-foreground">משיכת הבוקר נבנתה · השאר תיעוד</Tag>
        </div>
      </header>

      <section aria-label={D.principle.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={1} title={D.principle.title} icon={CompassIcon} />
        <ul className="glass flex flex-col gap-2 rounded-[26px] border p-[21px] md:p-[34px]">
          {D.principle.points.map((p) => (
            <Bullet key={p}>{p}</Bullet>
          ))}
        </ul>
      </section>

      <section aria-label={D.mechanisms.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={2} title={D.mechanisms.title} icon={RefreshCwIcon} />
        <div className="glass flex flex-col gap-[13px] overflow-x-auto rounded-[26px] border p-[13px] md:p-[21px]">
          <DocTable head={D.mechanisms.head} rows={D.mechanisms.rows} />
          <p className="rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">
            <strong className="text-foreground">{D.mechanisms.note.lead}</strong> {D.mechanisms.note.text}
          </p>
        </div>
      </section>

      <section aria-label={D.entities.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={3} title={D.entities.title} icon={DatabaseIcon} />
        <div className="glass overflow-x-auto rounded-[26px] border p-[13px] md:p-[21px]">
          <DocTable head={D.entities.head} rows={D.entities.rows} />
        </div>
      </section>

      <section aria-label={D.gaps.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={4} title={D.gaps.title} icon={TriangleAlertIcon} />
        <ul className="glass grid gap-[13px] rounded-[26px] border p-[21px] md:grid-cols-3 md:p-[34px]">
          {D.gaps.items.map((g) => (
            <li key={g.lead} className="glass-inner p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-4">
              <strong className="text-foreground">{g.lead}</strong> {g.text}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={D.mirror.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={5} title={`${D.mirror.title} (${D.mirror.date})`} icon={CopyIcon} />
        <ul className="glass flex flex-col gap-2 rounded-[26px] border p-[21px] md:p-[34px]">
          {D.mirror.items.map((m) => (
            <Bullet key={m.text}>
              <strong className="text-foreground">{m.lead}</strong> {m.text}
            </Bullet>
          ))}
        </ul>
      </section>

      <section aria-label={D.today.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={6} title={D.today.title} icon={HourglassIcon} />
        <div className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px] md:p-[34px]">
          <ul className="flex flex-col gap-1.5">
            {D.today.items.map((i) => (
              <Bullet key={i.text}>
                {i.lead && <strong className="text-foreground">{i.lead}</strong>} {i.text}
              </Bullet>
            ))}
          </ul>
          <Button nativeButton={false} variant="ghost" size="sm" className="self-start rounded-full bg-glass-soft" render={<Link to={BUILD_PAGE_PATHS.gaps} />}>
            לעמוד הפערים
            <ArrowUpLeftIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>
    </article>
  );
}