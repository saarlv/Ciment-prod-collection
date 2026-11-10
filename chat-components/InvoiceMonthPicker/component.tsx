const OPEN_STATUSES = ['פתוחה', 'שולמה חלקית'];
const CREDIT_DOC = 'חשבונית זיכוי';

function formatIls(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('he-IL', { maximumFractionDigits: 0 }) + ' ₪';
}

function formatDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function monthKeyOf(inv) {
  if (inv.dueMonth && /^\d{4}-\d{2}/.test(inv.dueMonth)) return inv.dueMonth.slice(0, 7);
  if (inv.dueDate) return String(inv.dueDate).slice(0, 7);
  return 'none';
}

function monthLabel(key) {
  if (key === 'none') return 'ללא תאריך פירעון';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function openAmountOf(inv) {
  if (typeof inv.remainingAmount === 'number') return inv.remainingAmount;
  return Number(inv.openAmount) || 0;
}

function subStatusVariant(s) {
  if (s === 'בבירור') return 'destructive';
  if (s === 'הובטחה') return 'secondary';
  return 'outline';
}

function InvoiceMonthPicker(props) {
  const { customerCode, preselectedInvoiceNumbers, prompt } = props;

  const { data, isLoading, isError } = BlocksClientReactSdk.useEntityGetAll(
    ProductTypes.InvoicesEntity,
    {
      where: {
        and: [
          { column: 'customerCode', value: customerCode },
          { column: 'status', operator: 'in', value: OPEN_STATUSES },
        ],
      },
      orderBy: [{ column: 'dueDate', direction: 'asc' }],
    },
    { enabled: !!customerCode },
  );

  const [selected, setSelected] = React.useState(
    () => new Set((preselectedInvoiceNumbers || []).map((x) => String(x).trim())),
  );
  const [sent, setSent] = React.useState(null);

  const invoices = React.useMemo(
    () =>
      (data || []).filter(
        (inv) =>
          inv.invoiceNumber &&
          inv.documentType !== CREDIT_DOC &&
          inv.subStatus !== 'סגורה' &&
          openAmountOf(inv) > 0,
      ),
    [data],
  );

  const groups = React.useMemo(() => {
    const map = new Map();
    for (const inv of invoices) {
      const k = monthKeyOf(inv);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(inv);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === 'none' ? 1 : b[0] === 'none' ? -1 : a[0].localeCompare(b[0])))
      .map(([key, items]) => ({
        key,
        label: monthLabel(key),
        items,
        total: items.reduce((s, i) => s + openAmountOf(i), 0),
      }));
  }, [invoices]);

  const chosen = invoices.filter((i) => selected.has(String(i.invoiceNumber)));
  const chosenTotal = chosen.reduce((s, i) => s + openAmountOf(i), 0);
  const locked = !!sent;

  const toggleOne = (num, on) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(num);
      else next.delete(num);
      return next;
    });
  };

  const toggleMonth = (items, on) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        const n = String(i.invoiceNumber);
        if (on) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  };

  const confirm = () => {
    if (locked || chosen.length === 0) return;
    const nums = chosen.map((i) => i.invoiceNumber);
    const content = 'בחרתי את החשבוניות: ' + nums.join(', ') + ' (סה״כ ' + formatIls(chosenTotal) + ')';
    setSent({ nums, total: chosenTotal });
    sendMessage({ content });
  };

  const shell = {
    direction: 'rtl',
    width: '100%',
    maxWidth: 520,
    background: 'color-mix(in oklab, var(--card) 88%, transparent)',
    backdropFilter: 'blur(10px)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: 'var(--foreground)',
  };

  if (!customerCode) {
    return (
      <div style={shell} dir="rtl">
        <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>לא התקבל קוד לקוח להצגת חשבוניות.</div>
      </div>
    );
  }

  return (
    <div style={shell} dir="rtl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{prompt || 'על אילו חשבוניות מדובר?'}</div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          {locked ? 'הבחירה נשלחה' : 'סמנו חשבוניות או חודש שלם'}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : isError ? (
        <div style={{ fontSize: 13, color: 'var(--destructive)' }}>לא הצלחנו לטעון את החשבוניות. נסו שוב בעוד רגע.</div>
      ) : groups.length === 0 ? (
        <div
          style={{
            padding: '18px 8px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--muted-foreground)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
          }}
        >
          אין חשבוניות פתוחות ללקוח הזה
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', paddingInlineEnd: 2 }}>
          {groups.map((g) => {
            const selCount = g.items.filter((i) => selected.has(String(i.invoiceNumber))).length;
            const all = selCount === g.items.length;
            const some = selCount > 0 && !all;
            if (locked && selCount === 0) return null;
            return (
              <div
                key={g.key}
                style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--background)' }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'color-mix(in oklab, var(--primary) 6%, var(--background))',
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  <Checkbox
                    checked={all}
                    indeterminate={some}
                    disabled={locked}
                    onCheckedChange={() => toggleMonth(g.items, !all)}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{g.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    {g.items.length} חש׳ · {formatIls(g.total)}
                  </span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {g.items.map((inv) => {
                    const num = String(inv.invoiceNumber);
                    const on = selected.has(num);
                    if (locked && !on) return null;
                    return (
                      <label
                        key={inv.id || num}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 10px',
                          borderTop: '1px solid var(--border)',
                          cursor: locked ? 'default' : 'pointer',
                          background: on ? 'color-mix(in oklab, var(--primary) 5%, transparent)' : 'transparent',
                        }}
                      >
                        <Checkbox checked={on} disabled={locked} onCheckedChange={(v) => toggleOne(num, !!v)} />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{num}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>פירעון {formatDate(inv.dueDate)}</span>
                        </div>
                        {inv.subStatus && inv.subStatus !== 'פתוחה' ? (
                          <Badge variant={subStatusVariant(inv.subStatus)}>{inv.subStatus}</Badge>
                        ) : null}
                        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 76, textAlign: 'left' }}>
                          {formatIls(openAmountOf(inv))}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && groups.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              נבחרו {locked ? sent.nums.length : chosen.length} חשבוניות
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)' }}>
              {formatIls(locked ? sent.total : chosenTotal)}
            </span>
          </div>
          {locked ? (
            <Badge variant="secondary">נשלח ✓</Badge>
          ) : (
            <Button onClick={confirm} disabled={chosen.length === 0}>
              בחרתי
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

render(<InvoiceMonthPicker {...props} />);
