import { type FC } from 'react';
import { Teacher } from '../../entities/types';
import {
  AddOutlinedIcon,
  CalendarMonthIcon,
  CalendarDayReferenceIcon,
  CalendarWeekReferenceIcon,
  ChevronLeftIcon,
  DoneOutlinedIcon,
  NotificationsNoneOutlinedIcon,
  SaveOutlinedIcon,
} from '../../icons/MaterialIcons';
import { Avatar } from '../../shared/ui/Avatar/Avatar';
import styles from './Topbar.module.css';

interface TopbarProps {
  teacher: Teacher;
  title: string;
  subtitle: string;
  showCreateLesson: boolean;
  createButtonLabel?: string;
  createButtonIconAccent?: boolean;
  showTemplateCreateActions?: boolean;
  showTemplateSaveDraft?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onSaveDraft?: () => void;
  onCreateTemplate?: () => void;
  templateCreateSubmitting?: boolean;
  templateCreateSubmitDisabled?: boolean;
  templateCreateActionLabel?: string;
  templateCreateSubmittingLabel?: string;
  onOpenNotifications: () => void;
  onCreateLesson: () => void;
  profilePhotoUrl?: string | null;
  showScheduleViewToggle?: boolean;
  scheduleView?: 'month' | 'week' | 'day';
  onScheduleViewChange?: (view: 'month' | 'week' | 'day') => void;
}

export const Topbar: FC<TopbarProps> = ({
  teacher,
  title,
  subtitle,
  showCreateLesson,
  createButtonLabel = 'Новое занятие',
  createButtonIconAccent = false,
  showTemplateCreateActions = false,
  showTemplateSaveDraft = true,
  showBackButton = false,
  onBack,
  onSaveDraft,
  onCreateTemplate,
  templateCreateSubmitting = false,
  templateCreateSubmitDisabled = false,
  templateCreateActionLabel = 'Создать шаблон',
  templateCreateSubmittingLabel = 'Сохраняю…',
  onOpenNotifications,
  onCreateLesson,
  profilePhotoUrl,
  showScheduleViewToggle = false,
  scheduleView = 'month',
  onScheduleViewChange,
}) => {
  const fallbackText = teacher.name || teacher.username || 'П';
  const teacherDisplayName = teacher.name ?? teacher.username ?? 'Преподаватель';

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {showBackButton ? (
          <button type="button" className={styles.backButton} aria-label="Назад" onClick={onBack}>
            <ChevronLeftIcon width={18} height={18} />
          </button>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.separator} aria-hidden>
          |
        </span>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>

      <div
        className={`${styles.actions} ${
          showTemplateCreateActions
            ? styles.actionsTemplateMode
            : showCreateLesson
              ? styles.actionsCreateVisible
              : styles.actionsCreateHidden
        }`}
      >
        {showTemplateCreateActions && showTemplateSaveDraft ? (
          <button
            type="button"
            className={styles.templateSecondaryButton}
            onClick={onSaveDraft}
            disabled={templateCreateSubmitting}
          >
            <SaveOutlinedIcon width={16} height={16} />
            <span>Сохранить черновик</span>
          </button>
        ) : null}

        {showScheduleViewToggle ? (
          <div className={styles.viewToggleGroup} role="tablist" aria-label="Вид календаря">
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'month' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange?.('month')}
              aria-pressed={scheduleView === 'month'}
              role="tab"
            >
              <CalendarMonthIcon width={14} height={14} />
              <span>Месяц</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'week' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange?.('week')}
              aria-pressed={scheduleView === 'week'}
              role="tab"
            >
              <CalendarWeekReferenceIcon width={14} height={14} />
              <span>Неделя</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'day' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange?.('day')}
              aria-pressed={scheduleView === 'day'}
              role="tab"
            >
              <CalendarDayReferenceIcon width={14} height={14} />
              <span>День</span>
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={styles.iconButton}
          aria-label="Открыть уведомления"
          onClick={onOpenNotifications}
        >
          <NotificationsNoneOutlinedIcon width={20} height={20} />
          <span className={styles.notificationDot} aria-hidden />
        </button>

        {showTemplateCreateActions ? (
          <button
            type="button"
            className={styles.templatePrimaryButton}
            onClick={onCreateTemplate}
            disabled={templateCreateSubmitting || templateCreateSubmitDisabled}
          >
            <DoneOutlinedIcon width={16} height={16} className={styles.templatePrimaryIcon} />
            <span>{templateCreateSubmitting ? templateCreateSubmittingLabel : templateCreateActionLabel}</span>
          </button>
        ) : (
          <div
            className={`${styles.createButtonSlot} ${showCreateLesson ? styles.createButtonSlotVisible : styles.createButtonSlotHidden}`}
          >
            <button
              type="button"
              className={`${styles.createButton} ${showCreateLesson ? styles.createButtonVisible : styles.createButtonHidden}`}
              onClick={onCreateLesson}
              disabled={!showCreateLesson}
              tabIndex={showCreateLesson ? undefined : -1}
              aria-hidden={!showCreateLesson}
            >
              <AddOutlinedIcon
                width={18}
                height={18}
                className={createButtonIconAccent ? styles.createButtonIconAccent : undefined}
              />
              <span>{createButtonLabel}</span>
            </button>
          </div>
        )}

        <div className={styles.profile}>
          <span className={styles.teacherName}>{teacherDisplayName}</span>
          <Avatar src={profilePhotoUrl} alt="Профиль преподавателя" fallbackText={fallbackText} />
        </div>
      </div>
    </header>
  );
};
