// Every AgentSettings row plan 04.11 (revision 2) needs, parts A, B and C — the single list later branches reuse.
// No hour, day count or threshold of the plan lives in logic code: logic reads the row (settingValue / hourSetting /
// noteTaskRule below), and RunDaySchedule inserts any missing row once from the default here (ensurePlanSettings),
// never overwriting a row that exists.
//
// valueType: 'מספר' / 'טקסט' / 'כן או לא' (AgentSettings enum). basis: 'החלטת יניב' (decided with Yaniv in the plan),
// 'הנחה' (an assumption still to confirm), 'ברירת מחדל' (a safe default — off / empty until someone sets it).
// An empty value on a threshold (customerAutoApproveAt, allocationAutoApproveAt, mailAutoReplyAt) means OFF.
//
// noteTask.<type>.* maps a CustomerNotes noteType to its grouped task (plan table "סוג הערה → משימה מרוכזת → מתי"):
//   .taskType   CollectionQueue.taskType of the grouped task
//   .offsetDays days after the note's actionDate (reminder: reminderDate) — a number, or the key of a number setting
//               (צ׳ק אצל סוכן → agentChequeDays)
//   .runAt      the key of the hour setting the task is opened at (morningPullAt, or bankCheckAt = after the receipts run)
import type { BlocksClient, Item } from './blocks/blocks-client.ts';
import { createInChunks, errText, readAll, str } from './collections-data.ts';

export type SettingValueType = 'מספר' | 'טקסט' | 'כן או לא';
export type SettingBasis = 'החלטת יניב' | 'הנחה' | 'ברירת מחדל';

export interface PlanSetting {
  settingKey: string;
  value: string;
  valueType: SettingValueType;
  label: string;
  description: string;
  basis: SettingBasis;
  /** plan part: A (aging + data), B (receipts), C (inbox) */
  part: 'A' | 'B' | 'C';
  /** take the value of this older row when it exists (bankRecheckAt ← receiptsReadyBy) */
  fromLegacyKey?: string;
}

const NUM: SettingValueType = 'מספר';
const TXT: SettingValueType = 'טקסט';

// ---------- the hours of the work day ----------
export const S_MORNING_PULL_AT = 'morningPullAt';
export const S_BANK_CHECK_AT = 'bankCheckAt';
export const S_BANK_RECHECK_AT = 'bankRecheckAt';
export const S_AGENT_CHEQUE_DAYS = 'agentChequeDays';

// ---------- note types → grouped tasks ----------
/** ASCII key part of each CustomerNotes type (noteTask.<key>.*); 'reminder' = any note with a reminderDate. */
export const NOTE_TASK_TYPES = {
  promise: 'התחייבות לתשלום',
  creditCard: 'תשלום באשראי',
  agentCheque: 'צ׳ק אצל סוכן',
  callBack: 'חזור אליי',
  reminder: 'תזכורת',
} as const;
export type NoteTaskKey = keyof typeof NOTE_TASK_TYPES;
export const noteTaskSettingKey = (type: NoteTaskKey, field: 'taskType' | 'offsetDays' | 'runAt') => `noteTask.${type}.${field}`;

interface NoteTaskDef {
  type: NoteTaskKey;
  /** Hebrew name used in the labels */
  name: string;
  taskType: string;
  offsetDays: string;
  offsetIsKey: boolean;
  runAt: string;
  when: string;
}

const NOTE_TASK_DEFS: NoteTaskDef[] = [
  {
    type: 'promise',
    name: 'התחייבות לתשלום',
    taskType: 'התחייבויות שלא קוימו – ליצור קשר',
    offsetDays: '1',
    offsetIsKey: false,
    runAt: S_BANK_CHECK_AT,
    when: 'ביום שאחרי תאריך ההתחייבות, אחרי ריצת התקבולים',
  },
  {
    type: 'creditCard',
    name: 'תשלום באשראי',
    taskType: 'להתקשר לפרטי אשראי',
    offsetDays: '0',
    offsetIsKey: false,
    runAt: S_MORNING_PULL_AT,
    when: 'ביום עצמו, במשיכת הבוקר',
  },
  {
    type: 'agentCheque',
    name: 'צ׳ק אצל סוכן',
    taskType: 'צ׳ק אצל סוכן – אין קבלה',
    offsetDays: S_AGENT_CHEQUE_DAYS,
    offsetIsKey: true,
    runAt: S_MORNING_PULL_AT,
    when: 'התאריך ועוד מספר הימים שבהגדרה agentChequeDays, במשיכת הבוקר',
  },
  {
    type: 'callBack',
    name: 'חזור אליי',
    taskType: 'לחזור ללקוח',
    offsetDays: '0',
    offsetIsKey: false,
    runAt: S_MORNING_PULL_AT,
    when: 'ביום עצמו, במשיכת הבוקר',
  },
  {
    type: 'reminder',
    name: 'תזכורת (כל הערה עם תאריך תזכורת)',
    taskType: 'תזכורות',
    offsetDays: '0',
    offsetIsKey: false,
    runAt: S_MORNING_PULL_AT,
    when: 'בתאריך התזכורת, במשיכת הבוקר',
  },
];

const noteTaskRows = (d: NoteTaskDef): PlanSetting[] => [
  {
    settingKey: noteTaskSettingKey(d.type, 'taskType'),
    value: d.taskType,
    valueType: TXT,
    label: `${d.name} – סוג המשימה המרוכזת`,
    description: `סוג המשימה (CollectionQueue) שנפתחת להערות "${d.name}": משימה אחת לכל תאריך ועובדת, עם שורה לכל לקוח וחודש. ${d.when}.`,
    basis: 'החלטת יניב',
    part: 'A',
  },
  {
    settingKey: noteTaskSettingKey(d.type, 'offsetDays'),
    value: d.offsetDays,
    valueType: d.offsetIsKey ? TXT : NUM,
    label: `${d.name} – ימים אחרי התאריך`,
    description: d.offsetIsKey
      ? `כמה ימים אחרי תאריך ההערה נפתחת המשימה. הערך הוא שם הגדרה מספרית (${d.offsetDays}), כדי שהמספר יוגדר במקום אחד. אפשר גם לכתוב מספר.`
      : `כמה ימים אחרי ${d.type === 'reminder' ? 'תאריך התזכורת' : 'תאריך ההערה'} נפתחת המשימה (0 = באותו יום).`,
    basis: 'החלטת יניב',
    part: 'A',
  },
  {
    settingKey: noteTaskSettingKey(d.type, 'runAt'),
    value: d.runAt,
    valueType: TXT,
    label: `${d.name} – באיזה שלב ביום`,
    description: `שם הגדרת השעה שבה נפתחת המשימה: ${S_MORNING_PULL_AT} (משיכת הבוקר) או ${S_BANK_CHECK_AT} (אחרי ריצת התקבולים). השעה עצמה נקבעת בהגדרה ההיא.`,
    basis: 'החלטת יניב',
    part: 'A',
  },
];

/** The full list, in display order. */
export const PLAN_SETTINGS: PlanSetting[] = [
  // ---------- part A: the work day ----------
  {
    settingKey: S_MORNING_PULL_AT,
    value: '06:00',
    valueType: TXT,
    label: 'שעת משיכת הבוקר מפריוריטי',
    description:
      'HH:MM. בשעה הזאת יום העבודה מושך מפריוריטי לקוחות, תנועות פתוחות והזמנות פתוחות, ואחר כך בונה את המשימות. שעה עם דקות רצה בשעה העגולה הבאה. הכפתור "משוך עכשיו מפריוריטי" מריץ את השלב הזה בכל שעה.',
    basis: 'החלטת יניב',
    part: 'A',
  },
  {
    settingKey: S_BANK_CHECK_AT,
    value: '09:00',
    valueType: TXT,
    label: 'שעת בדיקת דף הבנק בפריוריטי',
    description: 'HH:MM. בשעה הזאת בודקים אם דף הבנק עלה לפריוריטי; אם כן רצים התקבולים, משיכה חוזרת של התנועות ומשימות ההתחייבות. שעה עם דקות רצה בשעה העגולה הבאה.',
    basis: 'החלטת יניב',
    part: 'A',
  },
  {
    settingKey: S_BANK_RECHECK_AT,
    value: '10:00',
    valueType: TXT,
    label: 'שעת הבדיקה החוזרת של דף הבנק',
    description:
      'HH:MM. אם דף הבנק לא עלה בבדיקה הראשונה, בודקים שוב בשעה הזאת. אם עדיין לא עלה נפתחת משימה דחופה "דף הבנק לא עלה לפריוריטי" ומשימות ההתחייבות לא נוצרות באותו יום. מחליף את receiptsReadyBy.',
    basis: 'החלטת יניב',
    part: 'A',
    fromLegacyKey: 'receiptsReadyBy',
  },
  {
    settingKey: S_AGENT_CHEQUE_DAYS,
    value: '2',
    valueType: NUM,
    label: 'ימים עד משימת צ׳ק אצל סוכן',
    description: 'כמה ימים אחרי תאריך הערת "צ׳ק אצל סוכן" נפתחת המשימה "צ׳ק אצל סוכן – אין קבלה" אם עוד אין קבלה. דורש העמקה מול הצוות.',
    basis: 'הנחה',
    part: 'A',
  },
  ...NOTE_TASK_DEFS.flatMap(noteTaskRows),
  {
    settingKey: 'openMovementsFromDate',
    value: '2024-01-01',
    valueType: TXT,
    label: 'תנועות פתוחות – מתאריך',
    description:
      'YYYY-MM-DD. משיכת התנועות הפתוחות מפריוריטי קוראת רק תנועות שתאריך המסמך שלהן מהתאריך הזה והלאה, ובוחרת לקוחות שיש להם חשבונית מהתאריך הזה (או תנועות פתוחות קיימות). הרצה עם "היסטוריה מלאה" מתעלמת ממנו ומדווחת על תנועות פתוחות ישנות יותר.',
    basis: 'ברירת מחדל',
    part: 'A',
  },
  // ---------- part B: receipts ----------
  {
    settingKey: 'bankLinesSource',
    value: 'קובץ',
    valueType: TXT,
    label: 'מקור שורות דף הבנק',
    description: '"קובץ" = העלאת קובץ דף בנק, חילוץ ואישור שורות. "שורות פריוריטי" = השורות המובנות של פריוריטי, בלי חילוץ ואישור. נשאל את גילה ונווית.',
    basis: 'הנחה',
    part: 'B',
  },
  {
    settingKey: 'identifyCertainAt',
    value: '90',
    valueType: NUM,
    label: 'רמת ביטחון לזיהוי לקוח ודאי',
    description: 'זיהוי לקוח לשורת בנק ברמת ביטחון (0–100) מעל הסף הזה נחשב ודאי ונכנס ל"אשר את כל הוודאיים".',
    basis: 'ברירת מחדל',
    part: 'B',
  },
  {
    settingKey: 'customerAutoApproveAt',
    value: '',
    valueType: NUM,
    label: 'סף אישור אוטומטי של זיהוי לקוח',
    description: 'ריק = כבוי: כל זיהוי עובר לאישור אדם. מספר (0–100) = זיהוי מעל הסף מאושר לבד ונרשם "אושר אוטומטית".',
    basis: 'ברירת מחדל',
    part: 'B',
  },
  {
    settingKey: 'allocationAutoApproveAt',
    value: '',
    valueType: NUM,
    label: 'סף אישור אוטומטי של פיזור לחשבוניות',
    description: 'ריק = כבוי: כל פיזור עובר לאישור אדם. מספר (0–100) = פיזור מעל הסף מאושר לבד ונרשם "אושר אוטומטית".',
    basis: 'ברירת מחדל',
    part: 'B',
  },
  // ---------- part C: inbox ----------
  {
    settingKey: 'mailAutoReplyAt',
    value: '',
    valueType: NUM,
    label: 'סף שליחה אוטומטית של תשובה למייל',
    description: 'ריק = כבוי: כל תשובה (כרטסת, חובות פתוחים) נשמרת כטיוטה לאישור בלחיצה. מספר (0–100) = זיהוי מעל הסף נשלח לבד.',
    basis: 'ברירת מחדל',
    part: 'C',
  },
  {
    settingKey: 'insurerSenders',
    value: '',
    valueType: TXT,
    label: 'כתובות השולח של בסס״ח',
    description: 'כתובות מייל (מופרדות בפסיק) שמהן מגיעים אישורי ביטוח אשראי. מייל מכתובת כזו מסווג "אישור ביטוח אשראי" ומקושר לבקשה הפתוחה.',
    basis: 'ברירת מחדל',
    part: 'C',
  },
  {
    settingKey: 'documentChaseActive',
    value: 'לא',
    valueType: 'כן או לא',
    label: 'מרדף תעודות אוטומטי פעיל',
    description: 'לא = כבוי (החלטת התוכנית 04.11: תעודות וחשבוניות חסרות מטופלות ידנית עד השיחה הנפרדת). כן = הריצה השעתית (DocumentChase) בודקת סריקות, מכינה תזכורות ללוגיסטיקה ומסלימה.',
    basis: 'החלטת יניב',
    part: 'C',
  },
];

export const PLAN_SETTING_KEYS = PLAN_SETTINGS.map((s) => s.settingKey);
export const S_DOCUMENT_CHASE_ACTIVE = 'documentChaseActive';
export const planSettingOf = (key: string) => PLAN_SETTINGS.find((s) => s.settingKey === key);

// ---------- reading ----------
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** The stored value, else the plan default ('' when neither). */
export function settingValue(settings: Map<string, string>, key: string): string {
  const v = settings.get(key);
  if (v !== undefined && v !== null) return str(v).trim();
  return planSettingOf(key)?.value ?? '';
}

/** A yes/no setting (valueType כן או לא): כן / true / 1 / yes; anything else – or the plan default when missing – read the same way. */
export function yesNoSetting(settings: Map<string, string>, key: string): boolean {
  return ['כן', 'true', '1', 'yes'].includes(settingValue(settings, key).toLowerCase());
}

/** A number setting; null when empty (= off) or not a number. */
export function numberSettingOrNull(settings: Map<string, string>, key: string): number | null {
  const raw = settingValue(settings, key);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface HourSetting {
  key: string;
  /** as stored (or the plan default) */
  value: string;
  /** HH:MM normalised, null when invalid */
  hhmm: string | null;
  /** the round hour the phase runs at (an hour with minutes runs at the next round hour), "HH:00"; null when invalid / past 23:00 */
  runsAt: string | null;
}

/** An hour setting (HH:MM), with the round hour it runs at. */
export function hourSetting(settings: Map<string, string>, key: string): HourSetting {
  const value = settingValue(settings, key);
  const m = HHMM.exec(value);
  if (!m) return { key, value, hhmm: null, runsAt: null };
  const h = Number(m[1]);
  const min = Number(m[2]);
  const hhmm = `${String(h).padStart(2, '0')}:${m[2]}`;
  const runHour = min > 0 ? h + 1 : h;
  return { key, value, hhmm, runsAt: runHour > 23 ? null : `${String(runHour).padStart(2, '0')}:00` };
}

export interface NoteTaskRule {
  type: NoteTaskKey;
  noteType: string;
  taskType: string;
  /** days after the note's date; null when the setting (or the setting it names) is not a number */
  offsetDays: number | null;
  /** the hour setting key the task is opened at */
  runAt: string;
}

/** The note → task rule of one note type, every reference resolved through the settings. */
export function noteTaskRule(settings: Map<string, string>, type: NoteTaskKey): NoteTaskRule {
  const offsetRaw = settingValue(settings, noteTaskSettingKey(type, 'offsetDays'));
  const direct = offsetRaw === '' ? NaN : Number(offsetRaw);
  const offset = Number.isFinite(direct) ? direct : offsetRaw ? numberSettingOrNull(settings, offsetRaw) : null;
  return {
    type,
    noteType: NOTE_TASK_TYPES[type],
    taskType: settingValue(settings, noteTaskSettingKey(type, 'taskType')),
    offsetDays: offset,
    runAt: settingValue(settings, noteTaskSettingKey(type, 'runAt')),
  };
}

// ---------- ensuring the rows exist ----------
export interface EnsureResult {
  /** keys inserted now (dryRun: the keys that would be inserted) */
  created: string[];
  /** the settings after the insert (existing values + the inserted ones) */
  settings: Map<string, string>;
  errors: string[];
}

/** The row a missing setting is inserted with (bankRecheckAt takes the old receiptsReadyBy value when it is an hour). */
export function planSettingRow(def: PlanSetting, existing: Map<string, string>): Item {
  const legacy = def.fromLegacyKey ? str(existing.get(def.fromLegacyKey)).trim() : '';
  const useLegacy = !!legacy && (def.valueType !== 'טקסט' || !HHMM.test(def.value) || HHMM.test(legacy));
  return {
    settingKey: def.settingKey,
    value: useLegacy ? legacy : def.value,
    valueType: def.valueType,
    label: def.label,
    description: useLegacy ? `${def.description} (הערך נלקח מ-${def.fromLegacyKey}.)` : def.description,
    basis: def.basis,
    isTestFixture: false,
  };
}

/** Inserts every plan setting that has no row yet (once; an existing row is never overwritten). dryRun defaults to true. */
export async function ensurePlanSettings(client: BlocksClient, opts: { dryRun?: boolean } = {}): Promise<EnsureResult> {
  const dryRun = opts.dryRun !== false;
  const errors: string[] = [];
  let rows: Item[];
  try {
    rows = await readAll(client, 'AgentSettings');
  } catch (e) {
    return { created: [], settings: new Map(), errors: [`AgentSettings: ${errText(e)}`] };
  }
  const settings = new Map<string, string>();
  for (const r of rows) if (str(r.settingKey).trim()) settings.set(str(r.settingKey).trim(), str(r.value));
  const missing = PLAN_SETTINGS.filter((d) => !settings.has(d.settingKey)).map((d) => planSettingRow(d, settings));
  if (!missing.length) return { created: [], settings, errors };
  if (dryRun) {
    const preview = new Map(settings);
    for (const m of missing) preview.set(m.settingKey, m.value);
    return { created: missing.map((m) => m.settingKey), settings: preview, errors };
  }
  try {
    const created = await createInChunks(client, 'AgentSettings', missing);
    for (const c of created) if (str(c.settingKey)) settings.set(str(c.settingKey), str(c.value));
    const createdKeys = created.map((c) => str(c.settingKey)).filter(Boolean);
    for (const m of missing) if (!createdKeys.includes(m.settingKey)) errors.push(`AgentSettings ${m.settingKey}: לא נוצרה`);
    return { created: createdKeys, settings, errors };
  } catch (e) {
    return { created: [], settings, errors: [`AgentSettings: ${errText(e)}`] };
  }
}
