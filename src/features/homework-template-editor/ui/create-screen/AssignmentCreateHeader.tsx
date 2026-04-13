import { FC } from 'react';
import {
  HomeworkArrowLeftIcon,
  HomeworkBarsIcon,
  HomeworkClipboardQuestionIcon,
  HomeworkCheckIcon,
  HomeworkClockIcon,
  HomeworkEllipsisVerticalIcon,
  HomeworkEyeIcon,
  HomeworkFloppyDiskIcon,
  HomeworkClockRotateLeftIcon,
  HomeworkCopyIcon,
  HomeworkFileImportIcon,
  HomeworkStarIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentCreateHeader.module.css';

interface AssignmentCreateHeaderProps {
  questionCount: number;
  totalPoints: number;
  estimatedMinutes: number;
  title?: string;
  subtitle?: string;
  primaryActionIcon?: 'check' | 'save';
  primaryActionLabel: string;
  primarySubmittingLabel: string;
  submitting: boolean;
  actionsDisabled?: boolean;
  menuOpen: boolean;
  onBack: () => void;
  onPreview: () => void;
  onToggleMenu: () => void;
  onPrimaryAction: () => void;
}

const MENU_ITEMS = [
  { id: 'duplicate', label: 'Дублировать', icon: <HomeworkCopyIcon size={14} /> },
  { id: 'from-lesson', label: 'Из урока', icon: <HomeworkFileImportIcon size={14} /> },
  { id: 'from-previous', label: 'Из предыдущего ДЗ', icon: <HomeworkClockRotateLeftIcon size={14} /> },
] as const;

const formatQuestionCount = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} вопроса`;
  return `${count} вопросов`;
};

const formatPointsCount = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} балл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} балла`;
  return `${count} баллов`;
};

const formatMinutesCount = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} минута`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} минуты`;
  return `${count} минут`;
};

export const AssignmentCreateHeader: FC<AssignmentCreateHeaderProps> = ({
  questionCount,
  totalPoints,
  estimatedMinutes,
  title = 'Новое задание',
  subtitle = 'Черновик • Сохраняется автоматически',
  primaryActionIcon = 'check',
  primaryActionLabel,
  primarySubmittingLabel,
  submitting,
  actionsDisabled = false,
  menuOpen,
  onBack,
  onPreview,
  onToggleMenu,
  onPrimaryAction,
}) => {
  const summaryItems = [
    {
      id: 'questions',
      icon: <HomeworkClipboardQuestionIcon size={13} />,
      value: formatQuestionCount(questionCount),
    },
    {
      id: 'points',
      icon: <HomeworkStarIcon size={13} />,
      value: formatPointsCount(totalPoints),
    },
    {
      id: 'minutes',
      icon: <HomeworkClockIcon size={13} />,
      value: formatMinutesCount(estimatedMinutes),
    },
  ] as const;
  const PrimaryActionIcon = primaryActionIcon === 'save' ? HomeworkFloppyDiskIcon : HomeworkCheckIcon;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button type="button" className={styles.mobileMenuButton} aria-label="Меню">
          <HomeworkBarsIcon size={16} />
        </button>

        <div className={styles.titleGroup}>
          <button type="button" className={styles.backButton} onClick={onBack} aria-label="Назад">
            <HomeworkArrowLeftIcon size={14} />
          </button>

          <div className={styles.titleMeta}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>
              <span className={styles.subtitleDot} aria-hidden />
              {subtitle}
            </p>
          </div>
        </div>

        <div className={styles.stats} aria-label="Сводка по заданию">
          {summaryItems.map((item, index) => (
            <span key={item.id} className={styles.statItem}>
              <span className={styles.statIcon}>{item.icon}</span>
              <span>{item.value}</span>
              {index < summaryItems.length - 1 ? <span className={styles.statDivider} aria-hidden /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.previewButton} onClick={onPreview}>
          <HomeworkEyeIcon size={14} />
          <span>Предпросмотр</span>
        </button>

        <div className={styles.menuWrap}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleMenu}
            aria-expanded={menuOpen}
            aria-label="Дополнительные действия"
          >
            <HomeworkEllipsisVerticalIcon size={14} />
          </button>

          {menuOpen ? (
            <div className={styles.menu}>
              {MENU_ITEMS.map((item) => (
                <button key={item.id} type="button" className={styles.menuItem}>
                  <span className={styles.menuItemIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={submitting || actionsDisabled}
          onClick={onPrimaryAction}
        >
          <PrimaryActionIcon size={14} className={styles.primaryActionIcon} />
          <span>{submitting ? primarySubmittingLabel : primaryActionLabel}</span>
        </button>
      </div>
    </header>
  );
};
