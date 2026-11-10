// The mail search of SearchRecentEmails (pure): InboundEmails of a window that mention a name (payer, customer,
// contact) and/or an amount (17,424 / 17424 / 17,424.00) in the sender, subject or body. Registered contacts and Ciment
// sales agents rank first, then remittance / promise mail, then mail that matched both; mail classified לא רלוונטי is
// searched by subject and sender only (its body was wiped). Writes nothing.
import type { Item } from '../shared/blocks/blocks-client.ts';
import { sortableTime, toIsraelDate } from '../shared/collections-dates.ts';
import { num, splitList, str } from '../shared/collections-data.ts';
import { normEmail } from '../shared/collections-mail.ts';
import { containsToken, normForNames, payerTokens, SENDER_AGENT, SENDER_CONTACT, SENDER_OTHER, textHasAmount } from '../shared/collections-receipts.ts';

const IRRELEVANT_CATEGORY = 'לא רלוונטי';
const IRRELEVANT_STATUS = 'לא רלוונטית';
const CATEGORY_RANK: Record<string, number> = { 'פירוט תשלום': 0, 'הבטחת תשלום': 1, אחר: 2 };
const EXCERPT_CHARS = 300;

export interface FoundEmail {
  inboundEmailId: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  subject: string;
  category: string;
  customerCode: string;
  customerName: string;
  senderKind: string;
  matchedOn: string;
  bodyExcerpt: string;
}

export interface SearchData {
  customers: Item[];
  contacts: Item[];
  salesAgents: Item[];
  mails: Item[];
}

const collapse = (s: unknown) => str(s).replace(/\s+/g, ' ').trim();
const categoriesOf = (m: Item) => {
  const list = splitList(m.categories);
  return list.length ? list : str(m.category) ? [str(m.category)] : [];
};

/** The mails of `fromDate` (Israel date, inclusive) on that mention the name and / or the amount, best first. */
export function searchEmails(d: SearchData, q: { name: string | null; amount: number | null; fromDate: string; limit: number }): FoundEmail[] {
  const tokens = q.name ? payerTokens(q.name) : [];
  const amount = q.amount !== null && Math.abs(num(q.amount)) >= 1 ? Math.abs(num(q.amount)) : null;
  if (!tokens.length && amount === null) return [];
  const nameOf = new Map(d.customers.map((c) => [str(c.customerCode), str(c.customerName)]));
  const contactByEmail = new Map<string, string>();
  for (const ct of d.contacts) {
    const e = normEmail(ct.email);
    if (e && !contactByEmail.has(e)) contactByEmail.set(e, str(ct.customerCode));
  }
  for (const c of d.customers) {
    for (const e of [normEmail(c.apContactEmail), normEmail(c.procurementContactEmail)]) {
      if (e && !contactByEmail.has(e)) contactByEmail.set(e, str(c.customerCode));
    }
  }
  const agents = new Set(d.salesAgents.map((a) => normEmail(a.email)).filter(Boolean));

  const out: (FoundEmail & { rank: number[] })[] = [];
  for (const m of d.mails) {
    const day = toIsraelDate(m.receivedAt);
    if (!day || day < q.fromDate) continue;
    const category = str(m.category);
    const irrelevant = category === IRRELEVANT_CATEGORY || str(m.status) === IRRELEVANT_STATUS;
    const fromAddress = normEmail(m.fromAddress) || str(m.fromAddress).trim().toLowerCase();
    const body = irrelevant ? '' : collapse(m.bodyText);
    const sender = `${str(m.fromName)} ${fromAddress.split('@')[0] ?? ''}`;
    const nameHay = normForNames(`${sender}\n${str(m.subject)}${irrelevant ? '' : `\n${str(m.bodyText)}`}`);
    const byName = tokens.some((t) => containsToken(nameHay, t));
    const byAmount = amount !== null && textHasAmount(irrelevant ? str(m.subject) : `${str(m.subject)}\n${str(m.bodyText)}`, amount);
    if (!byName && !byAmount) continue;
    const contactCode = contactByEmail.get(fromAddress);
    const isAgent = agents.has(fromAddress);
    const code = str(m.customerCode) || contactCode || '';
    const senderKind = contactCode !== undefined ? SENDER_CONTACT : isAgent ? SENDER_AGENT : SENDER_OTHER;
    out.push({
      inboundEmailId: str(m.id),
      fromName: str(m.fromName),
      fromAddress,
      receivedAt: str(m.receivedAt),
      subject: str(m.subject),
      category,
      customerCode: code,
      customerName: code ? nameOf.get(code) || code : '',
      senderKind,
      matchedOn: byName && byAmount ? 'שם וסכום' : byName ? 'שם' : 'סכום',
      bodyExcerpt: body.length > EXCERPT_CHARS ? `${body.slice(0, EXCERPT_CHARS)}…` : body,
      rank: [
        senderKind === SENDER_OTHER ? 1 : 0,
        irrelevant ? 4 : Math.min(3, ...categoriesOf(m).map((c) => CATEGORY_RANK[c] ?? 3)),
        byName && byAmount ? 0 : 1,
        -sortableTime(m.receivedAt),
      ],
    });
  }
  out.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return Number(a.inboundEmailId) - Number(b.inboundEmailId) || a.inboundEmailId.localeCompare(b.inboundEmailId);
  });
  return out.slice(0, q.limit).map(({ rank: _rank, ...c }) => c);
}
