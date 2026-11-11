import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { AgentSettingsEntity } from '@/product-types';
import { todayISO } from '@/utils/Format';

/** The date balances are measured against: AgentSettings balanceAsOfDate when set (YYYY-MM-DD), else today in Israel. */
export function useAsOfDate(): string {
  const q = useEntityGetAll(AgentSettingsEntity, { where: { column: 'settingKey', value: 'balanceAsOfDate' } });
  const value = (q.data?.[0]?.value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : todayISO();
}