import { describe, expect, it } from 'vitest';
import {
  fncReadInput, movementDocType, movementsFromFncHeader, priorityMovementsSource,
} from '../../shared/priority-movements-source.ts';

const noInvoices = new Map<string, string | null>();

describe('FNCTRANS line → PriorityMovement', () => {
  it('121205 receipt left on account: two open lines → two קבלה movements of −61,820.60', () => {
    const header = {
      FNCNUM: '25028956', BALDATE: '2025-11-12T00:00:00+02:00', FNCDATE: '2025-11-30T00:00:00+02:00', DETAILS: 'קבלה',
      FNCITEMS_SUBFORM: [
        { KLINE: 1, ACCNAME: '121205', FNCIREF1: null, DEBIT1: 0, CREDIT1: 61820.6, FRECONNUM: 0, DETAILS: 'קבלה', FNCDATE: '2025-11-30T00:00:00+02:00' },
        { KLINE: 2, ACCNAME: '121205', FNCIREF1: null, DEBIT1: 0, CREDIT1: 61820.6, FRECONNUM: 0, DETAILS: 'קבלה', FNCDATE: '2025-11-30T00:00:00+02:00' },
        // another account on the same transaction, and a reconciled line: never movements of 121205
        { KLINE: 3, ACCNAME: '400100', FNCIREF1: null, DEBIT1: 123641.2, CREDIT1: 0, FRECONNUM: 0 },
        { KLINE: 4, ACCNAME: '121205', FNCIREF1: null, DEBIT1: 0, CREDIT1: 5, FRECONNUM: 991 },
      ],
    };
    const m = movementsFromFncHeader(header, '121205', noInvoices);
    expect(m).toEqual([
      { customerCode: '121205', movementId: '25028956:1', docType: 'קבלה', docNumber: '25028956', docDate: '2025-11-12', dueDate: '2025-11-30', amount: -61820.6, details: 'קבלה' },
      { customerCode: '121205', movementId: '25028956:2', docType: 'קבלה', docNumber: '25028956', docDate: '2025-11-12', dueDate: '2025-11-30', amount: -61820.6, details: 'קבלה' },
    ]);
  });

  it('credit note C2570091: CREDIT1 3,131,624.42 → זיכוי, docNumber is FNCIREF1, header dates/details as fallback', () => {
    const header = {
      FNCNUM: '25031002', BALDATE: '2025-10-01T00:00:00+03:00', FNCDATE: '2025-10-31T00:00:00+02:00', DETAILS: 'חשבונית זיכוי',
      FNCITEMS_SUBFORM: [{ KLINE: 1, ACCNAME: '121205', FNCIREF1: 'C2570091', DEBIT1: 0, CREDIT1: 3131624.42, FRECONNUM: 0, DETAILS: null, FNCDATE: null }],
    };
    for (const types of [noInvoices, new Map([['C2570091', 'חשבונית זיכוי']])]) {
      const [m] = movementsFromFncHeader(header, '121205', types);
      expect(m).toEqual({
        customerCode: '121205', movementId: '25031002:1', docType: 'זיכוי', docNumber: 'C2570091',
        docDate: '2025-10-01', dueDate: '2025-10-31', amount: -3131624.42, details: 'חשבונית זיכוי',
      });
    }
  });

  it('docType rules', () => {
    expect(movementDocType('IN250001', 1000, 'חשבונית')).toBe('חשבונית');
    expect(movementDocType('IN250001', 1000, '')).toBe('חשבונית');
    expect(movementDocType('C2570091', 500, 'חשבונית זיכוי')).toBe('זיכוי');
    expect(movementDocType('C2570091', -500, null)).toBe('זיכוי');
    expect(movementDocType(null, -10, null)).toBe('קבלה');
    expect(movementDocType(null, 10, null)).toBe('פקודת יומן');
    expect(movementDocType('IN250001', 1000, null)).toBe('אחר');
    expect(movementDocType(null, 0, null)).toBe('אחר');
  });

  it('read input: one customer, BALDATE cutoff unless full history, open lines only', () => {
    const r = fncReadInput("12'05", '2024-01-01', 300);
    expect(r.filter).toBe("(ACCNAME1 eq '12''05' or ACCNAME2 eq '12''05') and BALDATE ge 2024-01-01T00:00:00+02:00");
    expect(r.expand).toContain("FNCITEMS_SUBFORM($filter=ACCNAME eq '12''05' and FRECONNUM eq 0;");
    expect([r.top, r.skip, r.entityName]).toEqual([300, 300, 'FNCTRANS']);
    expect(fncReadInput('1', null, 0).filter).toBe("(ACCNAME1 eq '1' or ACCNAME2 eq '1')");
  });
});

describe('priorityMovementsSource', () => {
  it('reads customers one at a time, pages while full, a failed customer is incomplete and left out of customers', async () => {
    const calls: any[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const full = Array.from({ length: 300 }, (_, i) => ({ FNCNUM: `F${i}`, BALDATE: '2025-01-01', FNCITEMS_SUBFORM: [] }));
    const client: any = {
      queryTable: async () => ({ items: [] }),
      invokeAction: async (name: string, input: any) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        calls.push({ name, ...input });
        if (input.filter.includes("'BAD'")) throw Object.assign(new Error('400 bad request'), { statusCode: 400 });
        if (input.filter.includes("'A1'")) {
          if (!input.skip) return { data: { value: full } };
          return { data: { value: [{ FNCNUM: 'F900', BALDATE: '2023-05-01', FNCITEMS_SUBFORM: [{ KLINE: 1, ACCNAME: 'A1', DEBIT1: 100, CREDIT1: 0, FRECONNUM: 0 }] }] } };
        }
        return { data: { value: [] } };
      },
    };
    const r = await priorityMovementsSource.fetchOpenMovements({ client, customerCodes: ['A1', 'BAD', 'A3'], cutoff: '2024-01-01', fullHistory: true, dryRun: true });
    expect(maxInFlight).toBe(1);
    expect(calls.every((c) => c.name === 'ReadEntitySet')).toBe(true);
    expect(calls.filter((c) => c.filter.includes("'A1'")).map((c) => c.skip ?? 0)).toEqual([0, 300]);
    expect(r.customers).toEqual(['A1', 'A3']);
    expect(r.incomplete?.map((x) => x.customerCode)).toEqual(['BAD']);
    expect(r.movements.map((m) => [m.movementId, m.docType, m.amount])).toEqual([['F900:1', 'פקודת יומן', 100]]);
    expect(r.olderThanCutoff).toMatchObject({ count: 1, sum: 100 });
    expect(r.afterWrite).toBeUndefined();
  });
});
