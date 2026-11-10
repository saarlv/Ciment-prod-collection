import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AgingCards } from '@/components/aging/AgingCards';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_VIEW, bucketsOf } from '@/utils/AgingPanel';
import type { AgingCustomer } from '@/utils/CollectionsTypes';

const CUSTOMER: AgingCustomer = {
  customerCode: 'TEST-009',
  customerName: 'בדיקה – מגדלי השרון',
  priorityStatus: 'פעיל',
  paymentMethod: 'העברה בנקאית',
  paymentTermsLabel: 'שוטף+60',
  salesAgentName: 'סוכן צפון',
  contact: null,
  priorDebt: { amount: 30000 },
  months: [
    { monthKey: '2026-10', label: 'אוקטובר 2026', amount: 0 },
    { monthKey: '2026-11', label: 'נובמבר 2026', amount: -2500 },
  ],
  laterDebt: { amount: 0 },
  total: 27500,
  ledgerBalance: 28000,
  balanceDiff: 500,
  balanceMatches: false,
};

function renderCards(columns = DEFAULT_VIEW.columns) {
  const buckets = bucketsOf([
    { monthKey: '2026-10', label: 'אוקטובר 2026' },
    { monthKey: '2026-11', label: 'נובמבר 2026' },
  ]);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <AgingCards
          customers={[CUSTOMER]}
          buckets={buckets}
          focus="all"
          totals={{ priorDebt: 30000, months: [{ monthKey: '2026-10', amount: 0 }, { monthKey: '2026-11', amount: -2500 }], laterDebt: 0, total: 27500, customers: 1 }}
          totalsLabel="סה״כ"
          columns={columns}
          renderNotes={(c, b) => <span data-testid="chip">{`${c.customerCode}:${b.key}`}</span>}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('AgingCards (movements)', () => {
  it('shows one total per period, negative amounts as is, and a chip per period from renderNotes', () => {
    renderCards();
    const row = within(screen.getByRole('list', { name: 'לקוחות בדוח' })).getAllByRole('listitem')[0];
    expect(within(row).getByLabelText(/חוב קודם/)).toHaveTextContent('30,000');
    expect(within(row).getByLabelText('אוקטובר 2026: אין חוב')).toBeInTheDocument();
    expect(within(row).getByLabelText(/נובמבר 2026/).textContent).toContain('−');
    expect(within(row).getAllByTestId('chip').map((c) => c.textContent)).toEqual(['TEST-009:prior', 'TEST-009:2026-10', 'TEST-009:2026-11', 'TEST-009:later']);
  });

  it('marks a total that differs from the Priority ledger balance with the difference', () => {
    renderCards();
    expect(screen.getByLabelText(/יתרת הכרטיס בפריוריטי שונה מהסה״כ/)).toHaveTextContent('500');
  });

  it('hides the chips when the notes column is off', () => {
    renderCards({ ...DEFAULT_VIEW.columns, notes: false });
    expect(screen.queryByTestId('chip')).not.toBeInTheDocument();
  });
});