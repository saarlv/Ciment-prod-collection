import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useEntityGetAll, useEntityUpdate, useUser } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { SaveIcon } from 'lucide-react';
import { AgentSettingsEntity } from '@/product-types';
import { BasisBadge } from '@/components/BasisBadge';
import { AgentEmpty, LoadError, LoadingRows, PageHeader } from '@/components/PageStates';
import { SettingsTabs } from '@/components/SettingsTabs';
import { BankSourceCard } from '@/components/settings/BankSourceCard';
import { LogisticsContactsSection } from '@/components/settings/LogisticsContactsSection';
import { AUTO_CLOSE_KEY, ReceiptsSettingsSection } from '@/components/settings/ReceiptsSettingsSection';
import { SalesAgentsSection } from '@/components/settings/SalesAgentsSection';
import { SCHEDULE_KEYS, ScheduleSettingsSection } from '@/components/settings/ScheduleSettingsSection';
import { TeamSection } from '@/components/settings/TeamSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { formatDateTime, formatNumber } from '@/utils/Format';
import { AUTO_APPROVE_KEY, CERTAIN_AT_KEY, SOURCE_KEY } from '@/utils/ReceiptsIdentify';

type Setting = EntityType<typeof AgentSettingsEntity>;

const HEAD = 'text-xs font-semibold text-muted-foreground';
const isTrue = (v?: string | null) => ['true', 'כן', '1', 'yes'].includes((v ?? '').trim().toLowerCase());

/** The stored value as the team reads it, by valueType. */
function displayValue(s: Setting): string {
  if (s.valueType === 'כן או לא') return isTrue(s.value) ? 'כן' : 'לא';
  if (s.valueType === 'מספר') {
    const n = Number(s.value);
    return s.value && Number.isFinite(n) ? formatNumber(n) : '—';
  }
  return s.value?.trim() || '—';
}

/** One rule: the value is editable in place (number / text / switch) and saved explicitly with "שמירה". */
function SettingRow({ setting }: { setting: Setting }) {
  const user = useUser();
  const { updateFunction, isLoading } = useEntityUpdate(AgentSettingsEntity);
  const original = setting.value ?? '';
  const [draft, setDraft] = useState(setting.valueType === 'כן או לא' ? (isTrue(original) ? 'true' : 'false') : original);
  const normalizedOriginal = setting.valueType === 'כן או לא' ? (isTrue(original) ? 'true' : 'false') : original;
  const dirty = draft !== normalizedOriginal;
  const invalid = setting.valueType === 'מספר' && (draft.trim() === '' || !Number.isFinite(Number(draft)));
  const inputId = `setting-${setting.id}`;

  async function save() {
    if (!dirty || invalid) return;
    try {
      await updateFunction({ id: setting.id, data: { value: setting.valueType === 'מספר' ? String(Number(draft)) : draft.trim() } });
      toast.add({ title: 'ההגדרה נשמרה', description: setting.label || setting.settingKey, type: 'success' });
    } catch {
      toast.add({ title: 'ההגדרה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  const updatedByMe = !!setting.updatedBy && !!user.id && String(setting.updatedBy) === String(user.id);

  return (
    <TableRow className="hover:bg-glass-faint">
      <TableCell className="max-w-80 ps-[21px] align-top whitespace-normal">
        <div className="flex flex-col gap-0.5">
          <label htmlFor={inputId} className="font-semibold">
            {setting.label || setting.settingKey}
          </label>
          {setting.description && <span className="text-xs text-muted-foreground">{setting.description}</span>}
          <span dir="ltr" className="self-end text-[11px] text-muted-foreground">
            {setting.settingKey}
          </span>
        </div>
      </TableCell>
      <TableCell className="align-top">
        {setting.valueType === 'כן או לא' ? (
          <div className="flex items-center gap-2">
            <Switch id={inputId} checked={draft === 'true'} onCheckedChange={(on) => setDraft(on ? 'true' : 'false')} />
            <span className="text-sm font-semibold">{draft === 'true' ? 'כן' : 'לא'}</span>
          </div>
        ) : (
          <Input
            id={inputId}
            type={setting.valueType === 'מספר' ? 'number' : 'text'}
            inputMode={setting.valueType === 'מספר' ? 'decimal' : undefined}
            dir={setting.valueType === 'מספר' ? 'ltr' : 'auto'}
            value={draft}
            aria-invalid={invalid || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            className={cn('bg-glass-card', setting.valueType === 'מספר' ? 'w-28 tabular-nums' : 'w-56')}
          />
        )}
        {dirty && <span className="mt-1 block text-xs text-muted-foreground">כרגע: {displayValue(setting)}</span>}
      </TableCell>
      <TableCell className="align-top">
        <BasisBadge basis={setting.basis} />
      </TableCell>
      <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
        {setting.updatedAt ? `${updatedByMe ? 'עודכן על ידך · ' : 'עודכן · '}${formatDateTime(setting.updatedAt)}` : '—'}
      </TableCell>
      <TableCell className="pe-[21px] align-top">
        <Button variant="outline" size="sm" disabled={!dirty || invalid || isLoading} onClick={save}>
          {isLoading ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
          שמירה
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** The monthly open-debts day moved to the automation on פניות → אוטומציות; it is no longer edited here. */
/** autoCloseReceipts has its own switch in the תקבולים section above the rules; the bank-lines source and the identification thresholds have their card; the work-day hours have the לוח זמנים card. */
const HIDDEN_KEYS = new Set(['openDebtsDay', AUTO_CLOSE_KEY, SOURCE_KEY, CERTAIN_AT_KEY, AUTO_APPROVE_KEY, ...SCHEDULE_KEYS]);

/** /collections/settings — "כללים" (the agents' rules, AgentSettings) and ?tab=roles "תפקידים" (sales agents, logistics, team). */
export default function SettingsPage() {
  const [params] = useSearchParams();
  if (params.get('tab') === 'roles') {
    return (
      <>
        <PageHeader title="תפקידים" description="מי הסוכנים ולאילו לקוחות הם מורשים, מי בלוגיסטיקה לכל קו מוצר, ומי בצוות." actions={<SettingsTabs />} />
        <SalesAgentsSection />
        <LogisticsContactsSection />
        <TeamSection />
      </>
    );
  }
  return <RulesTab />;
}

function RulesTab() {
  const settings = useEntityGetAll(AgentSettingsEntity, {
    orderBy: [{ column: 'settingKey', direction: 'asc' }],
  });
  const rules = (settings.data ?? []).filter((s) => !s.isTestFixture && !HIDDEN_KEYS.has(s.settingKey ?? ''));
  const assumptions = rules.filter((s) => s.basis === 'הנחה').length;

  return (
    <>
      <PageHeader title="כללים" description="הכללים שנינה ומאיה עובדות לפיהם, והכללים של הבדיקות האוטומטיות." actions={<SettingsTabs />} />
      <ScheduleSettingsSection />
      <BankSourceCard />
      <ReceiptsSettingsSection />
      <section aria-label="כללי הסוכנות" className="glass glass-lift flex flex-col gap-[13px] overflow-hidden rounded-[26px] border">
        <div className="flex flex-col px-[21px] pt-[21px]">
          <h2 className="text-base font-bold">
            כללי הסוכנות <span className="font-medium text-muted-foreground">({rules.length})</span>
          </h2>
          <span className="text-[13px] text-muted-foreground">
            ערכו ערך ולחצו ״שמירה״ בשורה. המקור של כל כלל קבוע: כלל שמסומן ״הנחה – לאשר עם יניב״ ממתין לאישור שלו
            {assumptions > 0 ? ` (${formatNumber(assumptions)} כאלה)` : ''}.
          </span>
          <span className="text-[13px] text-muted-foreground">
            היום בחודש של מייל החובות הפתוחים נקבע עכשיו באוטומציה:{' '}
            <Link to="/collections/inbox?tab=automations" className="font-semibold text-link hover:underline">
              פניות ← אוטומציות
            </Link>
            .
          </span>
        </div>
        {settings.isError ? (
          <div className="px-[21px] pb-[21px]">
            <LoadError what="הכללים" />
          </div>
        ) : settings.isLoading ? (
          <LoadingRows rows={6} />
        ) : rules.length === 0 ? (
          <AgentEmpty title="עוד אין כללים">הכללים נכתבים כשהסוכנות מוגדרות; עד אז הן עובדות לפי ברירות המחדל שלהן.</AgentEmpty>
        ) : (
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(HEAD, 'ps-[21px]')}>כלל</TableHead>
                <TableHead className={HEAD}>ערך</TableHead>
                <TableHead className={HEAD}>מקור</TableHead>
                <TableHead className={HEAD}>עדכון אחרון</TableHead>
                <TableHead className={cn(HEAD, 'pe-[21px]')}>
                  <span className="sr-only">שמירה</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((s) => (
                <SettingRow key={`${s.id}:${s.value ?? ''}`} setting={s} />
              ))}
            </TableBody>
          </Table>
        )}
        <div className="pb-[8px]" />
      </section>
    </>
  );
}