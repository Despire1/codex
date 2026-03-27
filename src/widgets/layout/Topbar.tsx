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
import { Tooltip } from '../../shared/ui/Tooltip/Tooltip';
import { TopbarCreateMenu, type TopbarCreateMenuItem } from './ui/TopbarCreateMenu/TopbarCreateMenu';
import styles from './Topbar.module.css';

interface TopbarProps {
  teacher: Teacher;
  title: string;
  subtitle: string;
  showCreateLesson: boolean;
  createButtonLabel?: string;
  createButtonIconAccent?: boolean;
  createMenuItems?: TopbarCreateMenuItem[];
  showEditorActions?: boolean;
  showEditorSecondaryAction?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  backButtonTooltip?: string;
  onEditorSecondaryAction?: () => void;
  onEditorPrimaryAction?: () => void;
  editorSubmitting?: boolean;
  editorPrimaryDisabled?: boolean;
  editorSecondaryActionLabel?: string;
  editorPrimaryActionLabel?: string;
  editorPrimarySubmittingLabel?: string;
  onOpenNotifications: () => void;
  onCreateLesson: () => void;
  profilePhotoUrl?: string | null;
  showScheduleViewToggle?: boolean;
  scheduleView?: 'month' | 'week' | 'day';
  onScheduleViewChange?: (view: 'month' | 'week' | 'day') => void;
}

export type { TopbarCreateMenuItem } from './ui/TopbarCreateMenu/TopbarCreateMenu';

export const Topbar: FC<TopbarProps> = ({
  teacher,
  title,
  subtitle,
  showCreateLesson,
  createButtonLabel = 'Новое занятие',
  createButtonIconAccent = false,
  createMenuItems,
  showEditorActions = false,
  showEditorSecondaryAction = false,
  showBackButton = false,
  onBack,
  backButtonTooltip = 'Назад',
  onEditorSecondaryAction,
  onEditorPrimaryAction,
  editorSubmitting = false,
  editorPrimaryDisabled = false,
  editorSecondaryActionLabel = 'Сохранить черновик',
  editorPrimaryActionLabel = 'Создать шаблон',
  editorPrimarySubmittingLabel = 'Сохраняю…',
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
          <Tooltip content={backButtonTooltip} side="bottom" align="start">
            <button type="button" className={styles.backButton} aria-label={backButtonTooltip} onClick={onBack}>
              <ChevronLeftIcon width={18} height={18} />
            </button>
          </Tooltip>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.separator} aria-hidden>
          |
        </span>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>

      <div
        className={`${styles.actions} ${
          showEditorActions
            ? styles.actionsTemplateMode
            : showCreateLesson
              ? styles.actionsCreateVisible
              : styles.actionsCreateHidden
        }`}
      >
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

        {showEditorActions ? (
          <>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Открыть уведомления"
              onClick={onOpenNotifications}
            >
              <NotificationsNoneOutlinedIcon width={20} height={20} />
              <span className={styles.notificationDot} aria-hidden />
            </button>

            {showEditorSecondaryAction ? (
              <button
                type="button"
                className={styles.templateSecondaryButton}
                onClick={onEditorSecondaryAction}
                disabled={editorSubmitting}
              >
                <SaveOutlinedIcon width={16} height={16} />
                <span>{editorSecondaryActionLabel}</span>
              </button>
            ) : null}

            <button
              type="button"
              className={styles.templatePrimaryButton}
              onClick={onEditorPrimaryAction}
              disabled={editorSubmitting || editorPrimaryDisabled}
            >
              <DoneOutlinedIcon width={16} height={16} className={styles.templatePrimaryIcon} />
              <span>{editorSubmitting ? editorPrimarySubmittingLabel : editorPrimaryActionLabel}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Открыть уведомления"
              onClick={onOpenNotifications}
            >
              <NotificationsNoneOutlinedIcon width={20} height={20} />
              <span className={styles.notificationDot} aria-hidden />
            </button>

            <div
              className={`${styles.createButtonSlot} ${showCreateLesson ? styles.createButtonSlotVisible : styles.createButtonSlotHidden}`}
            >
              {createMenuItems?.length ? (
                <TopbarCreateMenu
                  label={createButtonLabel}
                  items={createMenuItems}
                  triggerClassName={`${styles.createButton} ${showCreateLesson ? styles.createButtonVisible : styles.createButtonHidden}`}
                  triggerHiddenClassName={styles.createButtonHidden}
                  iconAccentClassName={createButtonIconAccent ? styles.createButtonIconAccent : undefined}
                  disabled={!showCreateLesson}
                />
              ) : (
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
              )}
            </div>
          </>
        )}

        <div className={styles.profile}>
          <span className={styles.teacherName}>{teacherDisplayName}</span>
          <Avatar src={profilePhotoUrl} alt="Профиль преподавателя" fallbackText={fallbackText} />
        </div>
      </div>
    </header>
  );
};
