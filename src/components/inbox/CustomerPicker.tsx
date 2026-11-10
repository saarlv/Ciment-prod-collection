import { useEntityGetAll } from '@blocksdiy/blocks-client-sdk/reactSdk';
import { CustomersEntity } from '@/product-types';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';

/** Customers as { code → "name · code" } for the pickers. */
export function useCustomerLabels() {
  const q = useEntityGetAll(CustomersEntity, { orderBy: [{ column: 'customerName', direction: 'asc' }] });
  const label = new Map<string, string>();
  for (const c of q.data ?? []) if (c.customerCode) label.set(c.customerCode, `${c.customerName || c.customerCode} · ${c.customerCode}`);
  return { codes: [...label.keys()], label, isLoading: q.isLoading };
}

/** Search-as-you-type single customer picker (value = customer code, empty = none). */
export function CustomerPicker({
  id,
  value,
  onChange,
  placeholder = 'כל הלקוחות',
  className,
}: {
  id?: string;
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const { codes, label } = useCustomerLabels();
  const items = value && !label.has(value) ? [value, ...codes] : codes;
  return (
    <Combobox
      items={items}
      value={value}
      onValueChange={(v) => onChange((v as string | null) || null)}
      itemToStringLabel={(code) => label.get(code as string) ?? (code as string)}
    >
      <ComboboxInput id={id} placeholder={placeholder} showClear={!!value} className={className} />
      <ComboboxContent>
        <ComboboxEmpty>לא נמצא לקוח.</ComboboxEmpty>
        <ComboboxList>
          {(code: string) => (
            <ComboboxItem key={code} value={code}>
              {label.get(code) ?? code}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Multi customer picker with chips (value = customer codes). */
export function CustomerMultiPicker({ id, value, onChange }: { id?: string; value: string[]; onChange: (codes: string[]) => void }) {
  const { codes, label } = useCustomerLabels();
  const anchor = useComboboxAnchor();
  const items = [...new Set([...value, ...codes])];
  return (
    <Combobox
      multiple
      items={items}
      value={value}
      onValueChange={(v) => onChange((v as string[] | null) ?? [])}
      itemToStringLabel={(code) => label.get(code as string) ?? (code as string)}
    >
      <ComboboxChips ref={anchor} className="bg-glass-card">
        {value.map((code) => (
          <ComboboxChip key={code}>{label.get(code)?.split(' · ')[0] ?? code}</ComboboxChip>
        ))}
        <ComboboxChipsInput id={id} placeholder={value.length ? '' : 'חיפוש לקוח…'} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>לא נמצא לקוח.</ComboboxEmpty>
        <ComboboxList>
          {(code: string) => (
            <ComboboxItem key={code} value={code}>
              {label.get(code) ?? code}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}