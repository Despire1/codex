import { ResolvedTheme } from '../model/types';

const THEME_COLOR_LIGHT = '#f8fafc';
const THEME_COLOR_DARK = '#0f172a';

export const applyTheme = (theme: ResolvedTheme) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = theme;

  if (document.body) {
    document.body.dataset.theme = theme;
  }

  updateThemeColorMeta(theme);
};

const updateThemeColorMeta = (theme: ResolvedTheme) => {
  const head = document.head;
  if (!head) return;

  // Удаляем дубликаты с media-условиями: достаточно одного актуального тега.
  head.querySelectorAll('meta[name="theme-color"]').forEach((node) => node.parentElement?.removeChild(node));

  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', theme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  head.appendChild(meta);
};
