import { useState } from 'react';
import { Link } from 'react-router';
import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { ArrowRightIcon } from 'lucide-react';
import { AgentBriefingsEntity } from '@/product-types';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/ui/markdown';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime, formatDayLabel, formatNumber } from '@/utils/Format';

type Briefing = EntityType<typeof AgentBriefingsEntity>;
type Counts = NonNullable<Briefing['counts']>;

const ALL = '__all__';
const PAGE = 30;
const COUNT_LABELS: [keyof Counts, string][] = [
  ['bankLines', 'שורות בנק'],
  ['certainMatches', 'ודאיות'],
  ['toReview', 'לבדיקה'],
  ['unidentified', 'לא מזוהות'],
  ['bouncedChecks', 'צ׳קים חוזרים'],
  ['promisesSeen', 'הבטחות שנראו'],
  ['promisesKept', 'נקיימו'],
  ['promisesPartial', 'נקיימו חלקית'],
  ['promisesBroken', 'הופרו'],
  ['openTasks', 'משימות פתוחות'],
];
const ORDER = [
  { column: 'briefingDate', direction: 'desc' as const },
  { column: 'briefingCreatedAt', direction: 'desc' as const },
];

function BriefingCard({ b }: { b: Briefing }) {
  const counts = b.counts ?? {};
  const stats = COUNT_LABELS.filter(([k]) => typeof counts[k] === 'number');
  return (
    <Card className="glass border">
      <CardHeader>
        <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-ink-2">{formatDayLabel(b.briefingDate)}</span>
          <StatusBadge value={b.audience || 'כולם'} tone={b.audience && b.audience !== 'כולם' ? 'info' : 'active'} />
          {b.isTestFixture && <StatusBadge value="נתוני בדיקה" tone="neutral" />}
          <span>נכתב {formatDateTime(b.briefingCreatedAt)}</span>
        </CardDescription>
        <CardTitle className="text-lg leading-snug">{b.headline || 'תדריך בוקר'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-[13px]">
        {b.body && <Markdown value={b.body} />}
        {stats.length > 0 && (
          <dl className="flex flex-wrap gap-x-[21px] gap-y-2">
            {stats.map(([k, label]) => (
              <div key={k} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-bold tabular-nums">{formatNumber(counts[k])}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * /collections/briefings — the history of the morning briefings, newest first, filterable by audience.
 * The morning run writes them in code (WriteBriefing); no agent. Not a menu item: linked from היום.
 */
export default function BriefingsPage() {
  const [audience, setAudience] = useState<string>(ALL);
  const all = useEntityGetAll(AgentBriefingsEntity, { orderBy: ORDER, page: { size: PAGE } });
  const filtered = useEntityGetAll(
    AgentBriefingsEntity,
    { where: { column: 'audience', value: audience }, orderBy: ORDER, page: { size: PAGE } },
    { enabled: audience !== ALL },
  );
  const q = audience === ALL ? all : filtered;
  const rows = q.data ?? [];

  const audiences = [...new Set(['כולם', ...(all.data ?? []).map((b) => b.audience).filter((a): a is string => !!a)])].sort((a, b) =>
    a === 'כולם' ? -1 : b === 'כולם' ? 1 : a.localeCompare(b, 'he'),
  );
  const items = [{ label: 'כל הקהלים', value: ALL }, ...audiences.map((a) => ({ label: a === 'כולם' ? 'כולם (כל הצוות)' : a, value: a }))];

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/collections" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4" />
          להיום
        </Link>
        <PageHeader
          title="תדריכי הבוקר"
          description="ריצת הבוקר כותבת אותם בכל בוקר א׳–ה׳: מה נכנס מהבנק, מה זוהה, מה מחכה לאישור, הבטחות, צ׳קים חוזרים ומשימות."
          actions={
            <Select items={items} value={audience} onValueChange={(v) => setAudience((v as string | null) ?? ALL)}>
              <SelectTrigger aria-label="סינון לפי קהל" className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {q.isError ? (
        <LoadError what="התדריכים" />
      ) : q.isLoading ? (
        <LoadingRows rows={4} />
      ) : rows.length === 0 ? (
        <AgentEmpty title="עוד אין תדריכים">ריצת הבוקר כותבת תדריך לכל אחראית ותדריך לכל הצוות בכל בוקר א׳–ה׳ ב-07:30.</AgentEmpty>
      ) : (
        <div className="flex max-w-[920px] flex-col gap-[13px]">
          {rows.map((b) => (
            <BriefingCard key={b.id} b={b} />
          ))}
        </div>
      )}
      {q.hasNextPage && (
        <Button variant="outline" className="self-center" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'טוען…' : 'תדריכים קודמים'}
        </Button>
      )}
    </>
  );
}