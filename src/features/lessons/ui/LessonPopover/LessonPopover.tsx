import { addMinutes, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import type { Lesson, LinkedStudent } from '../../../../entities/types';
import {
  CancelCircleOutlinedIcon,
  CloseIcon,
  DeleteOutlineIcon,
  EditOutlinedIcon,
  PeopleIcon,
  PersonOutlineIcon,
  ReplayOutlinedIcon,
} from '../../../../icons/MaterialIcons';
import { getLessonColorTheme } from '../../../../shared/lib/lessonColors';
import { toZonedDate } from '../../../../shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel } from '../../../../entities/lesson/lib/lessonDetails';
import {
  resolveLessonCancelActionCopy,
  resolveLessonRecurrenceLabel,
  resolveLessonPaymentStatusLabel,
  resolveLessonPaymentTone,
  resolveLessonStatusLabel,
  resolveLessonStatusTone,
} from '../../../../entities/lesson/lib/lessonStatusPresentation';
import {
  resolveLessonEditDisabledReason,
} from '../../../../entities/lesson/lib/lessonMutationGuards';
import { Tooltip } from '../../../../shared/ui/Tooltip/Tooltip';
import { LessonPopoverPaymentControl } from './LessonPopoverPaymentControl';
import styles from './LessonPopover.module.css';

interface LessonPopoverProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onEditFull: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onTogglePaid: (studentId?: number) => void;
  onClose: () => void;
}

export const LessonPopover = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onEditFull,
  onDelete,
  onCancel,
  onRestore,
  onTogglePaid,
  onClose,
}: LessonPopoverProps) => {
  const participants = useMemo(() => buildParticipants(lesson, linkedStudentsById), [lesson, linkedStudentsById]);
  const lessonLabel = useMemo(() => getLessonLabel(participants, linkedStudentsById), [participants, linkedStudentsById]);
  const isCanceled = lesson.status === 'CANCELED';
  const cancelCopy = resolveLessonCancelActionCopy(lesson);
  const editDisabledReason = resolveLessonEditDisabledReason(lesson);
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const dateLabel = format(startDate, 'EEEE, d MMMM', { locale: ru });
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const statusLabel = resolveLessonStatusLabel(lesson);
  const statusTone = resolveLessonStatusTone(lesson);
  const paymentLabel = resolveLessonPaymentStatusLabel(lesson, participants);
  const paymentTone = resolveLessonPaymentTone(lesson, participants);
  const recurrenceLabel = resolveLessonRecurrenceLabel(lesson);
  const title = `Урок с ${lessonLabel}`;
  const lessonColorTheme = getLessonColorTheme(lesson.color);
  const studentLabel = participants.length > 1 ? `Ученики: ${lessonLabel}` : lessonLabel;
  const headerDateLabel = dateLabel ? `${dateLabel[0].toUpperCase()}${dateLabel.slice(1)}` : dateLabel;
  const ParticipantIcon = participants.length > 1 ? PeopleIcon : PersonOutlineIcon;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Tooltip content="Цвет занятия">
          <div
            className={styles.colorSwatch}
            aria-label="Цвет занятия"
            style={{
              background: lessonColorTheme.hoverBackground,
              boxShadow: `0 10px 22px ${lessonColorTheme.shadow}`,
            }}
          />
        </Tooltip>
        <div className={styles.toolbarActions}>
          <Tooltip content={editDisabledReason ?? 'Редактировать'}>
            <button
              type="button"
              className={styles.iconButton}
              disabled={Boolean(editDisabledReason)}
              onClick={onEditFull}
            >
              <EditOutlinedIcon className={styles.icon} />
            </button>
          </Tooltip>
          <Tooltip content={isCanceled ? 'Восстановить' : cancelCopy.actionLabel}>
            <button
              type="button"
              className={`${styles.iconButton} ${isCanceled ? styles.iconButtonNeutral : styles.iconButtonDanger}`}
              onClick={isCanceled ? onRestore : onCancel}
            >
              {isCanceled ? (
                <ReplayOutlinedIcon className={styles.icon} />
              ) : (
                <CancelCircleOutlinedIcon className={styles.icon} />
              )}
            </button>
          </Tooltip>
          <Tooltip content="Удалить">
            <button type="button" className={styles.iconButton} onClick={onDelete}>
              <DeleteOutlineIcon className={styles.icon} />
            </button>
          </Tooltip>
          <Tooltip content="Закрыть">
            <button type="button" className={`${styles.iconButton} ${styles.closeButton}`} onClick={onClose}>
              <CloseIcon className={styles.icon} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.summary}>
          <div className={styles.title}>{title}</div>
          <div className={styles.primaryMeta}>
            {headerDateLabel} <span className={styles.primaryMetaDivider}>•</span> {timeLabel}
          </div>
          {recurrenceLabel && <div className={styles.secondaryMeta}>{recurrenceLabel}</div>}
        </div>

        <div className={styles.statusGrid}>
          <div className={styles.statusCard}>
            <div className={styles.statusLabel}>Статус урока</div>
            <span className={`${styles.statusBadge} ${styles[`statusBadge_${statusTone}`]}`}>{statusLabel}</span>
          </div>
          <div className={styles.statusCard}>
            <div className={styles.statusLabel}>Оплата</div>
            <LessonPopoverPaymentControl
              lesson={lesson}
              participants={participants}
              linkedStudentsById={linkedStudentsById}
              paymentLabel={paymentLabel}
              paymentTone={paymentTone}
              badgeClassName={`${styles.statusBadge} ${styles[`statusBadge_${paymentTone}`]}`}
              onTogglePaid={onTogglePaid}
            />
          </div>
        </div>
      </div>

      <div className={styles.footerRow}>
        <ParticipantIcon className={styles.footerIcon} />
        <span className={styles.footerText}>{studentLabel}</span>
      </div>
    </div>
  );
};
