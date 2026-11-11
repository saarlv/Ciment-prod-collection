// The open-movements cutoff (AgentSettings openMovementsFromDate, default 2024-01-01), read exactly as
// priority-movements-source.ts movementsCutoff reads it. Kept in its own module so the invoice layer can read it without
// importing the Priority source (which itself imports the invoice layer).
import type { BlocksClient } from './blocks/blocks-client.ts';
import { errText, str } from './collections-data.ts';
import { planSettingOf } from './plan-settings.ts';

export const S_OPEN_MOVEMENTS_FROM_DATE = 'openMovementsFromDate';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The cutoff: the setting when it is a date, else its default (2024-01-01). */
export async function readMovementsCutoff(client: BlocksClient): Promise<string> {
  const fallback = planSettingOf(S_OPEN_MOVEMENTS_FROM_DATE)?.value ?? '2024-01-01';
  try {
    const r = await client.queryTable('AgentSettings', { from: { table: 'AgentSettings' }, where: { column: 'settingKey', value: S_OPEN_MOVEMENTS_FROM_DATE }, limit: 5 });
    const v = str(r?.items?.[0]?.value).trim();
    return ISO_DAY.test(v) ? v : fallback;
  } catch (e) {
    console.error(`[cutoff] AgentSettings ${S_OPEN_MOVEMENTS_FROM_DATE}: ${errText(e)} – using ${fallback}`);
    return fallback;
  }
}
