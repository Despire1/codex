import { faCalendarPlus } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowRight,
  faBolt,
  faFileInvoiceDollar,
  faFolderPlus,
  faLightbulb,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { type FC } from 'react';
import { useToast } from '@/shared/lib/toast';
import styles from './DashboardQuickActionsReferenceCard.module.css';

interface DashboardQuickActionsReferenceCardProps {
  className?: string;
  onCreateHomework: () => void;
  onCreateLesson: () => void;
  onAddStudent: () => void;
}

const resolveClassName = (className?: string) => [styles.card, className].filter(Boolean).join(' ');

export const DashboardQuickActionsReferenceCard: FC<DashboardQuickActionsReferenceCardProps> = ({
  className,
  onCreateHomework,
  onCreateLesson,
  onAddStudent,
}) => {
  const { showToast } = useToast();

  const handleStubClick = (label: string) => {
    showToast({
      message: `${label} скоро будет доступно`,
      variant: 'success',
    });
  };

  return (
    <section id="quick-actions-section" className={resolveClassName(className)}>
      <div className={styles.header}>
        <div className={styles.headerIconWrap}>
          <FontAwesomeIcon icon={faBolt} />
        </div>
        <h2 className={styles.title}>Быстрые действия</h2>
      </div>

      <div className={styles.actions}>
        <button type="button" className={`${styles.actionButton} ${styles.actionButtonPrimary}`} onClick={onCreateHomework}>
          <div className={styles.actionMain}>
            <div className={`${styles.actionIconWrap} ${styles.actionIconPrimary}`}>
              <FontAwesomeIcon icon={faPlus} />
            </div>
            <span className={`${styles.actionLabel} ${styles.actionLabelPrimary}`}>Создать задание</span>
          </div>
          <FontAwesomeIcon icon={faArrowRight} className={`${styles.actionArrow} ${styles.actionArrowPrimary}`} />
        </button>

        <button type="button" className={styles.actionButton} onClick={onCreateLesson}>
          <div className={styles.actionMain}>
            <div className={`${styles.actionIconWrap} ${styles.actionIconBlue}`}>
              <FontAwesomeIcon icon={faCalendarPlus} />
            </div>
            <span className={styles.actionLabel}>Добавить урок</span>
          </div>
          <FontAwesomeIcon icon={faArrowRight} className={styles.actionArrow} />
        </button>

        <button type="button" className={styles.actionButton} onClick={onAddStudent}>
          <div className={styles.actionMain}>
            <div className={`${styles.actionIconWrap} ${styles.actionIconGreen}`}>
              <FontAwesomeIcon icon={faPlus} />
            </div>
            <span className={styles.actionLabel}>Новый ученик</span>
          </div>
          <FontAwesomeIcon icon={faArrowRight} className={styles.actionArrow} />
        </button>

        <button type="button" className={styles.actionButton} onClick={() => handleStubClick('Выставление счета')}>
          <div className={styles.actionMain}>
            <div className={`${styles.actionIconWrap} ${styles.actionIconGreen}`}>
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>
            <span className={styles.actionLabel}>Выставить счет</span>
          </div>
          <FontAwesomeIcon icon={faArrowRight} className={styles.actionArrow} />
        </button>

        <button type="button" className={styles.actionButton} onClick={() => handleStubClick('Загрузка материалов')}>
          <div className={styles.actionMain}>
            <div className={`${styles.actionIconWrap} ${styles.actionIconOrange}`}>
              <FontAwesomeIcon icon={faFolderPlus} />
            </div>
            <span className={styles.actionLabel}>Загрузить материал</span>
          </div>
          <FontAwesomeIcon icon={faArrowRight} className={styles.actionArrow} />
        </button>
      </div>

      <div className={styles.tipSection}>
        <div className={styles.tipCard}>
          <div className={styles.tipContent}>
            <div className={styles.tipIconWrap}>
              <FontAwesomeIcon icon={faLightbulb} />
            </div>
            <div>
              <h4 className={styles.tipTitle}>Совет дня</h4>
              <p className={styles.tipText}>Используйте AI для генерации упражнений по грамматике</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
