import { useEntityCreate, useEntityGetAll, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentSettingsEntity } from '@/product-types';
import { BasisBadge } from '@/components/BasisBadge';
import { LoadError } from '@/components/PageStates';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';

export const AUTO_CLOSE_KEY = 'autoCloseReceipts';
/** AgentSettings.basis of a value a person set with this switch. */
const SET_ON_SCREEN = 'הוגדר במסך';
const AUTO_CLOSE_LABEL = 'סגירה אוטומטית של קבלות';
const AUTO_CLOSE_DESCRIPTION =
  'כשהסגירה פועלת, קבלה מאושרת לבד ברגע שהלקוח מזוהה (נרשם "סגירה אוטומטית (מערכת)"). ההתאמה לחשבוניות עדיין מחכה לאישור.';

const isTrue = (v?: string | null) => (v ?? '').trim().toLowerCase() === 'true';

/** The autoCloseReceipts switch: updates the row, or creates it ("כן או לא") when it does not exist yet, basis "הוגדר במסך". Missing row = off. */
function AutoCloseSwitch() {
  const q = useEntityGetAll(AgentSettingsEntity, { where: { column: 'settingKey', value: AUTO_CLOSE_KEY } });
  const { createFunction, isLoading: creating } = useEntityCreate(AgentSettingsEntity);
  const { updateFunction, isLoading: updating } = useEntityUpdate(AgentSettingsEntity);
  const row = (q.data ?? []).find((r) => !r.isTestFixture) ?? q.data?.[0];
  const on = isTrue(row?.value);
  const saving = creating || updating;

  async function setOn(next: boolean) {
    const value = next ? 'true' : 'false';
    try {
      if (row) await updateFunction({ id: row.id, data: { value, basis: SET_ON_SCREEN } });
      else
        await createFunction({
          data: {
            settingKey: AUTO_CLOSE_KEY,
            value,
            valueType: 'כן או לא',
            basis: SET_ON_SCREEN,
            label: AUTO_CLOSE_LABEL,
            description: AUTO_CLOSE_DESCRIPTION,
            isTestFixture: false,
          },
        });
      toast.add({ title: next ? 'הסגירה האוטומטית פועלת' : 'הסגירה האוטומטית כבויה', description: next ? 'קבלות של לקוחות מזוהים יאושרו לבד.' : 'כל קבלה מחכה לאישור במשימה.', type: 'success' });
    } catch {
      toast.add({ title: 'ההגדרה לא נשמרה', description: 'נסו שוב בעוד רגע.', type: 'error' });
    }
  }

  if (q.isError) return <LoadError what="ההגדרה" />;
  return (
    <Field orientation="horizontal" className="items-start gap-[13px]">
      <Switch id="auto-close-receipts" checked={on} disabled={q.isLoading || saving} onCheckedChange={(v) => void setOn(!!v)} className="mt-0.5" />
      <FieldContent>
        <FieldLabel htmlFor="auto-close-receipts" className="flex flex-wrap items-center gap-2 text-sm font-bold">
          {AUTO_CLOSE_LABEL}
          <span className="text-[13px] font-semibold text-muted-foreground">{q.isLoading ? '…' : on ? 'פועלת' : 'כבויה'}</span>
          {saving && <Spinner className="size-3.5" />}
          {row?.basis && <BasisBadge basis={row.basis} />}
        </FieldLabel>
        <FieldDescription>{AUTO_CLOSE_DESCRIPTION}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

/** Settings → כללים: the receipts rules that have their own controls (auto-close). */
export function ReceiptsSettingsSection() {
  return (
    <section aria-label="תקבולים" className="glass glass-lift flex flex-col gap-[21px] rounded-[26px] border p-[21px]">
      <div className="flex flex-col">
        <h2 className="text-base font-bold">תקבולים</h2>
        <span className="text-[13px] text-muted-foreground">איך קבלות נסגרות.</span>
      </div>
      <AutoCloseSwitch />
    </section>
  );
}