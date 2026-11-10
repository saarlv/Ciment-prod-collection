import { useState } from 'react';
import { CheckIcon, ChevronDownIcon, Columns3Icon, RotateCcwIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FILTERS, SORTS, isDefaultView } from '@/utils/AgingPanel';
import type { AgingColumns, AgingView, Bucket, FilterKey, SortKey } from '@/utils/AgingPanel';
import { AG_MENU, AG_PRIMARY_BTN, AG_SECONDARY_BTN } from '@/utils/AgingStyle';
import type { AgingCustomer } from '@/utils/CollectionsTypes';

const COLUMN_LABELS: { key: keyof AgingColumns; label: string }[] = [
  { key: 'details', label: 'סטטוס ותנאי גבייה (אמצעי, תנאים, הערה לגבייה)' },
  { key: 'agent', label: 'סוכן מטעם סימנט' },
  { key: 'contact', label: 'איש קשר של הלקוח' },
  { key: 'notes', label: 'הערות בחודשים' },
];

/** One segment of the toolbar's segmented group: borderless, separated by thin rules. */
const SEGMENT =
  'h-9 rounded-none border-0 bg-transparent px-4 text-sm font-normal text-ag-ink shadow-none hover:bg-ag-page hover:text-ag-ink aria-expanded:bg-ag-page dark:bg-transparent dark:hover:bg-ag-page';

function SegmentSeparator() {
  return <Separator orientation="vertical" className="my-2 h-auto bg-ag-border" />;
}

function SegmentSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T;
  items: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v !== null && onChange(v as T)}>
      <SelectTrigger aria-label={label} className={cn(SEGMENT, 'w-auto gap-2')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={AG_MENU}>
        <SelectGroup>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * "כל הלקוחות ⌄": pick customers, and — under "מצב גבייה" — the four note filters of Design 02 section 7 (any
 * checked one shows the customer; logic in AgingMonths.customerFlags).
 * A checked box filters at once; "ניקוי" clears them, "החלה" closes the menu.
 */
function CustomersMenu({
  customers,
  selected,
  filters,
  onCustomers,
  onFilters,
}: {
  customers: AgingCustomer[];
  selected: string[];
  filters: FilterKey[];
  onCustomers: (codes: string[]) => void;
  onFilters: (filters: FilterKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const picked = new Set(selected);
  const names = customers.filter((c) => picked.has(c.customerCode ?? ''));
  const label =
    selected.length === 0 ? 'כל הלקוחות' : names.length === 1 ? (names[0].customerName ?? names[0].customerCode) : `${selected.length} לקוחות`;
  const toggleCustomer = (code: string) => onCustomers(picked.has(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const toggleFilter = (f: FilterKey, on: boolean) => onFilters(on ? [...filters.filter((x) => x !== f), f] : filters.filter((x) => x !== f));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" className={cn(SEGMENT, 'max-w-64')} />}>
        <span className="truncate">{label}</span>
        {filters.length > 0 && (
          <Badge aria-label={`${filters.length} מסננים פעילים`} className="h-5 min-w-5 rounded-full bg-ag-cobalt px-1.5 text-xs font-bold text-ag-on-cobalt">
            {filters.length}
          </Badge>
        )}
        <ChevronDownIcon data-icon="inline-end" className="text-ag-muted" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(AG_MENU, 'w-80 gap-2 p-2')}>
        <Command className="rounded-[8px] bg-transparent">
          <CommandInput placeholder="חיפוש לקוח" />
          <CommandList className="max-h-52">
            <CommandEmpty>אין לקוח בשם הזה בדוח.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__ כל הלקוחות" onSelect={() => onCustomers([])}>
                <CheckIcon className={cn(selected.length === 0 ? 'opacity-100' : 'opacity-0')} />
                כל הלקוחות
              </CommandItem>
              {customers.map((c) => {
                const code = c.customerCode ?? '';
                return (
                  <CommandItem key={code} value={`${c.customerName ?? ''} ${code}`} onSelect={() => toggleCustomer(code)}>
                    <CheckIcon className={cn(picked.has(code) ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex-1 truncate">{c.customerName || code}</span>
                    <span className="text-xs text-ag-muted">{code}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <Separator className="bg-ag-border" />

        <FieldSet className="gap-0 px-2.5">
          <FieldLegend variant="label" className="mb-1 pt-1.5 text-xs font-semibold text-ag-muted">
            מצב גבייה
          </FieldLegend>
          <FieldGroup data-slot="checkbox-group" className="gap-0">
            {FILTERS.map((f) => (
              <Field key={f.value} orientation="horizontal" className="py-[7px]">
                <Checkbox
                  id={`aging-filter-${f.value}`}
                  checked={filters.includes(f.value)}
                  onCheckedChange={(on) => toggleFilter(f.value, on)}
                  className="border-ag-btn-border bg-ag-surface data-checked:border-ag-cobalt data-checked:bg-ag-cobalt data-checked:text-ag-on-cobalt dark:data-checked:bg-ag-cobalt"
                />
                <FieldLabel htmlFor={`aging-filter-${f.value}`} className="text-sm font-normal">
                  {f.label}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
          {filters.length > 1 && <span className="pb-1 text-xs text-ag-muted">מוצג לקוח שעונה על אחד מהם</span>}
        </FieldSet>

        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <Button variant="outline" size="sm" className={AG_SECONDARY_BTN} onClick={() => onFilters([])} disabled={filters.length === 0}>
            ניקוי
          </Button>
          <Button size="sm" className={AG_PRIMARY_BTN} onClick={() => setOpen(false)}>
            החלה
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The report's controls as one segmented group — customers (with the collection-status filters), month
 * focus, sort, columns — and the search on the left. Everything works on the report already on screen
 * and is kept in this browser.
 */
export function AgingToolbar({
  view,
  update,
  reset,
  customers,
  buckets,
  focus,
  search,
  onSearch,
}: {
  view: AgingView;
  update: (patch: Partial<AgingView>) => void;
  reset: () => void;
  customers: AgingCustomer[];
  buckets: Bucket[];
  /** The focus in effect (a saved month outside the window falls back to all). */
  focus: string;
  search: string;
  onSearch: (v: string) => void;
}) {
  const focusItems = [{ label: 'כל החודשים', value: 'all' }, ...buckets.map((b) => ({ label: b.label, value: String(b.key) }))];
  const changed = !isDefaultView(view) || search.trim() !== '';

  return (
    <div className="flex flex-wrap items-center gap-[13px]">
      <div role="group" aria-label="תצוגת הדוח" className="flex items-stretch overflow-hidden rounded-[6px] border border-ag-btn-border bg-ag-surface">
        <CustomersMenu
          customers={customers}
          selected={view.customers}
          filters={view.filters}
          onCustomers={(codes) => update({ customers: codes })}
          onFilters={(filters) => update({ filters })}
        />
        <SegmentSeparator />
        <SegmentSelect label="חודש בפוקוס" value={focus} items={focusItems} onChange={(v) => update({ focus: v })} />
        <SegmentSeparator />
        <SegmentSelect<SortKey>
          label="מיון"
          value={view.sort}
          items={SORTS.map((s) => ({ label: `מיון: ${s.label}`, value: s.value }))}
          onChange={(v) => update({ sort: v })}
        />
        <SegmentSeparator />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className={SEGMENT} />}>
            <Columns3Icon data-icon="inline-start" className="text-ag-muted" />
            עמודות
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={cn(AG_MENU, 'w-64')}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>מה להציג</DropdownMenuLabel>
              {COLUMN_LABELS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={view.columns[c.key]}
                  onCheckedChange={(on) => update({ columns: { ...view.columns, [c.key]: on } })}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {changed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            onSearch('');
          }}
          className="rounded-[6px] text-ag-muted hover:bg-ag-page hover:text-ag-ink"
        >
          <RotateCcwIcon data-icon="inline-start" />
          איפוס התצוגה
        </Button>
      )}
      <InputGroup className="h-9 w-full max-w-64 rounded-[6px] border-ag-btn-border bg-ag-surface sm:ms-auto dark:bg-ag-surface">
        <InputGroupAddon>
          <SearchIcon className="text-ag-muted" />
        </InputGroupAddon>
        <InputGroupInput value={search} onChange={(e) => onSearch(e.target.value)} placeholder="שם או קוד לקוח" aria-label="חיפוש לקוח בדוח" />
      </InputGroup>
    </div>
  );
}