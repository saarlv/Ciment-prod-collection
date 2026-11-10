import { noteLabel, noteTone, stepZoom, DEFAULT_VIEW, parseView } from '@/utils/AgingPanel';

describe('the saved view', () => {
  it('reads back only valid stored views', () => {
    expect(parseView(null)).toEqual(DEFAULT_VIEW);
    const v = parseView({ customers: ['C-1', 3], focus: '2026-09', columns: { agent: false }, filters: ['broken', 'nope'], sort: 'zzz' });
    expect(v).toEqual({
      customers: ['C-1'],
      focus: '2026-09',
      columns: { details: true, agent: false, contact: true, notes: true },
      filters: ['broken'],
      sort: 'total',
      zoom: 100,
      fullZoom: 'fit',
    });
  });

  it('keeps the zoom of the page and of full screen, clamped to 50–150%', () => {
    expect(parseView({ zoom: 80, fullZoom: 120 })).toMatchObject({ zoom: 80, fullZoom: 120 });
    expect(parseView({ zoom: 400, fullZoom: 'fit' })).toMatchObject({ zoom: 150, fullZoom: 'fit' });
    expect(parseView({ zoom: 'huge', fullZoom: 10 })).toMatchObject({ zoom: 100, fullZoom: 50 });
    // steps of 10 from whatever is in effect, including a fitted zoom
    expect(stepZoom(73, 1)).toBe(80);
    expect(stepZoom(73, -1)).toBe(70);
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(50, -1)).toBe(50);
    expect(stepZoom(150, 1)).toBe(150);
  });
});

describe('note type chips', () => {
  it('shows retired note types as a neutral general note, and בירור by its short name', () => {
    expect(noteLabel('ממתין לזיכוי')).toBe('הערה כללית');
    expect(noteLabel('אין מענה')).toBe('הערה כללית');
    expect(noteLabel('הערה')).toBe('הערה כללית');
    expect(noteLabel('בבירור – מחלוקת')).toBe('בירור');
    expect(noteTone('הועבר לסוכן')).toBe('quiet');
    expect(noteTone('שולם לטענת הלקוח')).toBe('done');
  });
});