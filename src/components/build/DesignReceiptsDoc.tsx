import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeftIcon,
  ArrowUpLeftIcon,
  BadgeCheckIcon,
  Code2Icon,
  CloudDownloadIcon,
  DatabaseIcon,
  FileTextIcon,
  LandmarkIcon,
  MessageCircleQuestionIcon,
  ReceiptIcon,
  ScanTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SplitIcon,
  UserCheckIcon,
  UserIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AgentAvatar } from '@/components/AgentPanel';
import { useCollectionsAgent } from '@/hooks/useCollectionsAgent';
import { Connector, Edge, SchemaCard, SectionTitle, StepNumber, SyncPointer, TableNode, Tag } from '@/components/build/DesignParts';
import { Button } from '@/components/ui/button';
import { BUILD_PAGE_PATHS } from '@/utils/buildPages';
import { DESIGN_RECEIPTS } from '@/utils/buildDocs/designReceipts';
import type { FlowStep, Relation } from '@/utils/buildDocs/designReceipts';

const D = DESIGN_RECEIPTS;

/* ---------- Flow diagram parts ---------- */

const ACTOR: Record<NonNullable<FlowStep['actor']>, { label: string; icon: LucideIcon; tone: string }> = {
  user: { label: 'משתמש', icon: UserIcon, tone: 'bg-success-soft text-success-ink' },
  agent: { label: 'נינה', icon: SparklesIcon, tone: 'bg-glass-strong text-ink-2' },
  code: { label: 'קוד קבוע', icon: Code2Icon, tone: 'bg-glass-inner text-muted-foreground' },
};

function FlowBox({ step }: { step: FlowStep }) {
  const actor = step.actor ? ACTOR[step.actor] : null;
  return (
    <div className="glass-inner flex gap-[13px] p-[13px] md:p-4">
      <StepNumber n={step.n} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold">{step.title}</h4>
          {actor && (
            <Tag className={actor.tone}>
              <actor.icon className="size-3" />
              {actor.label}
            </Tag>
          )}
        </div>
        {step.text && <p className="text-[13px] leading-relaxed text-ink-2">{step.text}</p>}
        {step.bullets && (
          <ul className="flex flex-wrap gap-1.5 pt-0.5">
            {step.bullets.map((b) => (
              <li key={b} className="rounded-[12px] bg-glass-card px-2.5 py-1 text-xs text-ink-2">
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Section 3: the eight blocks of the one flow, top to bottom, then where it is seen. */
function FlowDiagram() {
  const f = D.flow;
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col">
      {f.steps.map((s, i) => (
        <Fragment key={s.n}>
          {i > 0 && <Connector />}
          <FlowBox step={s} />
        </Fragment>
      ))}
      <p className="mt-[13px] rounded-[18px] border-s-4 border-primary bg-primary/[0.06] px-[13px] py-2.5 text-[13px] leading-relaxed text-ink-2">
        <strong className="text-foreground">{f.whereSeen.lead}</strong> {f.whereSeen.text}
      </p>
    </div>
  );
}

/* ---------- Schema parts ---------- */

function RelationsDiagram({ relations }: { relations: Relation[] }) {
  const via = (from: string, to: string) => relations.find((r) => r.from === from && r.to === to)?.via ?? '';
  return (
    <section aria-label="הקשרים בין הטבלאות" className="glass-inner flex flex-col gap-[13px] p-[13px] md:p-[21px]">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <WorkflowIcon className="size-4 text-muted-foreground" />
        הקשרים בין הטבלאות
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <TableNode name="ImportBatches" />
        <Edge via={via('ImportBatches', 'BankLines')} />
        <TableNode name="BankLines" />
        <Edge via={via('BankLines', 'MatchProposals')} />
        <TableNode name="MatchProposals" />
        <Edge via={via('MatchProposals', 'Customers')} />
        <TableNode name="Customers" />
      </div>
      <div className="flex flex-wrap items-center gap-x-[34px] gap-y-2">
        {(['BankAliases', 'InboundEmails'] as const).map((from) => (
          <span key={from} className="flex items-center gap-1.5">
            <TableNode name={from} />
            <Edge via={via(from, 'Customers')} />
            <TableNode name="Customers" />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TableNode name="BankLines" />
        <Edge via={via('BankLines', 'Receipts')} />
        <TableNode name="Receipts" />
        <Edge via={via('Receipts', 'ReceiptAllocations')} />
        <TableNode name="ReceiptAllocations" />
        <Edge via={via('ReceiptAllocations', 'Invoices')} />
        <TableNode name="Invoices" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TableNode name="ReceiptCheckSteps" />
        <span className="text-xs text-muted-foreground">/</span>
        <TableNode name="AgentFeedback" />
        <Edge via={via('ReceiptCheckSteps', 'BankLines')} />
        <TableNode name="BankLines" />
      </div>
      <p className="text-xs text-muted-foreground">החיצים הם קודים בטקסט: כל טבלה שומרת את הקוד של הטבלה שהיא מצביעה עליה.</p>
    </section>
  );
}

/* ---------- The document ---------- */

/**
 * Design 01 · תקבולים והתאמות, styled for the app: a hero with what was corrected from Saar's original, how the work
 * is done today (with the "אבי ובניו → גולף" pull-quote), Nina, the file reader and the user's final say, the short
 * history of the old ladder, the sections of the one flow, the flow's eight blocks, the schema cards with their
 * relationships, the two schema notes, and a pointer to the gaps page.
 */
/** Section 2א: receipt first (03.11) — kept only as a short history; its ladder was replaced and deleted. */
function ReceiptFirstSection() {
  const R = D.receiptFirst;
  return (
    <section aria-label={R.title} className="flex flex-col gap-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle n="2א" title={R.title} icon={ReceiptIcon} />
        <Tag className="bg-glass-inner text-muted-foreground">{R.badge}</Tag>
      </div>
      <p className="glass-inner max-w-[860px] p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-[21px]">{R.text}</p>
    </section>
  );
}

/** Section 2ב: the bank lines come from Priority (r3 stage 2) — the pull, dedupe, the line-type filter, the schedule and the screen. */
function BankLinesSection() {
  const B = D.bankLines;
  const pointLine = (p: { lead: string; text: string }) => (
    <li key={p.text} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>
        {p.lead && <strong className="text-foreground">{p.lead} </strong>}
        {p.text}
      </span>
    </li>
  );
  return (
    <section aria-label={B.title} className="flex flex-col gap-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle n="2ב" title={B.title} icon={CloudDownloadIcon} />
        <Tag className="bg-success-soft text-success-ink">{B.badge}</Tag>
      </div>
      <div className="glass flex flex-col gap-[21px] rounded-[26px] border p-[21px] md:p-[34px]">
        <p className="max-w-[760px] text-base leading-relaxed text-ink-2">
          <span className="font-bold text-foreground">{B.why.lead} </span>
          {B.why.text}
        </p>
        <div className="grid gap-[13px] lg:grid-cols-2">
          <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
            <span className="text-sm font-bold">{B.pull.lead}</span>
            <ul className="flex flex-col gap-1.5">{B.pull.items.map(pointLine)}</ul>
          </div>
          <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
            <span className="text-sm font-bold">{B.filter.lead}</span>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {B.filter.head.map((h) => (
                    <th key={h} className="pb-1.5 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {B.filter.rows.map((r) => (
                  <tr key={r.type} className="border-t border-ink-2/10">
                    <td className="py-1.5 pe-3 align-top whitespace-nowrap">
                      <Tag className={r.checked ? 'bg-success-soft text-success-ink' : 'bg-glass-strong text-muted-foreground'}>{r.type}</Tag>
                    </td>
                    <td className="py-1.5 align-top leading-relaxed text-ink-2">{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="text-xs text-muted-foreground">{B.filter.legacy}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-[22px] border-s-4 border-primary bg-primary/[0.06] p-[21px]">
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="text-sm font-bold text-foreground">{B.schedule.lead} </span>
            {B.schedule.text}
          </p>
          <ul className="flex flex-col gap-1.5">{B.schedule.items.map(pointLine)}</ul>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">
            <span className="text-sm font-bold text-foreground">{B.screen.lead} </span>
            {B.screen.text}
          </p>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {B.screen.items.map((t) => (
              <li key={t} className="rounded-[12px] bg-glass-card px-2.5 py-1.5 text-xs leading-relaxed text-ink-2">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="glass-inner flex items-start gap-2.5 p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-4">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-bold text-foreground">{B.verified.lead}</span> {B.verified.text}
          </span>
        </p>
      </div>
    </section>
  );
}

function IdentifyReceiptSection() {
  const R = D.identifyReceipt;
  const pointLine = (p: { lead: string; text: string }) => (
    <li key={p.lead} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>
        <strong className="text-foreground">{p.lead} </strong>
        {p.text}
      </span>
    </li>
  );
  const twoCol = (head: string[], rows: [string, string][]) => (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-xs text-muted-foreground">
          {head.map((h) => (
            <th key={h} className="pb-1.5 text-start font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b]) => (
          <tr key={a} className="border-t border-ink-2/10">
            <td className="py-1.5 pe-3 align-top leading-relaxed font-semibold text-ink-2">{a}</td>
            <td className="py-1.5 align-top leading-relaxed text-ink-2 tabular-nums">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <section aria-label={R.title} className="flex flex-col gap-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle n="2ג" title={R.title} icon={UserCheckIcon} />
        <Tag className="bg-success-soft text-success-ink">{R.badge}</Tag>
      </div>
      <div className="glass flex flex-col gap-[21px] rounded-[26px] border p-[21px] md:p-[34px]">
        <p className="max-w-[760px] text-base leading-relaxed text-ink-2">
          <span className="font-bold text-foreground">{R.why.lead} </span>
          {R.why.text}
        </p>
        <div className="grid gap-[13px] lg:grid-cols-2">
          <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
            <span className="text-sm font-bold">{R.source.lead}</span>
            {twoCol(R.source.head, R.source.rows.map((r) => [r.value, r.what]))}
            <span className="text-xs text-muted-foreground">{R.source.note}</span>
          </div>
          <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
            <span className="text-sm font-bold">{R.confidence.lead}</span>
            <span className="text-[13px] text-ink-2">{R.confidence.text}</span>
            {twoCol(R.confidence.head, R.confidence.rows.map((r) => [r.rung, r.score]))}
          </div>
        </div>
        <ul className="flex flex-col gap-1.5">{R.confidence.points.map(pointLine)}</ul>
        <div className="flex flex-col gap-2 rounded-[22px] border-s-4 border-primary bg-primary/[0.06] p-[21px]">
          <span className="text-sm font-bold text-foreground">{R.issue.lead}</span>
          <ul className="flex flex-col gap-1.5">{R.issue.points.map(pointLine)}</ul>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="text-sm font-bold text-foreground">{R.screen.lead} </span>
          {R.screen.text}
        </p>
        <p className="glass-inner flex items-start gap-2.5 p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-4">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-bold text-foreground">{R.record.lead}</span> {R.record.text}
          </span>
        </p>
      </div>
    </section>
  );
}

function DebtAllocationSection() {
  const A = D.debtAllocation;
  const pointLine = (p: { lead: string; text: string }) => (
    <li key={p.lead || p.text} className="flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-2">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-link" />
      <span>
        {p.lead && <strong className="text-foreground">{p.lead} </strong>}
        {p.text}
      </span>
    </li>
  );
  return (
    <section aria-label={A.title} className="flex flex-col gap-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle n="2ד" title={A.title} icon={SplitIcon} />
        <Tag className="bg-success-soft text-success-ink">{A.badge}</Tag>
      </div>
      <div className="glass flex flex-col gap-[21px] rounded-[26px] border p-[21px] md:p-[34px]">
        <p className="max-w-[760px] text-base leading-relaxed text-ink-2">
          <span className="font-bold text-foreground">{A.change.lead} </span>
          {A.change.text}
        </p>
        <div className="glass-inner flex flex-col gap-2 p-[13px] md:p-[21px]">
          <span className="text-[13px] text-ink-2">
            <strong className="text-sm text-foreground">{A.debtCheck.lead} </strong>
            {A.debtCheck.text}
          </span>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {A.debtCheck.head.map((h) => (
                    <th key={h} className="pb-1.5 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {A.debtCheck.rows.map((r) => (
                  <tr key={r.result} className="border-t border-ink-2/10">
                    <td className="py-1.5 pe-3 align-top leading-relaxed text-ink-2">{r.found}</td>
                    <td className="py-1.5 pe-3 align-top leading-relaxed font-semibold text-ink-2">{r.result}</td>
                    <td className="py-1.5 align-top leading-relaxed text-ink-2">{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-1.5">{A.debtCheck.points.map(pointLine)}</ul>
        </div>
        <div className="flex flex-col gap-2 rounded-[22px] border-s-4 border-primary bg-primary/[0.06] p-[21px]">
          <span className="text-sm font-bold text-foreground">{A.allocation.lead}</span>
          <ul className="flex flex-col gap-1.5">{A.allocation.points.map(pointLine)}</ul>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="text-sm font-bold text-foreground">{A.agentCheques.lead} </span>
          {A.agentCheques.text}
        </p>
        <p className="glass-inner flex items-start gap-2.5 p-[13px] text-[13px] leading-relaxed text-ink-2 md:p-4">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-bold text-foreground">{A.thresholds.lead}</span> {A.thresholds.text}
          </span>
        </p>
      </div>
    </section>
  );
}

export function DesignReceiptsDoc() {
  const nina = useCollectionsAgent();
  const pointIcons: LucideIcon[] = [LandmarkIcon, SearchIcon, FileTextIcon];
  const tableCount = D.schema.tables.reduce((n, t) => n + (t.rows?.length ?? 1), 0);

  return (
    <article className="flex flex-col gap-[34px]">
      <header className="glass-hero flex flex-wrap items-stretch gap-[21px] rounded-[30px] p-[21px] md:p-[34px]">
        <div className="flex min-w-[min(100%,360px)] flex-[1.618_1_0px] flex-col gap-[13px]">
          <span className="text-xs font-semibold text-muted-foreground">
            Design · מקור: {D.source} · {D.date}
          </span>
          <div className="flex items-end gap-[13px]">
            <span className="text-[54px] leading-none font-extrabold tracking-[-0.03em] text-ink-2 tabular-nums">{D.number}</span>
            <h2 className="pb-1 text-[30px] leading-tight font-extrabold tracking-[-0.015em]">{D.title}</h2>
          </div>
          <p className="max-w-[560px] text-sm text-ink-2">{D.lead}</p>
          <div className="flex flex-wrap gap-1.5">
            <Tag className="bg-glass-strong text-ink-2">סוכנת + קריאת LLM אחת</Tag>
            <Tag className="bg-glass-strong text-ink-2">{D.flow.steps.length} שלבים</Tag>
            <Tag className="bg-glass-strong text-ink-2">{tableCount} טבלאות</Tag>
            <Tag className="bg-success-soft text-success-ink">זיהוי → קבלה → בדיקת חוב → פיזור</Tag>
          </div>
        </div>
        <aside aria-label="מה דייקנו מהמקור" className="glass-inner flex min-w-[min(100%,280px)] flex-[1_1_0px] flex-col gap-2 p-[13px] md:p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold">
            <BadgeCheckIcon className="size-4 text-link" />
            מה דייקנו מהמקור
          </h2>
          <ul className="flex flex-col gap-1">
            {D.corrections.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-link" />
                {c}
              </li>
            ))}
          </ul>
        </aside>
      </header>

      <SyncPointer text={D.sync} />

      <section aria-label={D.today.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={1} title={D.today.title} icon={LandmarkIcon} />
        <div className="glass flex flex-col gap-[21px] rounded-[26px] border p-[21px] md:p-[34px]">
          <p className="max-w-[760px] text-base leading-relaxed text-ink-2">{D.today.lead}</p>
          <ul className="grid gap-[13px] md:grid-cols-3">
            {D.today.points.map((p, i) => {
              const Icon = pointIcons[i] ?? SearchIcon;
              return (
                <li key={p.lead} className="glass-inner flex flex-col gap-1.5 p-[13px] md:p-4">
                  <Icon className="size-5 text-muted-foreground" />
                  <span className="text-sm font-bold">{p.lead}</span>
                  <span className="text-[13px] leading-relaxed text-ink-2">{p.text}</span>
                </li>
              );
            })}
          </ul>
          <figure className="flex flex-col gap-[13px] rounded-[22px] border-s-4 border-primary bg-primary/[0.06] p-[21px]">
            <blockquote className="text-lg leading-snug font-bold">{D.today.example.text}</blockquote>
            <figcaption className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] text-muted-foreground">בבנק</span>
                <span className="rounded-full bg-glass-strong px-3 py-1 font-bold shadow-glass-pill">{D.today.example.payer}</span>
              </span>
              <ArrowLeftIcon className="mt-3 size-5 text-link" />
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-[11px] text-muted-foreground">בכרטיס הלקוח</span>
                <span className="rounded-full bg-primary px-3 py-1 font-bold text-primary-foreground">{D.today.example.customer}</span>
              </span>
              <span className="ms-2 text-xs text-muted-foreground">השם בבנק לא תמיד זהה לשם בכרטיס הלקוח.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-label={D.system.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={2} title={D.system.title} icon={SparklesIcon} />
        <p className="text-sm text-muted-foreground">{D.system.lead}</p>
        <div className="grid gap-[13px] md:grid-cols-2 xl:grid-cols-4">
          <div className="glass flex flex-col gap-2 rounded-[26px] border p-[21px]">
            <span className="flex size-11 items-center justify-center rounded-full bg-glass-inner">
              <ScanTextIcon className="size-5 text-ink-2" />
            </span>
            <span className="text-base font-bold">{D.system.reader.name}</span>
            <span className="flex flex-wrap gap-1.5">
              <Tag className="bg-glass-inner text-ink-2">{D.system.reader.mode}</Tag>
              <Tag className="bg-glass-inner text-muted-foreground">{D.system.reader.handle}</Tag>
            </span>
            <p className="text-[13px] leading-relaxed text-ink-2">{D.system.reader.text}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-[26px] border border-dashed border-ink-2/25 bg-glass-faint p-[21px]">
            <span className="text-base font-bold text-muted-foreground">{D.system.remittanceReader.name}</span>
            <Tag className="self-start bg-warning-soft text-warning-ink">{D.system.remittanceReader.removed}</Tag>
            <p className="text-[13px] leading-relaxed text-ink-2">{D.system.remittanceReader.text}</p>
          </div>
          <div className="glass flex flex-col gap-2 rounded-[26px] border p-[21px]">
            <AgentAvatar agent="nina" size="lg" />
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-bold">{nina.name}</span>
              <span className="text-xs text-muted-foreground">{nina.jobTitle}</span>
            </span>
            <p className="text-[13px] leading-relaxed text-ink-2">{D.system.nina.text}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-[26px] bg-glass-strong p-[21px] shadow-glass-card ring-2 ring-primary/25">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/12">
              <UserCheckIcon className="size-5 text-link" />
            </span>
            <span className="text-base font-bold">ההחלטה תמיד של המשתמש</span>
            <p className="text-[13px] leading-relaxed text-ink-2">{D.system.decision}</p>
          </div>
        </div>
        <div className="glass-inner flex items-start gap-2.5 p-[13px] md:p-4">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-relaxed text-ink-2">{D.system.principle}</p>
        </div>
      </section>

      <ReceiptFirstSection />

      <BankLinesSection />

      <IdentifyReceiptSection />

      <DebtAllocationSection />

      <section aria-label={D.flow.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={3} title={D.flow.title} icon={WorkflowIcon} />
        <div className="glass rounded-[26px] border p-[13px] md:p-[34px]">
          <FlowDiagram />
        </div>
      </section>

      <section aria-label={D.schema.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={4} title={D.schema.title} icon={DatabaseIcon} />
        <p className="max-w-[760px] text-sm text-muted-foreground">{D.schema.lead}</p>
        <RelationsDiagram relations={D.schema.relations} />
        <div className="grid items-start gap-[13px] lg:grid-cols-2">
          {D.schema.tables.map((t) => (
            <SchemaCard key={t.name} table={t} />
          ))}
        </div>
      </section>

      <section aria-label={D.notes.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={5} title={D.notes.title} icon={MessageCircleQuestionIcon} />
        <div className="grid gap-[13px] md:grid-cols-2">
          {D.notes.items.map((n) => (
            <div key={n.lead} className="glass flex flex-col gap-1.5 rounded-[26px] border p-[21px]">
              <span className="text-base font-bold">{n.lead}</span>
              <p className="text-[13px] leading-relaxed text-ink-2">{n.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={D.missing.title} className="flex flex-col gap-[13px]">
        <SectionTitle n={6} title={D.missing.title} icon={SearchIcon} />
        <div className="glass flex flex-wrap items-center justify-between gap-[13px] rounded-[26px] border p-[21px]">
          <p className="max-w-[640px] text-sm leading-relaxed text-ink-2">{D.missing.text}</p>
          <Button nativeButton={false} variant="outline" className="rounded-full" render={<Link to={BUILD_PAGE_PATHS.gaps} />}>
            לעמוד פערים
            <ArrowUpLeftIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>
    </article>
  );
}