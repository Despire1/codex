import { type PropsWithChildren, createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MessageKey } from '../../../shared/i18n';

export type HintMeta = {
  area: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  seen?: boolean;
};

type HintRegistryValue = {
  register: (meta: HintMeta) => void;
  unregister: (area: string) => void;
  hints: HintMeta[];
  resetTick: number;
  bumpResetTick: () => void;
  firstNotSeenArea: string | null;
};

const HintRegistryContext = createContext<HintRegistryValue | null>(null);

export const HintRegistryProvider = ({ children }: PropsWithChildren) => {
  const [hints, setHints] = useState<HintMeta[]>([]);
  const [resetTick, setResetTick] = useState(0);

  const register = useCallback((meta: HintMeta) => {
    setHints((prev) => {
      const idx = prev.findIndex((h) => h.area === meta.area);
      if (idx === -1) return [...prev, meta];
      const existing = prev[idx];
      if (existing.seen === meta.seen && existing.titleKey === meta.titleKey && existing.bodyKey === meta.bodyKey) {
        return prev;
      }
      const next = [...prev];
      next[idx] = meta;
      return next;
    });
  }, []);

  const unregister = useCallback((area: string) => {
    setHints((prev) => prev.filter((h) => h.area !== area));
  }, []);

  const bumpResetTick = useCallback(() => setResetTick((t) => t + 1), []);

  const firstNotSeenArea = useMemo(() => {
    const next = hints.find((h) => h.seen === false);
    return next ? next.area : null;
  }, [hints]);

  const value = useMemo<HintRegistryValue>(
    () => ({ register, unregister, hints, resetTick, bumpResetTick, firstNotSeenArea }),
    [bumpResetTick, firstNotSeenArea, hints, register, resetTick, unregister],
  );

  return <HintRegistryContext.Provider value={value}>{children}</HintRegistryContext.Provider>;
};

export const useHintRegistry = () => {
  const ctx = useContext(HintRegistryContext);
  if (!ctx) {
    throw new Error('useHintRegistry must be used within HintRegistryProvider');
  }
  return ctx;
};
