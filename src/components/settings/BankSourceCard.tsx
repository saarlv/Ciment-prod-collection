import { useState } from 'react';
import { useEntityCreate, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { SaveIcon } from 'lucide-react';
import { AgentSettingsEntity } from '@/product-types';
import type { AgentSettingsEntityValueTypeEnum } from '@/product-types';
import { BasisBadge } from '@/components/BasisBadge';
import { LoadError } from '@/components/PageStates';
import { useReceiptsSource } from '@/hooks/useReceiptsSource';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatNumber } from '@/utils/Format';
import { AUTO_APPROVE_KEY, CERTAIN_AT_DEFAULT, CERTAIN_AT_KEY, SOURCES, SOURCE_KEY } from '@/utils/ReceiptsIdentify';
import type { LinesSource } from '@/utils/ReceiptsIdentify';

type Setting = EntityType<typeof AgentSettingsEntity>;

/** AgentSettings.basis of a value a person set on this screen. */
const SET_ON_SCREEN = 'הוגדר במסך';
const PILL = 'h-8 rounded-[16px] px-4 text-[13px] font-semibold aria-pressed:bg-glass-strong aria-pressed:text-link aria-pressed:shadow-glass-pill';

const META: Record<string, { label: string; description: string; valueType: AgentSettingsEntityValueTypeEnum }> = {
  [SOURCE_KEY]: {
    label: 'מקור שורות דף הבנק',
    description: 'קובץ = מעלים קובץ דף בנק, מאשרים את השורות ואז הזיהוי רץ. שורות פריוריטי = מושכים את השורות המוכנות מפריוריטי, והזיהוי רץ על החדשות.',
    valueType: 'טקסט',
  },
  [CERTAIN_AT_KEY]: {
    label: 'סף ודאי בזיהוי לקוח',
    description: 'שורה עם רמת ביטחון מהסף ומעלה היא ודאית ונכנסת ל"אשר את כל הוודאיים".',
    valueType: 'מספר',
  },
  [AUTO_APPROVE_KEY]: {
    label: 'סף אישור אוטומטי של לקוח',
    description: 'ריק = כבוי. שורה מהסף ומעלה מאושרת לבד ונרשמת "אושר אוטומטית".',
    valueType: 'מספר',
  },
};

/** Writes one AgentSettings row: update in place, or create it (label, description, valueType) when missing. */
function useSaveSetting(rows: Setting[]) {
  const { createFunction, isLoading: creating } = useEntityCreate(AgentSettingsEntity);
  const { updateFunction, isLoading: updating } = useEntityUpdate(AgentSettingsEntity);
  async function save(key: string, value: string) {
    const row = rows.find((r) => r.settingKey === key && !r.isTestFixture) ?? rows.find((r) => r.settingKey === key);
    if (row) await updateFunction({ id: row.id, data: { value, basis: SET_ON_SCREEN } });
    else await createFunction({ data: { settingKey: key, value, basis: SET_ON_SCREEN, isTestFixture: false, ...META[key] } });
  }
  return { save, saving: creating || updating };
}

/** A threshold 0–100; `optional` allows empty (= off). Saved explicitly with "שמירה". */
function Threshold({ settingKey, current, optional, rows }: { settingKey: string; current: number | null; optional?: boolean; rows: Setting[] }) {
  const { save, saving } = useSaveSetting(rows);
  const original = current === null ? '' : String(current);
  const [draft, setDraft] = useState(original);
  const n = Number(draft);
  const invalid = draft.trim() === '' ? !optional : !Number.isFinite(n) || n < 0 || n > 100;
  const dirty = draft.trim() !== original;
  const meta = META[settingKey];
  const id = `setting-${settingKey}`;
  const row = rows.find((r) => r.settingKey === settingKey);

  async function submit() {
    if (!dirty || invalid) return;
    try {
      await save(settingKey, draft.trim() === '' ? '' : String(n));
      toast.add({ title: 'ההגדרה נשמרה', description: meta.label, type: 'success' });
    } catch {
      toast.add({ title: 'ההגדרה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id} className="flex flex-wrap items-center gap-2">
        {meta.label}
        {row?.basis && <BasisBadge basis={row.basis} />}
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          dir="ltr"
          value={draft}
          placeholder={optional ? 'כבוי' : undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          className="w-24 bg-glass-card tabular-nums"
        />
        <Button variant="outline" size="sm" disabled={!dirty || invalid || saving} onClick={() => void submit()}>
          {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
          שמירה
        </Button>
        <span className="text-xs text-muted-foreground">{optional && original === '' ? 'כרגע: כבוי' : `כרגע: ${original === '' ? formatNumber(CERTAIN_AT_DEFAULT) : formatNumber(Number(original))}`}</span>
      </div>
      <FieldDescription>{meta.description}</FieldDescription>
    </Field>
  );
}

/**
 * Settings → כללים: "מקור שורות דף הבנק" — the bankLinesSource switch (קובץ / שורות פריוריטי; created when missing,
 * basis "הוגדר במסך") and the identification thresholds identifyCertainAt and customerAutoApproveAt (empty = off).
 */
export function BankSourceCard() {
  const s = useReceiptsSource();
  const { save, saving } = useSaveSetting(s.rows);
  const sourceRow = s.rows.find((r) => r.settingKey === SOURCE_KEY);

  async function setSource(next: LinesSource) {
    if (next === s.source && sourceRow) return;
    try {
      await save(SOURCE_KEY, next);
      toast.add({ title: `מקור השורות: ${next}`, description: next === 'קובץ' ? 'מסך התקבולים יציג העלאת קובץ ואישור שורות.' : 'מסך התקבולים יציג את המשיכה מפריוריטי.', type: 'success' });
    } catch {
      toast.add({ title: 'ההגדרה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  return (
    <section aria-label="מקור שורות דף הבנק" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-col">
        <h2 className="text-base font-bold">מקור שורות דף הבנק</h2>
        <span className="text-[13px] text-muted-foreground">מאיפה מגיעות שורות הבנק למסך התקבולים, ומתי זיהוי לקוח נחשב ודאי.</span>
      </div>
      {s.isError ? (
        <LoadError what="ההגדרות" />
      ) : s.isLoading ? (
        <Skeleton className="h-32 w-full rounded-[22px]" />
      ) : (
        <FieldGroup>
          <Field orientation="horizontal" className="items-start gap-[13px]">
            <FieldContent>
              <FieldLabel id="bank-source-label" className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {META[SOURCE_KEY].label}
                {saving && <Spinner className="size-3.5" />}
                {sourceRow?.basis ? <BasisBadge basis={sourceRow.basis} /> : <span className="text-xs font-normal text-muted-foreground">ברירת מחדל</span>}
              </FieldLabel>
              <FieldDescription>{META[SOURCE_KEY].description}</FieldDescription>
            </FieldContent>
            <ToggleGroup
              aria-labelledby="bank-source-label"
              value={[s.source]}
              onValueChange={(v) => {
                const next = SOURCES.find((x) => x === v[0]);
                if (next) void setSource(next);
              }}
              disabled={saving}
              className="shrink-0 gap-0.5 rounded-[20px] bg-glass-card p-1"
            >
              {SOURCES.map((x) => (
                <ToggleGroupItem key={x} value={x} className={PILL}>
                  {x}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <div className="grid gap-[21px] md:grid-cols-2">
            <Threshold key={`c:${s.certainAt}`} settingKey={CERTAIN_AT_KEY} current={s.certainAt} rows={s.rows} />
            <Threshold key={`a:${s.autoApproveAt ?? ''}`} settingKey={AUTO_APPROVE_KEY} current={s.autoApproveAt} optional rows={s.rows} />
          </div>
        </FieldGroup>
      )}
    </section>
  );
}