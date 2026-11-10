import { BlocksClient, Item } from '../shared/blocks/blocks-client.ts';
import { errText, readByIds, str } from '../shared/collections-data.ts';
import { clean } from '../shared/collections-mail.ts';
import { HANDLING_STATES, HS_DONE, HS_WAITING } from '../shared/collections-inbox.ts';
import { syncTasksAfterWrite } from '../shared/collections-task-sync.ts';

// Sets the handling state of one or more inbound emails from the inbox screen: לא טופל, ממתין (requires
// waitingFor; sets waitingSince) or טופל (sets handledBy and handledAt). Moving away from טופל clears handledBy /
// handledAt; moving away from ממתין clears waitingFor / waitingSince. An email already in the requested state keeps
// its timestamps (waitingSince is kept while waitingFor is unchanged). One Interactions row per changed email that
// is linked to a customer. The changed emails' tasks are then updated by the task engine (taskSync). Sends nothing.

const ACTOR_DEFAULT = 'משתמש';

export const invoke = async (input: any, context: any) => {
  const ids: string[] = Array.isArray(input?.inboundEmailIds)
    ? [...new Set(input.inboundEmailIds.map((x: unknown) => clean(x)).filter(Boolean))] as string[]
    : typeof input?.inboundEmailIds === 'string'
      ? [...new Set(String(input.inboundEmailIds).split(/[,\n]/).map((x) => x.trim()).filter(Boolean))]
      : [];
  const state = clean(input?.state);
  const waitingFor = str(input?.waitingFor).trim();
  const by = clean(input?.by) || ACTOR_DEFAULT;
  const errors: string[] = [];
  if (!ids.length) errors.push('חסרים מזהי מיילים (inboundEmailIds)');
  if (!HANDLING_STATES.includes(state)) errors.push(`מצב טיפול לא מוכר: "${state}" (${HANDLING_STATES.join(' / ')})`);
  if (state === HS_WAITING && !waitingFor) errors.push('במצב "ממתין" חובה לציין למי ממתינים (waitingFor)');
  if (errors.length) return { updated: 0, emails: [], errors };

  const client = new BlocksClient(context);
  const nowIso = new Date().toISOString();
  const rows = await readByIds(client, 'InboundEmails', ids);
  const byId = new Map(rows.map((r) => [str(r.id), r]));
  const results: Item[] = [];
  let updated = 0;

  for (const id of ids) {
    const email = byId.get(id);
    if (!email) {
      errors.push(`המייל ${id} לא נמצא`);
      continue;
    }
    const prevState = str(email.handlingState);
    const patch: Item = { handlingState: state };
    if (state === HS_WAITING) {
      patch.waitingFor = waitingFor;
      patch.waitingSince = prevState === HS_WAITING && str(email.waitingFor) === waitingFor && str(email.waitingSince) ? str(email.waitingSince) : nowIso;
    } else {
      patch.waitingFor = null;
      patch.waitingSince = null;
    }
    if (state === HS_DONE) {
      patch.handledBy = prevState === HS_DONE && str(email.handledBy) ? str(email.handledBy) : by;
      patch.handledAt = prevState === HS_DONE && str(email.handledAt) ? str(email.handledAt) : nowIso;
    } else {
      patch.handledBy = null;
      patch.handledAt = null;
    }
    const changed = Object.keys(patch).some((k) => (str(email[k]) || null) !== (str(patch[k]) || null));
    if (!changed) {
      results.push({ id, handlingState: state, waitingFor: str(email.waitingFor) || null, changed: false });
      continue;
    }
    try {
      await client.updateItem('InboundEmails', id, patch);
      updated += 1;
      const code = str(email.customerCode).trim();
      if (code) {
        const subject = str(email.subject).trim() || '(ללא נושא)';
        const what = state === HS_WAITING ? `ממתין – ${waitingFor}` : state === HS_DONE ? 'טופל' : prevState === HS_DONE ? 'נפתח מחדש (לא טופל)' : 'לא טופל';
        try {
          await client.createItem('Interactions', {
            customerCode: code,
            customerName: str(email.customerName) || null,
            occurredAt: nowIso,
            type: 'הערה',
            direction: 'פנימי',
            actorName: by,
            summary: `מצב טיפול במייל "${subject}": ${what}`,
            relatedInvoiceNumbers: str(email.mentionedInvoiceNumbers) || null,
          });
        } catch (e) {
          errors.push(`Interactions (${id}): ${errText(e)}`);
        }
      }
    } catch (e) {
      errors.push(`${id}: ${errText(e)}`);
    }
  }

  // read back
  const back = await readByIds(client, 'InboundEmails', ids);
  for (const b of back) {
    const prev = results.find((r) => r.id === str(b.id));
    if (prev) continue;
    if (str(b.handlingState) !== state) errors.push(`${str(b.id)}: מצב הטיפול לא נשמר`);
    results.push({
      id: str(b.id),
      handlingState: str(b.handlingState),
      waitingFor: str(b.waitingFor) || null,
      waitingSince: str(b.waitingSince) || null,
      handledBy: str(b.handledBy) || null,
      handledAt: str(b.handledAt) || null,
      changed: true,
    });
  }
  // the emails' tasks (inbox:<id> / verify-sender:<id>) follow the new state now; never fails the update
  const changedIds = results.filter((r) => r.changed).map((r) => str(r.id));
  const taskSync = changedIds.length ? await syncTasksAfterWrite(client, { emailIds: changedIds }, { label: 'SetEmailHandling' }) : null;
  return { updated, emails: results, taskSync, errors };
};
