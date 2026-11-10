import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeBlocks, seedRealWorld } from '../../shared/fake-blocks.ts';

let current: any;
vi.mock('../../shared/blocks/blocks-client.ts', () => ({
  BlocksClient: vi.fn(function BlocksClient() {
    return current;
  }),
}));

import { invoke as seed } from '../../SeedTestFixtures/code.ts';
import { invoke } from '../code.ts';
import { parseAddress, parseAttachments, parseReceivedAt, verifySender } from '../../shared/collections-mail.ts';

const ctx: any = {};

describe('address parsing', () => {
  it('extracts address and name from provider sender strings', () => {
    expect(parseAddress('מיכל לוי <saarlevi14@gmail.com>')).toEqual({ address: 'saarlevi14@gmail.com', name: 'מיכל לוי' });
    expect(parseAddress('"Levi, Michal" <Michal.Levi@Ramot.co.il>')).toEqual({ address: 'michal.levi@ramot.co.il', name: 'Levi, Michal' });
    expect(parseAddress('<saar@blocks.diy>')).toEqual({ address: 'saar@blocks.diy', name: '' });
    expect(parseAddress('saar@blocks.diy')).toEqual({ address: 'saar@blocks.diy', name: '' });
    expect(parseAddress('saar@blocks.diy (סער)')).toEqual({ address: 'saar@blocks.diy', name: 'סער' });
    expect(parseAddress('saar@blocks.diy', 'סער')).toEqual({ address: 'saar@blocks.diy', name: 'סער' });
    expect(parseAddress('undefined')).toEqual({ address: '', name: '' });
  });

  it('reads epoch seconds, epoch ms, ISO and RFC-2822 timestamps, else now', () => {
    const iso = '2026-10-21T05:30:00.000Z';
    expect(parseReceivedAt('1792560600').iso).toBe(iso);
    expect(parseReceivedAt(1792560600000).iso).toBe(iso);
    expect(parseReceivedAt('1792560600000').iso).toBe(iso);
    expect(parseReceivedAt('2026-10-21T08:30:00+03:00').iso).toBe(iso);
    expect(parseReceivedAt('Wed, 21 Oct 2026 08:30:00 +0300').iso).toBe(iso);
    const now = new Date('2026-10-21T09:00:00.000Z');
    expect(parseReceivedAt('', now)).toEqual({ iso: now.toISOString(), parsed: false });
    expect(parseReceivedAt('not a date', now).parsed).toBe(false);
  });

  it('reads Gmail attachment_list (array or JSON string)', () => {
    const list = [{ attachmentId: 'a1', filename: 'scan.pdf', mimeType: 'application/pdf' }];
    expect(parseAttachments(list)).toEqual({ names: ['scan.pdf'], urls: [], count: 1 });
    expect(parseAttachments(JSON.stringify(list)).names).toEqual(['scan.pdf']);
    expect(parseAttachments([{ fileName: 'x.pdf', url: 'https://f/x.pdf' }]).urls).toEqual(['https://f/x.pdf']);
    expect(parseAttachments('undefined').count).toBe(0);
  });
});

describe('VerifySender on the fixture set', () => {
  const fake = new FakeBlocks();
  beforeAll(async () => {
    seedRealWorld(fake);
    current = fake.client();
    await seed({ dryRun: false, asOfDate: '2026-10-21' }, ctx);
  });

  it('מאומת for Michal of TEST-004 (with and without the customer)', async () => {
    const r = await invoke({ fromAddress: 'מיכל לוי <saarlevi14@gmail.com>', customerCode: 'TEST-004' }, ctx);
    expect(r).toMatchObject({ status: 'מאומת', address: 'saarlevi14@gmail.com', customerCode: 'TEST-004', customerName: 'בדיקה – רמות בנייה ופיתוח', contactName: 'מיכל לוי', contactRoles: 'הנהלת חשבונות,ראשי' });
    const noCode = await invoke({ fromAddress: 'SaarLevi14@Gmail.com' }, ctx);
    expect(noCode).toMatchObject({ status: 'מאומת', customerCode: 'TEST-004' });
  });

  it('לא מאומת for an unregistered address; לבדיקה for another customer or a domain-only match', async () => {
    const saar = await invoke({ fromAddress: 'stranger@outside.test.example', customerCode: 'TEST-004' }, ctx);
    expect(saar.status).toBe('לא מאומת');
    expect(saar.reason).toBe('הכתובת stranger@outside.test.example לא רשומה באנשי הקשר של בדיקה – רמות בנייה ופיתוח (TEST-004)');
    expect((await invoke({ fromAddress: 'stranger@outside.test.example' }, ctx)).status).toBe('לא מאומת');
    const other = await invoke({ fromAddress: 'saarlevi14@gmail.com', customerCode: 'TEST-002' }, ctx);
    expect(other.status).toBe('לבדיקה');
    expect(other.reason).toContain('רשומה אצל לקוח אחר: בדיקה – רמות בנייה ופיתוח (TEST-004)');
    const domain = await invoke({ fromAddress: 'new.person@ramot.test.example', customerCode: 'TEST-004' }, ctx);
    expect(domain.status).toBe('לבדיקה');
    // a free-mail domain never counts as a domain match
    expect((await invoke({ fromAddress: 'someone@gmail.com', customerCode: 'TEST-004' }, ctx)).status).toBe('לא מאומת');
    expect((await invoke({ fromAddress: 'x@y.com', customerCode: 'NOPE' }, ctx)).reason).toBe('הלקוח NOPE לא נמצא');
  });

  it('plan 04.11: a seeded purchasing contact (רכש, not isApContact) is no longer מאומת – לבדיקה', async () => {
    const dani = await invoke({ fromAddress: 'dani@ramot.test.example', customerCode: 'TEST-004' }, ctx);
    expect(dani).toMatchObject({ status: 'לבדיקה', contactName: 'דני רמות', contactRoles: 'רכש' });
    expect(dani.reason).toContain('לא מסומנת כאיש קשר בהנהלת חשבונות');
  });

  it('pure rule: several customers share an address → לבדיקה', () => {
    const contacts = [
      { customerCode: 'A', email: 'ap@shared.co.il', contactName: 'א', isApContact: true },
      { customerCode: 'B', email: 'AP@shared.co.il', contactName: 'ב', isApContact: true },
    ];
    const v = verifySender('ap@shared.co.il', null, contacts, new Map());
    expect(v.status).toBe('לבדיקה');
    expect(verifySender('ap@shared.co.il', 'A', contacts, new Map()).status).toBe('מאומת');
  });

  it('pure rule (plan 04.11): only a contact flagged isApContact verifies; any other registered contact → לבדיקה', () => {
    const contacts = [
      { customerCode: 'A', email: 'buyer@a.co.il', contactName: 'רכש', roleFlags: 'רכש', isApContact: false },
      { customerCode: 'A', email: 'ap@a.co.il', contactName: 'הנה״ח', roleFlags: 'הנהלת חשבונות', isApContact: true },
      { customerCode: 'A', email: 'ours@a.co.il', contactName: 'נוסף', source: 'נוסף אצלנו', isApContact: true },
    ];
    expect(verifySender('ap@a.co.il', 'A', contacts, new Map())).toMatchObject({ status: 'מאומת', contactName: 'הנה״ח' });
    expect(verifySender('ours@a.co.il', 'A', contacts, new Map()).status).toBe('מאומת');
    const buyer = verifySender('buyer@a.co.il', 'A', contacts, new Map());
    expect(buyer.status).toBe('לבדיקה');
    expect(buyer.reason).toContain('לא מסומנת כאיש קשר בהנהלת חשבונות');
    expect(verifySender('buyer@a.co.il', null, contacts, new Map())).toMatchObject({ status: 'לבדיקה', customerCode: 'A' });
    expect(verifySender('ap@a.co.il', null, contacts, new Map())).toMatchObject({ status: 'מאומת', customerCode: 'A' });
    // the domain rule is unchanged
    expect(verifySender('someone@a.co.il', 'A', contacts, new Map()).status).toBe('לבדיקה');
  });
});
