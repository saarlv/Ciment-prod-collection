import { useState } from 'react';
import { useEntityCreate, useEntityDelete, useEntityGetAll, useEntityUpdate } from '@blocksdiy/blocks-client-sdk/reactSdk';
import type { EntityType } from '@blocksdiy/blocks-client-sdk';
import { ProductLineContactsEntity } from '@/product-types';
import { AgentEmpty } from '@/components/PageStates';
import { StatusBadge } from '@/components/StatusBadge';
import { FieldGroup } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ActiveBadge, ActiveField, HEAD, RoleFormDialog, RolesSection, RowActions, TestMark, TextField, isValidEmail } from '@/components/settings/RolesShared';

type LogisticsContact = EntityType<typeof ProductLineContactsEntity>;

function LogisticsForm({ contact, onOpenChange }: { contact: LogisticsContact | null; onOpenChange: (open: boolean) => void }) {
  const { createFunction } = useEntityCreate(ProductLineContactsEntity);
  const { updateFunction } = useEntityUpdate(ProductLineContactsEntity);
  const [productLine, setProductLine] = useState(contact?.productLine ?? '');
  const [owner, setOwner] = useState(contact?.logisticsOwnerName ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(contact?.whatsapp ?? '');
  const [active, setActive] = useState(contact?.active !== false);
  const canSave = !!productLine.trim() && isValidEmail(email);

  async function save() {
    const data = {
      productLine: productLine.trim(),
      logisticsOwnerName: owner.trim(),
      email: email.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim(),
      active,
    };
    if (contact) await updateFunction({ id: contact.id, data });
    else await createFunction({ data: { ...data, isTestFixture: false } });
  }

  return (
    <RoleFormDialog
      open
      onOpenChange={onOpenChange}
      title={contact ? `עריכת ${contact.productLine || 'איש לוגיסטיקה'}` : 'איש לוגיסטיקה חדש'}
      canSave={canSave}
      onSave={save}
    >
      <FieldGroup>
        <div className="grid gap-[13px] sm:grid-cols-2">
          <TextField id="pl-line" label="קו מוצר" value={productLine} onChange={setProductLine} required />
          <TextField id="pl-owner" label="איש לוגיסטיקה" value={owner} onChange={setOwner} />
          <TextField id="pl-email" label="מייל" type="email" value={email} onChange={setEmail} ltr />
          <TextField id="pl-phone" label="טלפון" type="tel" value={phone} onChange={setPhone} ltr />
        </div>
        <TextField id="pl-whatsapp" label="WhatsApp" type="tel" value={whatsapp} onChange={setWhatsapp} ltr hint="WhatsApp – לא פעיל עדיין. המספר נשמר לשלב שבו יופעל." />
        <ActiveField id="pl-active" checked={active} onChange={setActive} />
      </FieldGroup>
    </RoleFormDialog>
  );
}

/** אנשי לוגיסטיקה לפי קו מוצר: who Maya asks for missing delivery-note scans. */
export function LogisticsContactsSection() {
  const q = useEntityGetAll(ProductLineContactsEntity, { orderBy: [{ column: 'productLine', direction: 'asc' }] });
  const { deleteFunction } = useEntityDelete(ProductLineContactsEntity);
  const [editing, setEditing] = useState<LogisticsContact | 'new' | null>(null);
  const rows = q.data ?? [];

  return (
    <RolesSection
      title="אנשי לוגיסטיקה לפי קו מוצר"
      count={rows.length}
      description="למי מאיה מכינה את הבקשה והתזכורת כשחסרות סריקות של תעודות משלוח."
      addLabel="איש לוגיסטיקה חדש"
      onAdd={() => setEditing('new')}
      isLoading={q.isLoading}
      isError={q.isError}
      errorWhat="אנשי הלוגיסטיקה"
    >
      {rows.length === 0 ? (
        <AgentEmpty agent="maya" title="עוד אין אנשי לוגיסטיקה">
          בלי איש קשר לקו המוצר, הפנייה ללוגיסטיקה נוצרת בלי נמען, והסיבה אומרת את זה.
        </AgentEmpty>
      ) : (
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, 'ps-[21px]')}>קו מוצר</TableHead>
              <TableHead className={HEAD}>איש לוגיסטיקה</TableHead>
              <TableHead className={HEAD}>מייל</TableHead>
              <TableHead className={HEAD}>טלפון</TableHead>
              <TableHead className={HEAD}>WhatsApp</TableHead>
              <TableHead className={HEAD}>פעיל</TableHead>
              <TableHead className={cn(HEAD, 'pe-[21px]')}>
                <span className="sr-only">פעולות</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-glass-faint">
                <TableCell className="ps-[21px] font-semibold">
                  <span className="flex flex-wrap items-center gap-2">
                    {r.productLine || '—'}
                    <TestMark on={r.isTestFixture} />
                  </span>
                </TableCell>
                <TableCell>{r.logisticsOwnerName || '—'}</TableCell>
                <TableCell>
                  <span dir="ltr">{r.email || '—'}</span>
                </TableCell>
                <TableCell>
                  <span dir="ltr">{r.phone || '—'}</span>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span dir="ltr">{r.whatsapp || '—'}</span>
                    <StatusBadge value="לא פעיל עדיין" tone="neutral" />
                  </span>
                </TableCell>
                <TableCell>
                  <ActiveBadge active={r.active} />
                </TableCell>
                <TableCell className="pe-[21px]">
                  <RowActions
                    name={r.productLine || 'איש הלוגיסטיקה'}
                    onEdit={() => setEditing(r)}
                    onDelete={() => deleteFunction({ id: r.id })}
                    deleteNote="פניות ללוגיסטיקה בקו המוצר הזה ייווצרו בלי נמען. אפשר במקום זה לסמן כלא פעיל."
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && <LogisticsForm contact={editing === 'new' ? null : editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </RolesSection>
  );
}