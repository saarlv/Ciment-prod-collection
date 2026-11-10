import { useState } from 'react';
import { useEntityCreate, useEntityDelete, useEntityGetAll, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { CustomersEntity, SalesAgentsEntity } from '@/product-types';
import { AgentEmpty } from '@/components/PageStates';
import { CustomerMultiPicker } from '@/components/inbox/CustomerPicker';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { splitList } from '@/utils/Inbox';
import { ActiveBadge, ActiveField, HEAD, RoleFormDialog, RolesSection, RowActions, TestMark, TextField, isValidEmail } from '@/components/settings/RolesShared';

type SalesAgent = EntityType<typeof SalesAgentsEntity>;

/** The agent's authorised customers as aligned { code, name } pairs (names fall back to the code). */
function authorizedOf(a: Pick<SalesAgent, 'authorizedCustomerCodes' | 'authorizedCustomerNames'>) {
  const codes = splitList(a.authorizedCustomerCodes);
  const names = splitList(a.authorizedCustomerNames);
  return codes.map((code, i) => ({ code, name: names[i] || code }));
}

/** Names are stored comma-separated in the same order as the codes, so a name must not carry a separator. */
const cleanName = (n: string) => n.replace(/[,;\n]+/g, ' ').replace(/\s+/g, ' ').trim();

function AuthorizedCustomers({ agent }: { agent: SalesAgent }) {
  const list = authorizedOf(agent);
  if (!list.length) return <span className="text-xs text-muted-foreground">אין לקוחות מורשים</span>;
  const shown = list.slice(0, 3);
  return (
    <div className="flex max-w-72 flex-wrap gap-1" title={list.map((c) => `${c.name} · ${c.code}`).join('\n')}>
      {shown.map((c) => (
        <Badge key={c.code} variant="secondary">
          {c.name}
        </Badge>
      ))}
      {list.length > shown.length && <Badge variant="outline">+{list.length - shown.length}</Badge>}
    </div>
  );
}

function SalesAgentForm({ agent, onOpenChange }: { agent: SalesAgent | null; onOpenChange: (open: boolean) => void }) {
  const { createFunction } = useEntityCreate(SalesAgentsEntity);
  const { updateFunction } = useEntityUpdate(SalesAgentsEntity);
  const customers = useEntityGetAll(CustomersEntity, { orderBy: [{ column: 'customerName', direction: 'asc' }] });
  const [name, setName] = useState(agent?.agentName ?? '');
  const [email, setEmail] = useState(agent?.email ?? '');
  const [phone, setPhone] = useState(agent?.phone ?? '');
  const [managerName, setManagerName] = useState(agent?.managerName ?? '');
  const [managerEmail, setManagerEmail] = useState(agent?.managerEmail ?? '');
  const [active, setActive] = useState(agent?.active !== false);
  const previous = agent ? authorizedOf(agent) : [];
  const [codes, setCodes] = useState<string[]>(previous.map((c) => c.code));

  const nameByCode = new Map<string, string>();
  for (const c of customers.data ?? []) if (c.customerCode) nameByCode.set(c.customerCode, c.customerName || c.customerCode);
  const canSave = !!name.trim() && isValidEmail(email) && isValidEmail(managerEmail);

  async function save() {
    const names = codes.map((code) => cleanName(nameByCode.get(code) ?? previous.find((p) => p.code === code)?.name ?? code) || code);
    const data = {
      agentName: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      managerName: managerName.trim(),
      managerEmail: managerEmail.trim(),
      active,
      authorizedCustomerCodes: codes.join(', '),
      authorizedCustomerNames: names.join(', '),
    };
    if (agent) await updateFunction({ id: agent.id, data });
    else await createFunction({ data: { ...data, isTestFixture: false } });
  }

  return (
    <RoleFormDialog
      open
      onOpenChange={onOpenChange}
      title={agent ? `עריכת ${agent.agentName || 'סוכן'}` : 'סוכן חדש'}
      description="השם כמו שהוא מופיע בכרטיס הלקוח ב-Priority."
      canSave={canSave}
      onSave={save}
    >
      <FieldGroup>
        <TextField id="sa-name" label="שם הסוכן" value={name} onChange={setName} required />
        <div className="grid gap-[13px] sm:grid-cols-2">
          <TextField id="sa-email" label="מייל" type="email" value={email} onChange={setEmail} ltr />
          <TextField id="sa-phone" label="טלפון" type="tel" value={phone} onChange={setPhone} ltr />
          <TextField id="sa-manager" label="מנהל מאשר" value={managerName} onChange={setManagerName} />
          <TextField id="sa-manager-email" label="מייל המנהל" type="email" value={managerEmail} onChange={setManagerEmail} ltr />
        </div>
        <Field>
          <FieldLabel htmlFor="sa-customers">לקוחות שהסוכן מורשה לבקש בשמם</FieldLabel>
          <CustomerMultiPicker id="sa-customers" value={codes} onChange={setCodes} />
          <FieldDescription>כרטסת וחובות פתוחים. מייל מכתובת הסוכן על אחד מהלקוחות האלה נחשב מאומת.</FieldDescription>
        </Field>
        <ActiveField id="sa-active" checked={active} onChange={setActive} />
      </FieldGroup>
    </RoleFormDialog>
  );
}

/** סוכנים ומנהלי מכירות: who approves a disputed price, and which customers each agent may request documents for. */
export function SalesAgentsSection() {
  const q = useEntityGetAll(SalesAgentsEntity, { orderBy: [{ column: 'agentName', direction: 'asc' }] });
  const { deleteFunction } = useEntityDelete(SalesAgentsEntity);
  const [editing, setEditing] = useState<SalesAgent | 'new' | null>(null);
  const rows = q.data ?? [];

  return (
    <RolesSection
      title="סוכנים ומנהלי מכירות"
      count={rows.length}
      description={
        <>
          מייל מסוכן מורשה על אחד הלקוחות שלו נחשב <strong className="font-semibold text-foreground">מאומת</strong>. מחיר במחלוקת מאשר קודם הסוכן, אחריו
          המנהל; הם לא נכנסים לאפליקציה.
        </>
      }
      addLabel="סוכן חדש"
      onAdd={() => setEditing('new')}
      isLoading={q.isLoading}
      isError={q.isError}
      errorWhat="הסוכנים"
    >
      {rows.length === 0 ? (
        <AgentEmpty agent="maya" title="עוד אין סוכנים">
          בלי סוכן ברשימה, בקשת אישור מחיר נוצרת בלי נמען, ומייל מסוכן לא יכול להיות מאומת.
        </AgentEmpty>
      ) : (
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>סוכן</TableHead>
              <TableHead className={HEAD}>מייל וטלפון</TableHead>
              <TableHead className={HEAD}>מנהל מאשר</TableHead>
              <TableHead className={HEAD}>לקוחות מורשים</TableHead>
              <TableHead className={HEAD}>פעיל</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>
                <span className="sr-only">פעולות</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-glass-faint">
                <TableCell className="ps-[21px] align-top font-semibold">
                  <span className="flex flex-wrap items-center gap-2">
                    {r.agentName || '—'}
                    <TestMark on={r.isTestFixture} />
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-col gap-0.5 text-[13px]" dir="ltr">
                    <span>{r.email || '—'}</span>
                    {r.phone && <span className="text-xs text-muted-foreground">{r.phone}</span>}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-col gap-0.5 text-[13px]">
                    <span>{r.managerName || '—'}</span>
                    {r.managerEmail && (
                      <span dir="ltr" className="self-end text-xs text-muted-foreground">
                        {r.managerEmail}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <AuthorizedCustomers agent={r} />
                </TableCell>
                <TableCell className="align-top">
                  <ActiveBadge active={r.active} />
                </TableCell>
                <TableCell className="pe-[21px] align-top">
                  <RowActions
                    name={r.agentName || 'הסוכן'}
                    onEdit={() => setEditing(r)}
                    onDelete={() => deleteFunction({ id: r.id })}
                    deleteNote="בקשות אישור מחיר חדשות לא יגיעו אליו, ומיילים ממנו לא ייחשבו מאומתים. אפשר במקום זה לסמן אותו כלא פעיל."
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <SalesAgentForm agent={editing === 'new' ? null : editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </RolesSection>
  );
}