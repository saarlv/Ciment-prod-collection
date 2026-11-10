import { act, renderHook } from '@testing-library/react';
import { AGING_VIEW_STORAGE_KEY, useAgingView } from '@/hooks/useAgingView';

describe('the aging view settings', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the zoom of the page and of full screen in this browser, and a reset keeps it', () => {
    const first = renderHook(() => useAgingView());
    expect(first.result.current.view.zoom).toBe(100);
    expect(first.result.current.view.fullZoom).toBe('fit');

    act(() => first.result.current.update({ zoom: 80, fullZoom: 120, filters: ['broken'] }));
    expect(JSON.parse(window.localStorage.getItem(AGING_VIEW_STORAGE_KEY) ?? '{}')).toMatchObject({ zoom: 80, fullZoom: 120 });
    first.unmount();

    const again = renderHook(() => useAgingView());
    expect(again.result.current.view).toMatchObject({ zoom: 80, fullZoom: 120, filters: ['broken'] });
    act(() => again.result.current.reset());
    expect(again.result.current.view).toMatchObject({ zoom: 80, fullZoom: 120, filters: [] });
  });
});