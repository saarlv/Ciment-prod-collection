import { useState } from 'react';
import { Navigate } from 'react-router';
import {
  ArchiveIcon,
  ClipboardCopyIcon,
  ConstructionIcon,
  ContactRoundIcon,
  DatabaseIcon,
  FactoryIcon,
  HammerIcon,
  HandshakeIcon,
  MessagesSquareIcon,
  RefreshCwIcon,
  UserRoundCogIcon,
  UsersRoundIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageStates';
import { RichText } from '@/components/build/DesignParts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { SHOW_BUILD_PAGES } from '@/utils/buildPages';
import { GAPS_AGING } from '@/utils/buildDocs/gapsAging';
import { GAPS_ARCHIVE } from '@/utils/buildDocs/gapsArchive';
import type { ArchivedTab } from '@/utils/buildDocs/gapsArchive';
import { GAPS_CREDIT } from '@/utils/buildDocs/gapsCredit';
import { GAPS_INBOX } from '@/utils/buildDocs/gapsInbox';
import { GAPS_SYNC } from '@/utils/buildDocs/gapsSync';
import { GAPS_TASKS } from '@/utils/buildDocs/gapsTasks';
import { GAPS_RECEIPTS, countByGroup, gapsAsMarkdown } from '@/utils/buildDocs/gapsReceipts';
import type { GapGroup, GapGroupKey, GapsDoc } from '@/utils/buildDocs/gapsReceipts';

/** Who closes each group: an icon and a one-line hint. */
const GROUP_META: Record<GapGroupKey, { icon: LucideIcon; hint: string }> = {
  yaniv: { icon: HandshakeIcon, hint: 'החלטות וידע שחסר, לסגור בשיחה' },
  navitGila: { icon: DatabaseIcon, hint: 'מסכים, נתונים ומקורות בפריוריטי' },
  navit: { icon: ContactRoundIcon, hint: 'שדות והגדרות בפריוריטי' },
  saar: { icon: UserRoundCogIcon, hint: 'החלטות בנייה ומיזוג, לסגור עם סער' },
  production: { icon: FactoryIcon, hint: 'מה שנחוץ לפרודקשן: נתונים, חיבורים ושליחה' },
  placeholder: { icon: ConstructionIcon, hint: 'מוצג במסך כ"יופעל בשלב הבא", הלוגיקה בשלב הבא' },
  internal: { icon: UsersRoundIcon, hint: 'מה שאנחנו מחליטים בעצמנו' },
  separate: { icon: MessagesSquareIcon, hint: 'נושאים לשיחה ייעודית, ועד אז בטיפול ידני' },
};

function GroupCard({ group }: { group: GapGroup }) {
  const meta = GROUP_META[group.key];
  const sections = group.sections ?? [];
  const count = group.items.length + sections.reduce((n, s) => n + s.items.length, 0);
  return (
    <section aria-label={group.title} className="glass flex flex-col gap-[13px] rounded-[26px] border p-[21px]">
      <div className="flex flex-wrap items-center gap-[13px]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-strong text-link shadow-glass-pill">
          <meta.icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-base font-bold">{group.title}</h2>
          <span className="text-xs text-muted-foreground">{meta.hint}</span>
        </div>
        <span className="text-[13px] text-muted-foreground tabular-nums">{count} פערים</span>
      </div>
      {count === 0 && <p className="rounded-[18px] bg-glass-card px-[13px] py-2.5 text-sm text-muted-foreground">אין כרגע</p>}
      <ol className={cn('flex flex-col gap-1.5', group.items.length === 0 && 'hidden')}>
        {group.items.map((item, i) => (
          <li key={item} className="flex items-start gap-[13px] rounded-[18px] bg-glass-card px-[13px] py-2.5">
            <span className="w-5 shrink-0 pt-px text-[13px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm leading-relaxed text-ink-2">
                <RichText text={item} />
              </span>
              {(group.subs?.[i + 1] ?? []).map((sub) => (
                <span key={sub} className="border-s-2 border-primary/25 ps-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  <RichText text={sub} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {sections.map((s) => (
        <div key={s.title} className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[13px] font-bold text-ink-2">{s.title}</h3>
          <ol className="flex flex-col gap-1.5">
            {s.items.map((item, i) => (
              <li key={item} className="flex items-start gap-[13px] rounded-[18px] bg-glass-card px-[13px] py-2.5">
                <span className="w-5 shrink-0 pt-px text-[13px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="text-sm leading-relaxed text-ink-2">
                  <RichText text={item} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function GapsTab({ doc }: { doc: GapsDoc }) {
  const counts = countByGroup(doc);
  const total = counts.reduce((n, c) => n + c.count, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(gapsAsMarkdown(doc));
      toast.add({ title: 'הרשימה הועתקה', description: 'אפשר להדביק אותה ליניב כמו שהיא.', type: 'success' });
    } catch {
      toast.add({ title: 'ההעתקה לא הצליחה', description: 'הדפדפן לא איפשר גישה ללוח. נסו שוב.', type: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-[21px]">
      <section aria-label="סיכום הפערים" className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <div className="flex flex-wrap items-start justify-between gap-[13px]">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">נכון ל-{doc.asOf}</span>
            <h2 className="text-[22px] leading-tight font-bold">{doc.title}</h2>
            <p className="max-w-[640px] text-sm text-ink-2">הרשימה המלאה, לפי מי סוגר כל פער.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-[44px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">{total}</span>
            <span className="text-[13px] text-muted-foreground">פערים פתוחים</span>
          </div>
        </div>
        <ul aria-label="ספירה לפי מי סוגר" className="flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <li key={c.key} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-glass-strong px-2.5 text-xs font-semibold text-ink-2">
              {c.title}
              <span className="tabular-nums">· {c.count}</span>
            </li>
          ))}
        </ul>
        <Button className="self-start rounded-full px-[18px] font-bold shadow-primary" onClick={copy}>
          <ClipboardCopyIcon data-icon="inline-start" />
          העתקה כרשימה
        </Button>
      </section>

      {doc.groups.map((g) => (
        <GroupCard key={g.key} group={g} />
      ))}
    </div>
  );
}

function ArchivedSection({ tab }: { tab: ArchivedTab }) {
  const count = tab.groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <AccordionItem value={tab.source} className="glass rounded-[26px] border px-[21px]">
      <AccordionTrigger className="gap-[13px] py-[18px] hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="text-base font-bold">{tab.component}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {tab.title} · נכון ל-{tab.asOf}
          </span>
        </span>
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{count} פערים</span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-[13px] pb-[21px]">
        <p dir="ltr" className="rounded-[16px] bg-glass-card px-[13px] py-2 text-start text-xs leading-relaxed text-muted-foreground">
          {tab.note}
        </p>
        {tab.groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-[13px] font-bold text-ink-2">{g.title}</h3>
            {g.items.length === 0 ? (
              <p className="rounded-[18px] bg-glass-card px-[13px] py-2.5 text-sm text-muted-foreground">(אין כרגע)</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {g.items.map((item, i) => (
                  <li key={item.text} className="flex items-start gap-[13px] rounded-[18px] bg-glass-card px-[13px] py-2.5">
                    <span className="w-5 shrink-0 pt-px text-[13px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm leading-relaxed text-ink-2">
                        <RichText text={item.text} />
                      </span>
                      {(item.subs ?? []).map((sub) => (
                        <span key={sub} className="border-s-2 border-primary/25 ps-2.5 text-[13px] leading-relaxed text-muted-foreground">
                          <RichText text={sub} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

/** The old text of every tab as it stood before the 05.11 reset: read-only, one collapsible section per old tab. */
function ArchiveTab() {
  const total = GAPS_ARCHIVE.tabs.reduce((n, t) => n + t.groups.reduce((m, g) => m + g.items.length, 0), 0);
  return (
    <div className="flex flex-col gap-[21px]">
      <section aria-label="על הארכיון" className="glass-hero flex flex-col gap-[13px] rounded-[30px] p-[21px] md:p-[34px]">
        <div className="flex flex-wrap items-start justify-between gap-[13px]">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">אופס ב-{GAPS_ARCHIVE.resetOn}</span>
            <h2 className="text-[22px] leading-tight font-bold">{GAPS_ARCHIVE.title}</h2>
            <p className="max-w-[640px] text-sm text-ink-2">כל הרשימות הישנות, מילה במילה, לפי הלשונית שבה היו. לקריאה בלבד.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-[44px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">{total}</span>
            <span className="text-[13px] text-muted-foreground">פריטים בארכיון</span>
          </div>
        </div>
        <p dir="ltr" className="max-w-[640px] text-start text-xs leading-relaxed text-muted-foreground">
          {GAPS_ARCHIVE.note}
        </p>
      </section>
      <Accordion multiple className="flex flex-col gap-[13px] overflow-visible rounded-none border-none">
        {GAPS_ARCHIVE.tabs.map((t) => (
          <ArchivedSection key={t.source} tab={t} />
        ))}
      </Accordion>
    </div>
  );
}

function GapsView() {
  const [tab, setTab] = useState('receipts');
  return (
    <>
      <PageHeader title="פערים" description="שלב בנייה · לפי רכיב, ובתוך כל רכיב לפי מי סוגר. הרשימות אופסו ב-05.11, והישנות שמורות בלשונית ארכיון." />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <div className="flex flex-wrap items-center gap-[13px]">
          <TabsList className="h-auto gap-0.5 rounded-[22px] bg-glass-soft p-1 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="receipts" className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              {GAPS_RECEIPTS.component}
            </TabsTrigger>
            <TabsTrigger value="aging" className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              {GAPS_AGING.component}
            </TabsTrigger>
            <TabsTrigger value="credit" className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              {GAPS_CREDIT.component}
            </TabsTrigger>
            <TabsTrigger value="inbox" className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              {GAPS_INBOX.component}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="min-h-[34px] flex-none rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              {GAPS_TASKS.component}
            </TabsTrigger>
            <TabsTrigger value="sync" className="min-h-[34px] flex-none gap-1.5 rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              <RefreshCwIcon />
              {GAPS_SYNC.component}
            </TabsTrigger>
            <TabsTrigger value="archive" className="min-h-[34px] flex-none gap-1.5 rounded-[17px] px-4 text-ink-2 data-active:font-semibold">
              <ArchiveIcon />
              ארכיון
            </TabsTrigger>
          </TabsList>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <HammerIcon className="size-3.5" />
            רכיב חדש יקבל כאן לשונית משלו
          </span>
        </div>
        <TabsContent value="receipts" className="pt-[13px]">
          <GapsTab doc={GAPS_RECEIPTS} />
        </TabsContent>
        <TabsContent value="aging" className="pt-[13px]">
          <GapsTab doc={GAPS_AGING} />
        </TabsContent>
        <TabsContent value="credit" className="pt-[13px]">
          <GapsTab doc={GAPS_CREDIT} />
        </TabsContent>
        <TabsContent value="inbox" className="pt-[13px]">
          <GapsTab doc={GAPS_INBOX} />
        </TabsContent>
        <TabsContent value="tasks" className="pt-[13px]">
          <GapsTab doc={GAPS_TASKS} />
        </TabsContent>
        <TabsContent value="sync" className="pt-[13px]">
          <GapsTab doc={GAPS_SYNC} />
        </TabsContent>
        <TabsContent value="archive" className="pt-[13px]">
          <ArchiveTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** /collections/gaps — build stage only (SHOW_BUILD_PAGES): the full gaps list per component, grouped by who closes each. */
export default function GapsPage() {
  if (!SHOW_BUILD_PAGES) return <Navigate to="/collections" replace />;
  return <GapsView />;
}