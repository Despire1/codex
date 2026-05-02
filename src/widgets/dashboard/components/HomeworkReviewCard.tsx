import { type FC } from 'react';
import type { DashboardHomeworkReviewItem } from '@/entities/types';
import styles from './HomeworkReviewCard.module.css';

interface HomeworkReviewCardProps {
  items: DashboardHomeworkReviewItem[];
  onOpenAssignment: (assignmentId: number, studentId: number) => void;
  onOpenAll?: () => void;
  className?: string;
  maxRows?: number;
}

const buildTaskLine = (item: DashboardHomeworkReviewItem) => {
  const baseTitle = item.templateTitle?.trim() || item.title.trim();
  const parts: string[] = [];

  if (item.autoScore !== null && item.totalQuestions !== null) {
    parts.push(`${item.autoScore}/${item.totalQuestions} верных`);
  } else if (item.autoScore !== null) {
    parts.push(`${item.autoScore} баллов`);
  } else if (item.totalQuestions !== null && item.totalQuestions > 0) {
    parts.push(`${item.totalQuestions} вопросов`);
  }

  const fileCount = item.attachmentsCount + item.voiceCount;
  if (fileCount > 0) {
    if (item.hasTextAnswer) {
      parts.push(`Аудио + текст · ${fileCount} файлов`);
    } else {
      parts.push(`${fileCount} файлов`);
    }
  } else if (item.hasTextAnswer && parts.length === 0) {
    parts.push('Текстовый ответ');
  }

  if (parts.length === 0) return baseTitle;
  return `${baseTitle} · ${parts.join(' · ')}`;
};

export const HomeworkReviewCard: FC<HomeworkReviewCardProps> = ({
  items,
  onOpenAssignment,
  onOpenAll,
  className,
  maxRows = 3,
}) => {
  const visible = items.slice(0, maxRows);

  if (items.length === 0) {
    return (
      <section className={[styles.card, className].filter(Boolean).join(' ')}>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <span className={styles.icon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </span>
            <h3 className={styles.title}>Проверить ДЗ</h3>
          </div>
        </div>
        <div className={styles.empty}>Все ДЗ проверены</div>
      </section>
    );
  }

  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.icon} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </span>
          <h3 className={styles.title}>Проверить ДЗ</h3>
          <span className={styles.badge}>{items.length}</span>
        </div>
        {items.length > maxRows && onOpenAll && (
          <button type="button" className={styles.link} onClick={onOpenAll}>
            Все →
          </button>
        )}
      </div>

      <ul className={styles.list}>
        {visible.map((item) => (
          <li key={item.assignmentId} className={styles.row}>
            <div className={styles.avatar}>{item.studentName.trim().charAt(0).toUpperCase() || 'У'}</div>
            <div className={styles.main}>
              <span className={styles.name} title={item.studentName}>
                {item.studentName}
              </span>
              <span className={styles.task} title={buildTaskLine(item)}>
                {buildTaskLine(item)}
              </span>
            </div>
            <button
              type="button"
              className={styles.btn}
              onClick={() => onOpenAssignment(item.assignmentId, item.studentId)}
            >
              Проверить
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
