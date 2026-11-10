import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentSettingsEntity } from '@/product-types';
import { DUE_WINDOW_DEFAULT, DUE_WINDOW_KEY, SEVERITY_DEFAULTS, settingNumber, severitySettingsFrom } from '@/utils/Severity';

const KEYS = [...Object.keys(SEVERITY_DEFAULTS), DUE_WINDOW_KEY];

/** The severity settings and the customer card's due window from AgentSettings, with their defaults while loading or missing. */
export function useCollectionsSettings() {
  const settings = useEntityGetAll(AgentSettingsEntity, {
    where: { column: 'settingKey', operator: 'in', value: KEYS },
  });
  const rows = (settings.data ?? []).filter((r) => !r.isTestFixture);
  const window = settingNumber(rows, DUE_WINDOW_KEY, DUE_WINDOW_DEFAULT);
  return {
    isLoading: settings.isLoading,
    severity: severitySettingsFrom(rows),
    dueWindowDays: window >= 0 ? window : DUE_WINDOW_DEFAULT,
  };
}