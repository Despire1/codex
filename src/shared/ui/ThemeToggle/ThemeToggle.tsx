import { type FC } from 'react';
import { DarkModeIcon, LightModeIcon } from '../../../icons/MaterialIcons';
import { useTheme } from '../../lib/theme/useTheme';
import styles from './ThemeToggle.module.css';

export const ThemeToggle: FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
    >
      <span className={styles.icon} aria-hidden>
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </span>
      <span className={styles.label}>{isDark ? 'Светлая' : 'Тёмная'}</span>
    </button>
  );
};
