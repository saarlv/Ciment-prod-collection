import type { ComponentType } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArchiveIcon,
  BotIcon,
  CompassIcon,
  DatabaseIcon,
  FileTextIcon,
  GaugeIcon,
  GitBranchIcon,
  HandCoinsIcon,
  InboxIcon,
  LayersIcon,
  ListChecksIcon,
  LockIcon,
  MailIcon,
  MapIcon,
  RefreshCwIcon,
  RouteIcon,
  ScaleIcon,
  SquareUserIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/PageStates';
import { DesignAgingDoc } from '@/components/build/DesignAgingDoc';
import { DesignCreditDoc } from '@/components/build/DesignCreditDoc';
import { DesignDbDiagram } from '@/components/build/DesignDbDiagram';
import { DesignDbDoc } from '@/components/build/DesignDbDoc';
import { DesignFlowDiagram } from '@/components/build/DesignFlowDiagram';
import { Tag } from '@/components/build/DesignParts';
import { DesignPlanDoc } from '@/components/build/DesignPlanDoc';
import { DesignReceiptsDoc } from '@/components/build/DesignReceiptsDoc';
import { DesignSyncDoc } from '@/components/build/DesignSyncDoc';
import { DesignTextDoc } from '@/components/build/DesignTextDoc';
import { cn } from '@/lib/utils';
import { SHOW_BUILD_PAGES } from '@/utils/buildPages';
import { DESIGN_AGENTS } from '@/utils/buildDocs/designAgents';
import { FLOWS } from '@/utils/buildDocs/designFlows';
import { DESIGN_INBOX } from '@/utils/buildDocs/designInbox';
import { DESIGN_TASKS } from '@/utils/buildDocs/designTasks';
import type { FlowDocId } from '@/utils/buildDocs/designFlows';

/** The component docs (each with a diagram in FLOWS) plus the cross-component docs; of those only the DB doc has a diagram (the ER view). */
type CrossDocId = 'sync' | 'agents' | 'db' | 'plan';
type DocId = FlowDocId | CrossDocId;
const CROSS_DOCS: CrossDocId[] = ['sync', 'agents', 'db', 'plan'];

function isCrossDoc(id: DocId): id is CrossDocId {
  return (CROSS_DOCS as DocId[]).includes(id);
}
type View = 'doc' | 'diagram';

/** The full text of each design file (the "מסמך" view). A component's "דיאגרמה" view comes from FLOWS. */
const DOCS: Record<DocId, ComponentType> = {
  receipts: DesignReceiptsDoc,
  aging: DesignAgingDoc,
  credit: DesignCreditDoc,
  inbox: DesignInboxDoc,
  tasks: DesignTasksDoc,
  sync: DesignSyncDoc,
  agents: DesignAgentsDoc,
  db: DesignDbDoc,
  plan: DesignPlanDoc,
};

/** 04 · פניות: one icon per section of the source (12). */
function DesignInboxDoc() {
  return (
    <DesignTextDoc
      doc={DESIGN_INBOX}
      icons={[CompassIcon, InboxIcon, ListChecksIcon, WorkflowIcon, RouteIcon, FileTextIcon, MailIcon, ZapIcon, UsersIcon, GitBranchIcon, DatabaseIcon, SparklesIcon]}
    />
  );
}

/** 05 · משימות: one icon per section of the source (8). */
function DesignTasksDoc() {
  return (
    <DesignTextDoc
      doc={DESIGN_TASKS}
      icons={[CompassIcon, InboxIcon, GaugeIcon, ListChecksIcon, HandCoinsIcon, LayersIcon, SquareUserIcon, DatabaseIcon]}
    />
  );
}

/** סוכנים: one icon per section of the source (4). */
function DesignAgentsDoc() {
  return <DesignTextDoc doc={DESIGN_AGENTS} cross heroIcon={BotIcon} icons={[CompassIcon, BotIcon, ArchiveIcon, ScaleIcon]} />;
}

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'doc', label: 'מסמך', icon: FileTextIcon },
  { id: 'diagram', label: 'דיאגרמה', icon: WorkflowIcon },
];

function isDocId(v: string | null): v is DocId {
  return !!v && v in DOCS;
}

/** The glass segmented control switching a file between its full text and its diagram (block diagram, or the DB's ER diagram). */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="group" aria-label="תצוגה" className="flex gap-0.5 self-start rounded-[22px] bg-glass-soft p-1">
      {VIEWS.map((v) => {
        const on = v.id === view;
        return (
          <button
            key={v.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v.id)}
            className={cn(
              'inline-flex min-h-[34px] items-center gap-1.5 rounded-[17px] px-4 text-sm text-ink-2 outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring',
              on && 'bg-glass-strong font-semibold text-link shadow-glass-pill hover:bg-glass-strong',
            )}
          >
            <v.icon className="size-4" />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/** The design files, one per component, in the order they are written. Entries without `id` come later. */
const FILES: { id?: DocId; label: string; hint: string; cross?: boolean; icon?: LucideIcon }[] = [
  { id: 'receipts', label: '01 · תקבולים והתאמות', hint: 'ארכיטקטורה, זרימה וסכמה' },
  { id: 'aging', label: '02 · דוח גיול', hint: 'הערות, שכבת החשבוניות וסכמה' },
  { id: 'credit', label: '03 · ביטוח אשראי', hint: 'לשונית בכרטיס הלקוח, התראות וסכמה' },
  { id: 'inbox', label: '04 · פניות', hint: 'דואר נכנס ויוצא, מסלול לכל סוג, אוטומציות' },
  { id: 'tasks', label: '05 · משימות', hint: 'הבטחות, סטטוס חשבונית, ציון חומרה ומשימות' },
  { id: 'sync', label: 'סנכרון עם Priority', hint: 'אסטרטגיה אחת לכל האפליקציה', cross: true, icon: RefreshCwIcon },
  { id: 'agents', label: 'סוכנים', hint: 'ארבעת הסוכנים: מה מחליט סוכן ומה קוד', cross: true, icon: BotIcon },
  { id: 'db', label: 'נתונים (DB)', hint: 'כל הטבלאות והעמודות, לפי רכיב', cross: true, icon: DatabaseIcon },
  { label: 'UX-UI full app design', hint: 'בהמשך' },
  { id: 'plan', label: 'תוכנית', hint: 'התוכנית המלאה', cross: true, icon: MapIcon },
];

function DesignView() {
  const [params, setParams] = useSearchParams();
  const docParam = params.get('doc');
  const active: DocId = isDocId(docParam) ? docParam : 'receipts';
  const flowId: FlowDocId | null = isCrossDoc(active) ? null : active;
  const hasDiagram = !!flowId || active === 'db';
  const view: View = hasDiagram && params.get('view') === 'diagram' ? 'diagram' : 'doc';
  const Doc = DOCS[active];

  function update(next: { doc?: DocId; view?: View }) {
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        if (next.doc) q.set('doc', next.doc);
        if (next.view === 'diagram') q.set('view', 'diagram');
        if (next.view === 'doc') q.delete('view');
        return q;
      },
      { replace: true },
    );
  }
  return (
    <>
      <PageHeader title="Design" description="שלב בנייה · קובץ ה-Design של כל רכיב, אחד אחרי השני. לצדם המסמכים החוצים: סנכרון, סוכנים, נתונים ותוכנית." />
      <div className="flex flex-col items-stretch gap-[21px] lg:flex-row lg:items-start">
        <nav aria-label="קובצי Design" className="glass flex flex-row gap-1 overflow-x-auto rounded-[26px] border p-1.5 lg:sticky lg:top-[90px] lg:w-60 lg:shrink-0 lg:flex-col">
          {FILES.map((f) => {
            const on = !!f.id && f.id === active;
            const Icon = f.icon ?? FileTextIcon;
            return f.id ? (
              <button
                key={f.label}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => f.id && update({ doc: f.id })}
                className={cn(
                  'flex min-w-48 items-start gap-2.5 rounded-[20px] px-[13px] py-2.5 text-start outline-none hover:bg-glass-inner focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0',
                  on && 'bg-glass-strong shadow-glass-pill hover:bg-glass-strong',
                )}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', on ? 'text-link' : 'text-muted-foreground')} />
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className={cn('text-[13px] font-semibold', on ? 'text-link' : 'text-ink-2')}>{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                  {f.cross && <Tag className="bg-primary/12 text-link">חוצה רכיבים</Tag>}
                </span>
              </button>
            ) : (
              <div key={f.label} aria-disabled className="flex min-w-48 cursor-not-allowed items-start gap-2.5 rounded-[20px] px-[13px] py-2.5 opacity-60 lg:min-w-0">
                <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span dir="ltr" className="text-start text-[13px] font-semibold text-muted-foreground">
                    {f.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{f.hint}</span>
                </span>
              </div>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-[21px]">
          {hasDiagram && <ViewSwitch view={view} onChange={(v) => update({ view: v })} />}
          {view === 'diagram' && flowId ? (
            <DesignFlowDiagram key={flowId} blocks={FLOWS[flowId]} />
          ) : view === 'diagram' && active === 'db' ? (
            <DesignDbDiagram />
          ) : (
            <Doc />
          )}
        </div>
      </div>
    </>
  );
}

/** /collections/design — build stage only (SHOW_BUILD_PAGES): the design file of each component, one at a time. */
export default function DesignPage() {
  if (!SHOW_BUILD_PAGES) return <Navigate to="/collections" replace />;
  return <DesignView />;
}