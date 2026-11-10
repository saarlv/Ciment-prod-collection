import { useState } from 'react';
import { useEntityCreate, useEntityGetAll, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { SaveIcon } from 'lucide-react';
import { AgentSettingsEntity } from '@/product-types';
import { BasisBadge } from '@/components/BasisBadge';
import { LoadError, LoadingRows } from '@/components/PageStates';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  DAY_HOURS,
  NOTE_TASK_KEYS,
  inRunWindow,
  normalizeHour,
  noteTaskSetting,
  offsetLabel,
  runHour,
  settingsMap,
  taskName,
  taskOffset,
  taskTypeOf,
} from '@/utils/AgingMonths';
import type { SettingRow, SettingsMap } from '@/utils/AgingMonths';

/** AgentSettings.basis of a value a person set on this screen. */
const SET_ON_SCREEN = 'הוגדר במסך';
const HEAD = 'text-xs font-semibold text-muted-foreground';
export const SCHEDULE_KEYS = DAY_HOURS.map((h) => h.settingKey);

/** "במשיכת הבוקר (06:00)" / "אחרי בדיקת דף הבנק (09:00)" — the phase a note task opens at. */
function runAtLabel(key: string, settings: SettingsMap): string {
  const hour = DAY_HOURS.find((h) => h.settingKey === key);
  if (!hour) return key;
  const value = settings.get(key) || hour.defaultValue;
  return key === 'morningPullAt' ? `במשיכת הבוקר (${value})` : `אחרי ${hour.label} (${value})`;
}

function HoursForm({ rows }: { rows: SettingRow[] }) {
  const byKey = new Map(rows.map((r) => [r.settingKey ?? '', r]));
  const initial = Object.fromEntries(DAY_HOURS.map((h) => [h.settingKey, byKey.get(h.settingKey)?.value?.trim() || h.defaultValue]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const { createFunction } = useEntityCreate(AgentSettingsEntity);
  const { updateFunction } = useEntityUpdate(AgentSettingsEntity);

  const errorOf = (key: string): string | null => {
    const v = normalizeHour(draft[key] ?? '');
    if (!v) return 'שעה בפורמט HH:MM, למשל 06:00';
    if (!inRunWindow(v)) return 'יום העבודה רץ בין 06:00 ל-12:00, השעה הזאת לא תרוץ';
    return null;
  };
  const changed = DAY_HOURS.filter((h) => normalizeHour(draft[h.settingKey] ?? '') !== initial[h.settingKey] || !byKey.get(h.settingKey));
  const invalid = DAY_HOURS.some((h) => errorOf(h.settingKey));

  async function save() {
    if (invalid || changed.length === 0) return;
    setSaving(true);
    try {
      for (const h of changed) {
        const value = normalizeHour(draft[h.settingKey]) ?? h.defaultValue;
        const row = byKey.get(h.settingKey);
        if (row) await updateFunction({ id: row.id, data: { value, basis: SET_ON_SCREEN } });
        else
          await createFunction({
            data: {
              settingKey: h.settingKey,
              value,
              valueType: 'טקסט',
              label: h.label,
              description: `HH:MM. ${h.description} שעה עם דקות רצה בשעה העגולה הבאה.`,
              basis: SET_ON_SCREEN,
              isTestFixture: false,
            },
          });
      }
      toast.add({ title: 'לוח הזמנים נשמר', description: changed.map((h) => `${h.label} ${normalizeHour(draft[h.settingKey])}`).join(' · '), type: 'success' });
    } catch {
      toast.add({ title: 'לוח הזמנים לא נשמר', description: 'נסו שוב בעוד רגע.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-[13px]">
      <div className="grid gap-[13px] md:grid-cols-3">
        {DAY_HOURS.map((h) => {
          const row = byKey.get(h.settingKey);
          const error = errorOf(h.settingKey);
          const v = normalizeHour(draft[h.settingKey] ?? '');
          const runsAt = v && !error && runHour(v) !== v ? `תרוץ ב-${runHour(v)}` : null;
          return (
            <Field key={h.settingKey} data-invalid={!!error || undefined} className="glass-inner gap-2 p-[13px]">
              <FieldContent>
                <FieldLabel htmlFor={`hour-${h.settingKey}`} className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  {h.label}
                  {row?.basis && <BasisBadge basis={row.basis} />}
                </FieldLabel>
                <FieldDescription className="text-xs">{h.description}</FieldDescription>
              </FieldContent>
              <Input
                id={`hour-${h.settingKey}`}
                dir="ltr"
                inputMode="numeric"
                placeholder={h.defaultValue}
                value={draft[h.settingKey] ?? ''}
                aria-invalid={!!error || undefined}
                onChange={(e) => setDraft((d) => ({ ...d, [h.settingKey]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void save()}
                className="w-28 bg-glass-card text-start tabular-nums"
              />
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {row ? runsAt : `עוד לא נשמר – ברירת המחדל ${h.defaultValue}${runsAt ? `, ${runsAt}` : ''}`}
                  <span dir="ltr" className="ms-2 text-[11px]">
                    {h.settingKey}
                  </span>
                </span>
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-[13px]">
        <Button variant="outline" size="sm" disabled={saving || invalid || changed.length === 0} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
          שמירת השעות
        </Button>
      </div>
    </div>
  );
}

/** The table סוג הערה → משימה → מועד from the noteTask.* rows (read only; edited in the rules table below). */
function NoteTasksTable({ settings }: { settings: SettingsMap }) {
  const present = NOTE_TASK_KEYS.filter((k) => settings.has(noteTaskSetting(k, 'taskType')));
  if (present.length === 0) {
    return (
      <p className="rounded-[18px] bg-glass-inner px-[13px] py-2.5 text-[13px] text-ink-2">
        המשימות שנפתחות מהערות יופיעו כאן אחרי הריצה הראשונה של יום העבודה: היא יוצרת את ההגדרות של כל סוג הערה. אפשר להריץ אותה עכשיו מהכפתור ״משוך עכשיו מפריוריטי״ בדוח הגיול.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[22px] bg-glass-inner">
      <Table className="min-w-[620px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD, 'ps-[13px]')}>סוג הערה</TableHead>
            <TableHead className={HEAD}>משימה מרוכזת</TableHead>
            <TableHead className={cn(HEAD, 'pe-[13px]')}>מועד</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {present.map((k) => {
            const runAt = settings.get(noteTaskSetting(k, 'runAt')) || 'morningPullAt';
            return (
              <TableRow key={k} className="hover:bg-transparent">
                <TableCell className="ps-[13px] font-semibold whitespace-normal">{taskName(k)}</TableCell>
                <TableCell className="whitespace-normal">{taskTypeOf(k, settings)}</TableCell>
                <TableCell className="pe-[13px] whitespace-normal text-ink-2">
                  {offsetLabel(k, taskOffset(k, settings))}, {runAtLabel(runAt, settings)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Settings → כללים → "לוח זמנים" (plan 04.11 r2, part A): the three hours of the work day (morningPullAt, bankCheckAt,
 * bankRecheckAt), saved to AgentSettings with basis "הוגדר במסך" (a missing row is created), and the read-only table
 * of which grouped task each note type opens and when.
 */
export function ScheduleSettingsSection() {
  const q = useEntityGetAll(AgentSettingsEntity, { orderBy: [{ column: 'settingKey', direction: 'asc' }] });
  const rows = (q.data ?? []).filter((r) => !r.isTestFixture);
  const settings = settingsMap(rows);
  const formKey = DAY_HOURS.map((h) => `${h.settingKey}=${settings.get(h.settingKey) ?? ''}`).join('|');

  return (
    <section aria-label="לוח זמנים" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-col">
        <h2 className="text-base font-bold">לוח זמנים</h2>
        <span className="text-[13px] text-muted-foreground">יום העבודה רץ בכל שעה עגולה 06:00–12:00 בימים א׳–ה׳; שעה עם דקות רצה בשעה העגולה הבאה.</span>
      </div>
      {q.isError ? (
        <LoadError what="לוח הזמנים" />
      ) : q.isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <HoursForm key={formKey} rows={rows} />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">משימות שנפתחות מהערות, אם החודש לא מתאפס</h3>
            <NoteTasksTable settings={settings} />
          </div>
        </>
      )}
    </section>
  );
}