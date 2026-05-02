import { FC, SVGProps } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../../app/providers/StoreProvider/config/store';
import { setThemeMode } from '../../../entities/theme/model/themeSlice';
import type { ThemeMode } from '../../../entities/theme/model/types';
import { MoonIcon, PaletteIcon, SunIcon } from '../../../icons/MaterialIcons';
import styles from '../SettingsSection.module.css';
import appearanceStyles from './AppearanceSettings.module.css';

type Option = {
  id: Exclude<ThemeMode, 'system'>;
  label: string;
  hint: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
};

const OPTIONS: Option[] = [
  {
    id: 'light',
    label: 'Светлая',
    hint: 'Классический светлый интерфейс',
    Icon: SunIcon,
  },
  {
    id: 'dark',
    label: 'Тёмная',
    hint: 'Меньше нагрузки на глаза вечером',
    Icon: MoonIcon,
  },
];

export const AppearanceSettings: FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const storedMode = useSelector((state: RootState) => state.theme.mode);
  const mode: Exclude<ThemeMode, 'system'> = storedMode === 'dark' ? 'dark' : 'light';

  return (
    <div className={styles.moduleStack}>
      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderCompact}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
            <PaletteIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Тема оформления</h2>
            <p className={styles.sectionDescription}>Выберите светлую или тёмную тему интерфейса.</p>
          </div>
        </div>

        <div className={appearanceStyles.modeOptions} role="radiogroup" aria-label="Режим темы">
          {OPTIONS.map((option) => {
            const Icon = option.Icon;
            const selected = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={appearanceStyles.modeOption}
                data-selected={selected}
                role="radio"
                aria-checked={selected}
                onClick={() => dispatch(setThemeMode(option.id))}
              >
                <span className={appearanceStyles.modeIcon}>
                  <Icon width={20} height={20} />
                </span>
                <span className={appearanceStyles.modeLabel}>{option.label}</span>
                <span className={appearanceStyles.modeHint}>{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderCompact}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}>
            <PaletteIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Превью</h2>
            <p className={styles.sectionDescription}>Так выглядят основные поверхности в каждой теме.</p>
          </div>
        </div>

        <div className={appearanceStyles.previewWrap}>
          <div className={`${appearanceStyles.previewCard} ${appearanceStyles.previewLight}`}>
            <span className={appearanceStyles.previewBadge}>Светлая</span>
            <span className={appearanceStyles.previewLine} />
            <span className={`${appearanceStyles.previewLine} ${appearanceStyles.short}`} />
            <span className={appearanceStyles.previewLine} />
          </div>
          <div className={`${appearanceStyles.previewCard} ${appearanceStyles.previewDark}`}>
            <span className={appearanceStyles.previewBadge}>Тёмная</span>
            <span className={appearanceStyles.previewLine} />
            <span className={`${appearanceStyles.previewLine} ${appearanceStyles.short}`} />
            <span className={appearanceStyles.previewLine} />
          </div>
        </div>
      </section>
    </div>
  );
};
