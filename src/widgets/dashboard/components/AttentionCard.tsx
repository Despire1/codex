import { type FC } from 'react';
import type { DashboardActionRequiredItem, DashboardActionSeverity, Lesson } from '@/entities/types';
import styles from './AttentionCard.module.css';

export interface AttentionItem {
  id: string;
  lesson: Lesson;
  studentId: number;
  studentName: string;
  needsCompletion: boolean;
  needsPayment: boolean;
}

export type AttentionAction = DashboardActionRequiredItem['action']['type'];

interface AttentionCardProps {
  items: DashboardActionRequiredItem[];
  onAction: (item: DashboardActionRequiredItem) => void;
  className?: string;
}

const TAG_CLASS: Record<DashboardActionSeverity, string> = {
  critical: styles.tagRed,
  warning: styles.tagAmber,
  info: styles.tagBlue,
};

export const AttentionCard: FC<AttentionCardProps> = ({ items, onAction, className }) => {
  if (items.length === 0) {
    return (
      <section className={[styles.card, className].filter(Boolean).join(' ')}>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <span className={styles.icon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <h3 className={styles.title}>Требует действий</h3>
          </div>
        </div>
        <div className={styles.empty}>Сейчас всё под контролем</div>
      </section>
    );
  }

  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.icon} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <h3 className={styles.title}>Требует действий</h3>
          <span className={styles.badge}>{items.length}</span>
        </div>
      </div>

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.row}>
            <div className={styles.main}>
              <span className={`${styles.tag} ${TAG_CLASS[item.severity]}`}>{item.tag}</span>
              <span className={styles.titleText} title={item.title}>
                {item.title}
              </span>
              <span className={styles.meta} title={item.meta}>
                {item.meta}
              </span>
            </div>
            <button type="button" className={styles.actionBtn} onClick={() => onAction(item)}>
              {item.action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
