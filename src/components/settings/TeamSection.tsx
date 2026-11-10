import { useState } from 'react';
import { useEntityCreate, useEntityDelete, useEntityGetAll, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { TeamMembersEntity } from '@/product-types';
import type { TeamMembersEntityRoleEnum } from '@/product-types';
import { AgentEmpty } from '@/components/PageStates';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ActiveBadge, ActiveField, HEAD, RoleFormDialog, RolesSection, RowActions, TextField, isValidEmail } from '@/components/settings/RolesShared';

type TeamMember = EntityType<typeof TeamMembersEntity>;

const ROLES: TeamMembersEntityRoleEnum[] = ['מנהלת חשבונות', 'מנהל גבייה', 'סמנכ״ל כספים'];
const ROLE_ITEMS = [{ label: 'בחירת תפקיד', value: null as TeamMembersEntityRoleEnum | null }, ...ROLES.map((r) => ({ label: r, value: r as TeamMembersEntityRoleEnum | null }))];

function TeamForm({ member, onOpenChange }: { member: TeamMember | null; onOpenChange: (open: boolean) => void }) {
  const { createFunction } = useEntityCreate(TeamMembersEntity);
  const { updateFunction } = useEntityUpdate(TeamMembersEntity);
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState<TeamMembersEntityRoleEnum | null>(member?.role ?? null);
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [active, setActive] = useState(member?.active !== false);
  const canSave = !!name.trim() && isValidEmail(email);

  async function save() {
    const data = { name: name.trim(), role: role ?? undefined, email: email.trim(), phone: phone.trim(), active };
    if (member) await updateFunction({ id: member.id, data });
    else await createFunction({ data });
  }

  return (
    <RoleFormDialog open onOpenChange={onOpenChange} title={member ? `עריכת ${member.name || 'איש צוות'}` : 'איש צוות חדש'} canSave={canSave} onSave={save}>
      <FieldGroup>
        <div className="grid gap-[13px] sm:grid-cols-2">
          <TextField id="tm-name" label="שם" value={name} onChange={setName} required />
          <Field>
            <FieldLabel htmlFor="tm-role">תפקיד</FieldLabel>
            <Select items={ROLE_ITEMS} value={role} onValueChange={(v) => setRole((v as TeamMembersEntityRoleEnum | null) ?? null)}>
              <SelectTrigger id="tm-role" className="w-full bg-glass-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ROLE_ITEMS.map((i) => (
                    <SelectItem key={i.value ?? 'none'} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <TextField id="tm-email" label="מייל" type="email" value={email} onChange={setEmail} ltr hint="״שלי״ מזהה אותך לפי המייל הזה." />
          <TextField id="tm-phone" label="טלפון נייד" type="tel" value={phone} onChange={setPhone} ltr hint="בשורת הסיום של ה-PDF ובנוסח המיילים." />
        </div>
        <ActiveField id="tm-active" checked={active} onChange={setActive} />
      </FieldGroup>
    </RoleFormDialog>
  );
}

/** צוות: the collections team — the phone is the one in the statement PDF's closing line and in mail wording. */
export function TeamSection() {
  const q = useEntityGetAll(TeamMembersEntity, { orderBy: [{ column: 'name', direction: 'asc' }] });
  const { deleteFunction } = useEntityDelete(TeamMembersEntity);
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null);
  const rows = q.data ?? [];

  return (
    <RolesSection
      title="צוות"
      count={rows.length}
      description="הטלפון של כל מנהלת חשבונות מופיע בשורת הסיום של ה-PDF ובנוסח המיילים. ״שלי״ מזהה אותך לפי המייל ברשימה."
      addLabel="איש צוות חדש"
      onAdd={() => setEditing('new')}
      isLoading={q.isLoading}
      isError={q.isError}
      errorWhat="רשימת הצוות"
    >
      {rows.length === 0 ? (
        <AgentEmpty title="רשימת הצוות עדיין ריקה">
          עד שהצוות יוזן, ״שלי״ עובד לפי ״צפייה בתור״ בסרגל העליון, ובשורת הסיום של ה-PDF אין טלפון.
        </AgentEmpty>
      ) : (
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>שם</TableHead>
              <TableHead className={HEAD}>תפקיד</TableHead>
              <TableHead className={HEAD}>מייל</TableHead>
              <TableHead className={HEAD}>טלפון</TableHead>
              <TableHead className={HEAD}>פעיל</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>
                <span className="sr-only">פעולות</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id} className="hover:bg-glass-faint">
                <TableCell className="ps-[21px] font-semibold">{m.name || '—'}</TableCell>
                <TableCell>{m.role || '—'}</TableCell>
                <TableCell>
                  <span dir="ltr">{m.email || '—'}</span>
                </TableCell>
                <TableCell>
                  {m.phone ? (
                    <span dir="ltr">{m.phone}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{m.role === 'מנהלת חשבונות' ? 'חסר – לא יופיע ב-PDF' : '—'}</span>
                  )}
                </TableCell>
                <TableCell>
                  <ActiveBadge active={m.active} />
                </TableCell>
                <TableCell className="pe-[21px]">
                  <RowActions
                    name={m.name || 'איש הצוות'}
                    onEdit={() => setEditing(m)}
                    onDelete={() => deleteFunction({ id: m.id })}
                    deleteNote="הלקוחות שלו יישארו משויכים בשמו, אבל ״שלי״ לא יזהה אותו יותר. אפשר במקום זה לסמן כלא פעיל."
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <TeamForm member={editing === 'new' ? null : editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </RolesSection>
  );
}