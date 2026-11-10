// Plan 04.11 part B, stage 4 (b/identify-receipt): THE confidence table of customer identification (IdentifyCustomers).
//
// Each rung of the deterministic cascade gives the identified customer a confidence 0–100. The cascade stops at the
// first (highest) rung that finds a customer in scope:
//   companyId    100  the customer's ח״פ (≥ 8 digits) appears in the bank reference / payer field
//   alias         95  an approved BankAliases row (status מאושר) for the normalised payer name
//   exactName     95  normalised payer name == normalised customer name, exactly one customer
//   contact       85  the payer is the full name of a registered contact (CustomerContacts) of exactly one customer
//   recentMail    80  an InboundEmails row of the last IDENTIFY_MAIL_DAYS days, already linked to exactly one customer
//                     (customerCode set), whose subject / body holds the exact amount and a payer name token
//   partialName   70  the payer's name tokens are all inside one customer's name tokens, or the other way round
//   ambiguous     50  several customers at the best rung: the top candidate gets this, all (max
//                     IDENTIFY_MAX_CANDIDATES) are returned as candidates
//   none           0  nothing found → לא זוהה
//
// "Certain" is NOT decided here: confidence ≥ AgentSettings identifyCertainAt (plan default 90) is ודאי, and
// customerAutoApproveAt (empty = off) decides automatic approval. Change the numbers below to re-weight a rung; the
// thresholds live in the settings, never in code.

export type IdentifyRung = 'companyId' | 'alias' | 'exactName' | 'contact' | 'recentMail' | 'partialName';
export type IdentifyMethod = IdentifyRung | 'ambiguous' | 'none';

export const IDENTIFY_CONFIDENCE: Record<IdentifyMethod, number> = {
  companyId: 100,
  alias: 95,
  exactName: 95,
  contact: 85,
  recentMail: 80,
  partialName: 70,
  ambiguous: 50,
  none: 0,
};

/** The cascade order (highest confidence first). */
export const IDENTIFY_RUNGS: IdentifyRung[] = ['companyId', 'alias', 'exactName', 'contact', 'recentMail', 'partialName'];

/** The Hebrew name of each rung (IdentifyCustomers lines[].method, the step's evidence). */
export const IDENTIFY_METHOD_LABEL: Record<IdentifyMethod, string> = {
  companyId: 'ח״פ',
  alias: 'כינוי',
  exactName: 'שם זהה',
  contact: 'איש קשר',
  recentMail: 'מייל',
  partialName: 'שם חלקי',
  ambiguous: 'דו-משמעי',
  none: 'לא זוהה',
};

/** ReceiptCheckSteps.rung of each rung (the table's enum has no finer values; the method label goes in the evidence). */
export const IDENTIFY_STEP_RUNG: Record<IdentifyRung, string> = {
  companyId: 'כרטיס לקוח',
  alias: 'כינוי',
  exactName: 'כרטיס לקוח',
  contact: 'כרטיס לקוח',
  recentMail: 'מיילים 7 ימים',
  partialName: 'כרטיס לקוח',
};

/** MatchProposals.customerIdMethod of each rung (the table's enum). */
export const IDENTIFY_PROPOSAL_METHOD: Record<IdentifyRung, string> = {
  companyId: 'שם זהה',
  alias: 'כינוי',
  exactName: 'שם זהה',
  contact: 'איש קשר',
  recentMail: 'מייל',
  partialName: 'שם זהה',
};

/** At most this many candidates are returned for an ambiguous line. */
export const IDENTIFY_MAX_CANDIDATES = 5;

/** The mail rung reads InboundEmails received in the last N days. */
export const IDENTIFY_MAIL_DAYS = 7;
