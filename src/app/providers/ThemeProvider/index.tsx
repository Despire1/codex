import { ReactNode, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../StoreProvider/config/store';
import { applyTheme } from '@/entities/theme/lib/applyTheme';
import type { ResolvedTheme, ThemeMode } from '@/entities/theme/model/types';

const resolveTheme = (mode: ThemeMode): ResolvedTheme => (mode === 'dark' ? 'dark' : 'light');

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const mode = useSelector((state: RootState) => state.theme.mode);
  const resolved = useMemo(() => resolveTheme(mode), [mode]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return <>{children}</>;
};
