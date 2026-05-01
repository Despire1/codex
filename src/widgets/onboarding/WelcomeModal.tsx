import { type FC, useEffect, useRef } from 'react';
import { Modal } from '../../shared/ui/Modal/Modal';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { useT } from '../../shared/i18n';
import { trackEvent } from '../../shared/lib/analytics';
import controls from '../../shared/styles/controls.module.css';
import styles from './WelcomeModal.module.css';

export type WelcomeRole = 'teacher' | 'student';
export type WelcomeVariant = 'modal' | 'sheet';

interface WelcomeModalProps {
  open: boolean;
  role: WelcomeRole;
  variant: WelcomeVariant;
  userId: number | null;
  teacherName?: string | null;
  onSkip: () => void;
  onStartTour: () => void;
}

export const WelcomeModal: FC<WelcomeModalProps> = ({
  open,
  role,
  variant,
  userId,
  teacherName,
  onSkip,
  onStartTour,
}) => {
  const t = useT();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!open || shownRef.current) return;
    shownRef.current = true;
    trackEvent('welcome_shown', { userId, role, variant });
  }, [open, role, userId, variant]);

  useEffect(() => {
    if (!open) shownRef.current = false;
  }, [open]);

  const handleSkip = () => {
    trackEvent('welcome_dismissed', { userId, role, variant });
    onSkip();
  };

  const handleStartTour = () => {
    trackEvent('welcome_tour_started', { userId, role, variant });
    onStartTour();
  };

  const isTeacher = role === 'teacher';
  const title = t(isTeacher ? 'welcome.title' : 'student.welcome.title');
  const subtitle = isTeacher
    ? t('welcome.subtitle')
    : teacherName
      ? t('student.welcome.subtitle.withTeacher', { teacherName })
      : t('student.welcome.subtitle.withoutTeacher');
  const ctaTour = t(isTeacher ? 'welcome.cta.tour' : 'student.welcome.cta.tour');
  const ctaSkip = t(isTeacher ? 'welcome.cta.skip' : 'student.welcome.cta.skip');

  const body = (
    <div className={`${styles.container} ${variant === 'sheet' ? styles.sheetContainer : ''}`}>
      <div className={styles.illustration} aria-hidden>
        {isTeacher ? '👋' : '✨'}
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.subtitle}>{subtitle}</p>

      {isTeacher ? (
        <>
          <p className={styles.bulletsIntro}>{t('welcome.bullets.intro')}</p>
          <ul className={styles.bullets}>
            <li className={styles.bullet}>
              <span className={styles.bulletDot} aria-hidden />
              <span>{t('welcome.bullets.1')}</span>
            </li>
            <li className={styles.bullet}>
              <span className={styles.bulletDot} aria-hidden />
              <span>{t('welcome.bullets.2')}</span>
            </li>
            <li className={styles.bullet}>
              <span className={styles.bulletDot} aria-hidden />
              <span>{t('welcome.bullets.3')}</span>
            </li>
          </ul>
        </>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={`${controls.primaryButton} ${styles.primaryButton}`} onClick={handleStartTour}>
          {ctaTour}
        </button>
        <button type="button" className={`${controls.secondaryButton} ${styles.secondaryButton}`} onClick={handleSkip}>
          {ctaSkip}
        </button>
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={handleSkip}>
        {body}
      </BottomSheet>
    );
  }

  return (
    <Modal open={open} onClose={handleSkip}>
      {body}
    </Modal>
  );
};
