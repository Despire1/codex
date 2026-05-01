import { useEffect, useState } from 'react';

const isVisuallyVisible = (el: Element): boolean => {
  if (typeof window === 'undefined') return true;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  if (parseFloat(cs.opacity) === 0) return false;
  return true;
};

const readRect = (selector: string | null): DOMRect | null => {
  if (typeof document === 'undefined' || !selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  if (!isVisuallyVisible(el)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
};

export const useAnchorRect = (selector: string | null) => {
  const [rect, setRect] = useState<DOMRect | null>(() => readRect(selector));

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let frame = 0;
    let cancelled = false;

    const update = () => {
      if (cancelled) return;
      setRect(readRect(selector));
    };

    update();

    const tick = () => {
      if (cancelled) return;
      update();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    const handle = () => update();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [selector]);

  return rect;
};
