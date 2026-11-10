import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import type { AgentSettingsEntity, ReceiptCheckStepsEntity, ReceiptsEntity, ReceiptsEntityIdentifyStatusEnum } from '@/product-types';
import type { BankLine } from '@/utils/ReceiptsDay';
import { formatNumber } from '@/utils/Format';

/**
 * Plan 04.11 r2 part B stage 4 ("זיהוי וקבלה"), the screen's logic, pure. IdentifyCustomers gives every line that
 * enters the run a customer with a confidence 0–100 and stops: the line's draft receipt carries identifyStatus
 * (ודאי / לא ודאי, later אושר / אושר אוטומטית) and identifyConfidence; an unknown payer has no receipt, only the
 * identification step (stage זיהוי לקוח, evidence.identifyStatus לא זוהה). A line with neither is not identified yet:
 * it is listed as "ממתינה לזיהוי" with a "זהה" button, so no line of the day is ever invisible.
 */

export type Receipt = EntityType<typeof ReceiptsEntity>;
export type CheckStep = EntityType<typeof ReceiptCheckStepsEntity>;
type Setting = EntityType<typeof AgentSettingsEntity>;

export type IdentifyStatus = ReceiptsEntityIdentifyStatusEnum;

/** AgentSettings keys of the stage. */
export const SOURCE_KEY = 'bankLinesSource';
export const CERTAIN_AT_KEY = 'identifyCertainAt';
export const AUTO_APPROVE_KEY = 'customerAutoApproveAt';

export const SOURCE_FILE = 'קובץ';
export const SOURCE_PRIORITY = 'שורות פריוריטי';
export type LinesSource = typeof SOURCE_FILE | typeof SOURCE_PRIORITY;
export const SOURCES: LinesSource[] = [SOURCE_FILE, SOURCE_PRIORITY];
/** How the header names each mode. */
export const SOURCE_LABEL: Record<LinesSource, string> = { [SOURCE_FILE]: 'קובץ דף בנק', [SOURCE_PRIORITY]: 'שורות פריוריטי' };

/** The plan's default for "certain"; the setting wins whenever it holds a number. */
export const CERTAIN_AT_DEFAULT = 90;

const settingOf = (rows: Setting[], key: string) => (rows.find((r) => r.settingKey === key && !r.isTestFixture) ?? rows.find((r) => r.settingKey === key))?.value?.trim() ?? '';

/** bankLinesSource; a missing or unknown value is קובץ. */
export function sourceOf(rows: Setting[]): LinesSource {
  return settingOf(rows, SOURCE_KEY) === SOURCE_PRIORITY ? SOURCE_PRIORITY : SOURCE_FILE;
}

/** A number setting, or null when empty / not a number. */
export function numberSetting(rows: Setting[], key: string): number | null {
  const v = settingOf(rows, key);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function certainAtOf(rows: Setting[]): number {
  return numberSetting(rows, CERTAIN_AT_KEY) ?? CERTAIN_AT_DEFAULT;
}

export interface Candidate {
  customerCode: string;
  customerName: string;
  confidence: number;
  method?: string;
}

/** What the identification step keeps in its evidence (IdentifyCustomers). */
interface IdentifyEvidence {
  confidence?: number;
  method?: string;
  identifyStatus?: string;
  customerCode?: string | null;
  candidates?: { customerCode?: string; customerName?: string; confidence?: number; method?: string }[];
}

function evidenceOf(step?: CheckStep): IdentifyEvidence | null {
  const e = step?.evidence as IdentifyEvidence | undefined;
  return e && typeof e === 'object' && typeof e.identifyStatus === 'string' ? e : null;
}

/** A line no identification run has reached yet. */
export const WAITING = 'ממתינה לזיהוי';

export type IdentityState = typeof WAITING | 'לא זוהה' | 'לא ודאי' | 'ודאי' | 'אושר';

export interface LineIdentity {
  line: BankLine;
  bankLineId: string;
  state: IdentityState;
  /** The receipt's own identifyStatus (אושר אוטומטית kept apart from אושר); ממתינה לזיהוי before any run. */
  status: IdentifyStatus | typeof WAITING;
  confidence: number;
  customerCode: string | null;
  customerName: string | null;
  method: string | null;
  evidence: string | null;
  candidates: Candidate[];
  receipt: Receipt | null;
}

const APPROVED: string[] = ['אושר', 'אושר אוטומטית'];

/** The latest identification step of a line (the run its lastCheckRunId names, else the newest). */
export function latestIdentifyStep(steps: CheckStep[], line: BankLine): CheckStep | undefined {
  const own = steps.filter((s) => s.bankLineId === line.bankLineId && s.stage === 'זיהוי לקוח' && !!evidenceOf(s));
  return own.find((s) => !!line.lastCheckRunId && s.checkRunId === line.lastCheckRunId) ?? [...own].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
}

const isApproved = (r?: Receipt | null) => r?.receiptStatus === 'אושרה – לא נשלחה' || r?.receiptStatus === 'הונפקה ב-Priority';

/** A line no identification has reached: listed as ממתינה לזיהוי, first in the list. */
export function waitingIdentity(line: BankLine): LineIdentity {
  return {
    line,
    bankLineId: line.bankLineId ?? '',
    state: WAITING,
    status: WAITING,
    confidence: 0,
    customerCode: null,
    customerName: null,
    method: null,
    evidence: null,
    candidates: [],
    receipt: null,
  };
}

/** A line's identification, or null for a line no identification run has reached yet (see waitingIdentity). */
export function identityOf(line: BankLine, receipts: Receipt[], steps: CheckStep[]): LineIdentity | null {
  const id = line.bankLineId ?? '';
  if (!id) return null;
  const receipt = receipts.find((r) => r.bankLineId === id && !!r.identifyStatus) ?? receipts.find((r) => r.bankLineId === id && isApproved(r)) ?? null;
  const step = latestIdentifyStep(steps, line);
  const ev = evidenceOf(step);
  const status: IdentifyStatus | null =
    (receipt?.identifyStatus as IdentifyStatus | undefined) ?? (isApproved(receipt) ? 'אושר' : null) ?? (ev?.identifyStatus === 'לא זוהה' ? 'לא זוהה' : null);
  if (!status) return null;
  const approved = APPROVED.includes(status) || isApproved(receipt);
  const state: IdentityState = approved ? 'אושר' : status === 'ודאי' ? 'ודאי' : status === 'לא ודאי' ? 'לא ודאי' : 'לא זוהה';
  const candidates: Candidate[] = (ev?.candidates ?? [])
    .filter((c) => !!c.customerCode)
    .map((c) => ({ customerCode: c.customerCode ?? '', customerName: c.customerName || c.customerCode || '', confidence: Number(c.confidence ?? 0), method: c.method }));
  return {
    line,
    bankLineId: id,
    state,
    status,
    confidence: Number(receipt?.identifyConfidence ?? ev?.confidence ?? 0),
    customerCode: state === 'לא זוהה' ? null : (receipt?.customerCode ?? ev?.customerCode ?? null),
    customerName: state === 'לא זוהה' ? null : (receipt?.customerName ?? null),
    method: ev?.method ?? null,
    evidence: step?.detail ?? null,
    candidates,
    receipt,
  };
}

const ORDER: Record<IdentityState, number> = { [WAITING]: 0, 'לא זוהה': 1, 'לא ודאי': 2, ודאי: 3, אושר: 4 };

/** ממתינה לזיהוי, לא זוהה and לא ודאי first, then ודאי, then approved; inside a group the lower confidence first, then the line order. */
export function compareIdentities(a: LineIdentity, b: LineIdentity): number {
  return ORDER[a.state] - ORDER[b.state] || a.confidence - b.confidence || (a.line.lineNo ?? 0) - (b.line.lineNo ?? 0);
}

/** The lines "אשר את כל הוודאיים" sends: certain and not approved yet. */
export function certainLines(rows: LineIdentity[]): LineIdentity[] {
  return rows.filter((r) => r.state === 'ודאי');
}

/** Candidates first (highest confidence), then the proposed customer when it is not one of them. */
export function pickerOptions(row: LineIdentity): Candidate[] {
  const list = [...row.candidates].sort((a, b) => b.confidence - a.confidence);
  if (row.customerCode && !list.some((c) => c.customerCode === row.customerCode))
    list.unshift({ customerCode: row.customerCode, customerName: row.customerName ?? row.customerCode, confidence: row.confidence, method: row.method ?? undefined });
  return list;
}

export interface IdentifyCounts {
  lines?: number;
  certain?: number;
  uncertain?: number;
  unidentified?: number;
  skipped?: number;
  autoApproved?: number;
}

/** One line after a pull or a file confirm: what the identification found. */
export function identifyCountsLine(c?: IdentifyCounts | null): string | null {
  if (!c) return null;
  const n = (v?: number) => formatNumber(v ?? 0);
  const parts = [`${n(c.certain)} ודאיות`, `${n(c.uncertain)} לא ודאיות`, `${n(c.unidentified)} לא זוהו`];
  if ((c.autoApproved ?? 0) > 0) parts.push(`${n(c.autoApproved)} אושרו אוטומטית`);
  if ((c.skipped ?? 0) > 0) parts.push(`${n(c.skipped)} דולגו`);
  return `זיהוי לקוחות: ${parts.join(' · ')}.`;
}

/** IssueReceipt's per-line result, as the screen keeps it. */
export interface IssuedLine {
  bankLineId?: string;
  receiptKey?: string;
  customerName?: string;
  sendStatus?: string;
  sentToEmail?: string;
  approvalId?: string;
}
export interface SkippedLine {
  bankLineId?: string;
  reason?: string;
}
export interface IssueResult {
  ok?: boolean;
  issued?: IssuedLine[];
  skipped?: SkippedLine[];
  errors?: string[];
}

/** The outbox link of a receipt's mail draft (its Approvals row, when known). */
export function outboxHref(approvalId?: string | null): string {
  const p = new URLSearchParams({ tab: 'outbox', status: 'all' });
  if (approvalId) p.set('draft', approvalId);
  return `/collections/inbox?${p.toString()}`;
}