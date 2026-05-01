import { type FC, useState } from 'react';
import { AdaptivePopover } from '../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { useT } from '../../../../shared/i18n';
import { useTour } from '../../../../features/onboarding/model/useTour';
import { useHintRegistry } from '../../../../features/onboarding/model/hintRegistry';
import { resetAllHints } from '../../../../features/onboarding/model/useHintFlag';
import type { TourScenarioId } from '../../../../features/onboarding/model/tourScenarios';
import { trackEvent } from '../../../../shared/lib/analytics';
import styles from './HelpMenu.module.css';

interface HelpMenuProps {
  tourScenarioId: TourScenarioId;
  triggerClassName?: string;
}

type View = 'root' | 'context';

export const HelpMenu: FC<HelpMenuProps> = ({ tourScenarioId, triggerClassName }) => {
  const t = useT();
  const tour = useTour();
  const { hints, bumpResetTick } = useHintRegistry();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('root');

  const handleClose = () => {
    setOpen(false);
    setView('root');
  };

  const handleRestartTour = () => {
    handleClose();
    tour.start(tourScenarioId, 'help-menu');
  };

  const handleResetHints = () => {
    resetAllHints();
    bumpResetTick();
    trackEvent('help_reset_hints', {});
    handleClose();
  };

  return (
    <AdaptivePopover
      isOpen={open}
      onClose={handleClose}
      side="bottom"
      align="end"
      offset={8}
      className={styles.popover}
      trigger={
        <button
          type="button"
          className={triggerClassName || styles.trigger}
          aria-label={t('help.title')}
          onClick={() => setOpen((prev) => !prev)}
        >
          ?
        </button>
      }
    >
      {view === 'root' ? (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setView('context')}
            disabled={hints.length === 0}
          >
            {t('help.menu.contextHints')}
          </button>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={handleRestartTour}>
            {t('help.menu.restartTour')}
          </button>
          <button type="button" className={styles.menuItem} role="menuitem" onClick={handleResetHints}>
            {t('help.menu.resetHints')}
          </button>
        </div>
      ) : (
        <div className={styles.contextHints}>
          {hints.length === 0 ? (
            <p className={styles.contextHintsEmpty}>{t('help.contextHints.empty')}</p>
          ) : (
            hints.map((h) => (
              <div key={h.area} className={styles.contextHint}>
                <h5 className={styles.contextHintTitle}>{t(h.titleKey)}</h5>
                <p className={styles.contextHintBody}>{t(h.bodyKey)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </AdaptivePopover>
  );
};
