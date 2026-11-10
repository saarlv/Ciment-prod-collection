import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowUpLeftIcon,
  BellRingIcon,
  CalculatorIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  LayoutPanelTopIcon,
  ShieldCheckIcon,
  SquareSlashIcon,
} from 'lucide-react';
import { DocTable, SchemaCard, SectionTitle, StepNumber, SyncPointer, Tag } from '@/components/build/DesignParts';
import { Button } from '@/components/ui/button';
import { BUILD_PAGE_PATHS } from '@/utils/buildPages';
import { DESIGN_CREDIT } from '@/utils/buildDocs/designCredit';
import type { LeadText } from '@/utils/buildDocs/designCredit';

const D = DESIGN_CREDIT;

function Lead({ item }: { item: LeadText }) {
  return (
    <>
      {item.lead && <strong className="text-foreground">{item.lead}</strong>} {item.text}
    </>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>{children}</span>
    </li>
  );
}

/** Design 03 · ביטוח אשראי ואובליגו, in the style of Design 01/02: principle, alerts, the tab, calculation, schema, test data. */
export function DesignCreditDoc() {
  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <span className="text-xs font-semibold text-muted-foreground">Design · {D.date}</span>
        <div className="flex items-end gap-[13px]">
          <span className="text-[54px] leading-none font-extrabold tracking-[-0.03em] text-ink-2 tabular-nums">{D.number}</span>
          <h2 className="pb-1 text-[30px] leading-tight font-extrabold tracking-[-0.015em]">{D.title}</h2>
        </div>
        <p className="max-w-[560px] text-sm text-ink-2">{D.lead}</p>
        <div className="flex flex-wrap gap-1.5">
          <Tag className="bg-glass-strong text-ink-2">לשונית בכרטיס הלקוח</Tag>
          <Tag className="bg-glass-strong text-ink-2">2 התראות</Tag>
          <Tag className="bg-glass-strong text-ink-2">{D.schema.tables.length} טבלאות חדשות</Tag>
          <Tag className="bg-success-soft text-success-ink">קריאה בלבד</Tag>
        </div>
      </header>

      <SyncPointer text={D.sync} />

      <section aria-label={D.principle.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={1} title={D.principle.title} icon={ShieldCheckIcon} />
        <ul className="glass flex flex-col gap-2 rounded-[26px] border p-[21px] md:p-[34px]">
          {D.principle.points.map((p) => (
            <Bullet key={p.text}>
              {p.text} {p.lead && <strong className="text-foreground">{p.lead}</strong>}
            </Bullet>
          ))}
        </ul>
      </section>

      <section aria-label={D.alerts.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={2} title={D.alerts.title} icon={BellRingIcon} />
        <div className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px] md:p-[34px]">
          <p className="text-base text-ink-2">{D.alerts.intro}</p>
          <ul className="grid gap-[13px] md:grid-cols-2">
            {D.alerts.items.map((a) => (
              <li key={a.lead} className="glass-inner p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-4">
                <Lead item={a} />
              </li>
            ))}
          </ul>
          <p className="rounded-[18px] bg-glass-inner px-[13px] py-2.5 text-[13px] text-ink-2">{D.alerts.note}</p>
        </div>
      </section>

      <section aria-label={D.tab.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={3} title={D.tab.title} icon={LayoutPanelTopIcon} />
        <div className="glass flex flex-col gap-[13px] rounded-[26px] border p-[13px] md:p-[34px]">
          {D.tab.sections.map((s) => (
            <div key={s.n} className="glass-inner flex gap-[13px] p-[13px] md:p-4">
              <StepNumber n={s.n} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-[13px] leading-relaxed text-ink-2">
                  <strong className="text-foreground">{s.lead}</strong> {s.text}
                </p>
                {s.items && (
                  <ul className="flex flex-col gap-1">
                    {s.items.map((it) => (
                      <li key={it.text} className="flex items-start gap-1.5 rounded-[12px] bg-glass-card px-2.5 py-1.5 text-xs leading-relaxed text-ink-2">
                        <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-2/50" />
                        <span>
                          <Lead item={it} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          <p className="rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">{D.tab.openRequest}</p>
        </div>
      </section>

      <section aria-label={D.calc.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={4} title={D.calc.title} icon={CalculatorIcon} />
        <div className="glass overflow-x-auto rounded-[26px] border p-[13px] md:p-[21px]">
          <DocTable head={D.calc.head} rows={D.calc.rows} />
        </div>
      </section>

      <section aria-label={D.schema.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={5} title={D.schema.title} icon={DatabaseIcon} />
        <p className="glass max-w-[860px] rounded-[26px] border p-[21px] text-sm leading-relaxed text-ink-2">{D.schema.intro}</p>
        <div className="grid items-start gap-[13px] lg:grid-cols-2">
          {D.schema.tables.map((t) => (
            <SchemaCard key={t.name} table={t} />
          ))}
        </div>
      </section>

      <section aria-label={D.testData.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={6} title={D.testData.title} icon={FlaskConicalIcon} />
        <div className="glass overflow-x-auto rounded-[26px] border p-[13px] md:p-[21px]">
          <DocTable head={D.testData.head} rows={D.testData.rows} />
        </div>
      </section>

      <section aria-label={D.notNow.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={7} title={D.notNow.title} icon={SquareSlashIcon} />
        <div className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px] md:p-[34px]">
          <ul className="flex flex-col gap-1.5">
            {D.notNow.items.map((i) => (
              <Bullet key={i}>{i}</Bullet>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-[13px]">
            <p className="text-[13px] text-muted-foreground">{D.notNow.gapsNote}</p>
            <Button nativeButton={false} variant="ghost" size="sm" className="rounded-full bg-glass-soft" render={<Link to={BUILD_PAGE_PATHS.gaps} />}>
              לעמוד הפערים
              <ArrowUpLeftIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>
    </article>
  );
}