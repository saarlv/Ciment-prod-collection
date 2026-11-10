import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentSettingsEntity } from '@/product-types';
import { AUTO_APPROVE_KEY, CERTAIN_AT_KEY, SOURCE_KEY, certainAtOf, numberSetting, sourceOf } from '@/utils/ReceiptsIdentify';

/**
 * The receipts stage-4 settings from AgentSettings: where the bank lines come from (bankLinesSource, קובץ when the
 * row is missing), the "certain" threshold (identifyCertainAt, 90 when missing) and the automatic approval
 * threshold (customerAutoApproveAt, null = off). `rows` are the raw rows, for the settings card.
 */
export function useReceiptsSource() {
  const q = useEntityGetAll(AgentSettingsEntity, { where: { column: 'settingKey', operator: 'in', value: [SOURCE_KEY, CERTAIN_AT_KEY, AUTO_APPROVE_KEY] } });
  const rows = q.data ?? [];
  return {
    rows,
    isLoading: q.isLoading,
    isError: q.isError,
    source: sourceOf(rows),
    certainAt: certainAtOf(rows),
    autoApproveAt: numberSetting(rows, AUTO_APPROVE_KEY),
  };
}