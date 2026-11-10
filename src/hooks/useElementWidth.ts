import { useEffect, useRef, useState } from 'react';

/**
 * The content width of an element, kept current with a ResizeObserver and rounded to `step` px so a
 * child keyed on it (the PDF viewer, which takes its width once) re-fits only on real size changes.
 */
export function useElementWidth<T extends HTMLElement>(step = 24) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.floor(w / step) * step);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [step]);
  return { ref, width };
}