import { useEffect, useRef } from 'react';

const getFocusableElements = (container: HTMLElement) => {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (node) => !node.hasAttribute('disabled') && !node.getAttribute('aria-hidden'),
  );
};

export const useFocusTrap = (active: boolean, containerRef: React.RefObject<HTMLElement>) => {
  const previousActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    if (typeof document === 'undefined') return undefined;

    previousActive.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) return undefined;

    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0]?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = getFocusableElements(container);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActive.current && document.contains(previousActive.current)) {
        previousActive.current.focus();
      }
    };
  }, [active, containerRef]);
};
