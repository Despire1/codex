import { addMinutes, format } from 'date-fns';
import { type FC, type KeyboardEvent, type MouseEvent, useState } from 'react';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { MeetingLinkIcon, MoreHorizIcon, ReplayOutlinedIcon } from '../../../icons/MaterialIcons';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import { buildParticipants, getLessonLabel, isLessonInSeries } from '../../../entities/lesson/lib/lessonDetails';
import { resolveLessonCancelActionCopy } from '../../../entities/lesson/lib/lessonStatusPresentation';
import {
  resolveLessonDeleteDisabledReason,
  resolveLessonEditDisabledReason,
  resolveLessonMutationDisabledReason,
} from '../../../entities/lesson/lib/lessonMutationGuards';
import { useLessonActions } from '../../../features/lessons/model/useLessonActions';
import type { LessonCancelRefundMode, LessonMutationPreview, LessonSeriesScope } from '../../../features/lessons/model/types';
import { LessonCancelDialog } from '../../../features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonRestoreDialog } from '../../../features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '../../../features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import styles from './MonthSidebarLessonItem.module.css';

interface MonthSidebarLessonItemProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
}

type PendingScopeAction =
  | {
      type: 'cancel';
      refundMode?: LessonCancelRefundMode;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    }
  | {
      type: 'restore';
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    };

const SUBJECT_BY_COLOR: Record<NonNullable<Lesson['color']>, string> = {
  blue: 'Английский язык',
  peach: 'Математика',
  rose: 'Физика',
  mint: 'Программирование',
  sand: 'Химия',
  lavender: 'История',
};

const resolveLessonSubject = (lesson: Lesson, participantsCount: number) => {
  if (lesson.color) {
    return SUBJECT_BY_COLOR[lesson.color];
  }

  return participantsCount > 1 ? 'Групповое занятие' : 'Индивидуальное занятие';
};

export const MonthSidebarLessonItem: FC<MonthSidebarLessonItemProps> = ({
  lesson,
  linkedStudentsById,
  timeZone,
}) => {
  const {
    startEditLesson,
    openRescheduleModal,
    requestDeleteLessonFromList,
    cancelLesson,
    restoreLesson,
  } = useLessonActions();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);
  const participants = buildParticipants(lesson, linkedStudentsById);
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);
  const subjectLabel = resolveLessonSubject(lesson, participants.length);
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const rescheduleDisabledReason = resolveLessonMutationDisabledReason(lesson);
  const editDisabledReason = resolveLessonEditDisabledReason(lesson);
  const deleteDisabledReason = resolveLessonDeleteDisabledReason(lesson);
  const isCanceled = lesson.status === 'CANCELED';
  const isRecurring = isLessonInSeries(lesson);
  const cancelCopy = resolveLessonCancelActionCopy(lesson);

  const handleCardOpen = () => {
    startEditLesson(lesson);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleCardOpen();
  };

  const handleOpenMeetingLink = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!lesson.meetingLink) return;
    window.open(lesson.meetingLink, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmCancel = (refundMode?: LessonCancelRefundMode) => {
    setCancelDialogOpen(false);

    if (!isRecurring) {
      void cancelLesson(lesson, 'SINGLE', refundMode);
      return;
    }

    void Promise.all(
      (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
        const data = await api.previewLessonMutation(lesson.id, { action: 'CANCEL', scope });
        return [scope, data.preview] as const;
      }),
    )
      .then((entries) => {
        setScopeDialog({
          type: 'cancel',
          refundMode,
          previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
        });
      })
      .catch(() => {
        setScopeDialog({ type: 'cancel', refundMode });
      });
  };

  const handleConfirmRestore = () => {
    setRestoreDialogOpen(false);

    if (!isRecurring) {
      void restoreLesson(lesson, 'SINGLE');
      return;
    }

    void Promise.all(
      (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
        const data = await api.previewLessonMutation(lesson.id, { action: 'RESTORE', scope });
        return [scope, data.preview] as const;
      }),
    )
      .then((entries) => {
        setScopeDialog({
          type: 'restore',
          previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
        });
      })
      .catch(() => {
        setScopeDialog({ type: 'restore' });
      });
  };

  const handleScopeConfirm = (scope: LessonSeriesScope) => {
    const payload = scopeDialog;
    setScopeDialog(null);
    if (!payload) return;
    if (payload.type === 'cancel') {
      void cancelLesson(lesson, scope, payload.refundMode);
      return;
    }
    void restoreLesson(lesson, scope);
  };

  return (
    <>
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={handleCardOpen}
      onKeyDown={handleCardKeyDown}
    >
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{lessonLabel}</h3>
        <div className={styles.headerControls}>
          {lesson.meetingLink ? (
            <Tooltip content="Открыть ссылку на занятие">
              <button
                type="button"
                className={`${styles.iconBadge} ${styles.iconBadgeButton}`}
                aria-label="Открыть ссылку на занятие"
                onClick={handleOpenMeetingLink}
              >
                <MeetingLinkIcon className={styles.iconBadgeIcon} />
              </button>
            </Tooltip>
          ) : null}
          {isRecurring ? (
            <Tooltip content="Повторяющееся занятие">
              <span className={`${styles.iconBadge} ${styles.recurringBadge}`}>
                <ReplayOutlinedIcon className={styles.iconBadgeIcon} />
              </span>
            </Tooltip>
          ) : null}
          <AdaptivePopover
            isOpen={isActionsOpen}
            onClose={() => setIsActionsOpen(false)}
            side="bottom"
            align="end"
            trigger={
              <button
                type="button"
                className={styles.actionsButton}
                aria-label="Быстрые действия"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsActionsOpen((prev) => !prev);
                }}
              >
                <MoreHorizIcon width={18} height={18} />
              </button>
            }
          >
            <div className={styles.actionsPopover} role="menu" aria-label={`Действия для занятия #${lesson.id}`}>
              {!isCanceled && (
                <>
                  <Tooltip content={rescheduleDisabledReason}>
                    <button
                      type="button"
                      className={styles.actionItem}
                      disabled={Boolean(rescheduleDisabledReason)}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRescheduleModal(lesson);
                        setIsActionsOpen(false);
                      }}
                    >
                      Перенести занятие
                    </button>
                  </Tooltip>
                  <Tooltip content={editDisabledReason}>
                    <button
                      type="button"
                      className={styles.actionItem}
                      disabled={Boolean(editDisabledReason)}
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditLesson(lesson);
                        setIsActionsOpen(false);
                      }}
                    >
                      Редактировать
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCancelDialogOpen(true);
                      setIsActionsOpen(false);
                    }}
                  >
                    {cancelCopy.actionLabel}
                  </button>
                </>
              )}
              {isCanceled && (
                <button
                  type="button"
                  className={styles.actionItem}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRestoreDialogOpen(true);
                    setIsActionsOpen(false);
                  }}
                >
                  Восстановить
                </button>
              )}
              <Tooltip content={deleteDisabledReason}>
                <button
                  type="button"
                  className={`${styles.actionItem} ${styles.actionDanger}`}
                  disabled={Boolean(deleteDisabledReason)}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteLessonFromList(lesson);
                    setIsActionsOpen(false);
                  }}
                >
                  Удалить занятие
                </button>
              </Tooltip>
            </div>
          </AdaptivePopover>
        </div>
      </div>
      <p className={styles.subject}>{subjectLabel}</p>
      <div className={styles.footerRow}>
        <span className={styles.time}>{timeLabel}</span>
        {isCanceled ? <span className={styles.statusBadge}>Отменено</span> : null}
      </div>
    </div>

      <LessonCancelDialog
        open={cancelDialogOpen}
        lesson={lesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setCancelDialogOpen(false)}
        onConfirm={handleConfirmCancel}
      />

      <LessonRestoreDialog
        open={restoreDialogOpen}
        lesson={restoreDialogOpen ? lesson : null}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setRestoreDialogOpen(false)}
        onConfirm={handleConfirmRestore}
      />

      <SeriesScopeDialog
        open={Boolean(scopeDialog)}
        title={scopeDialog?.type === 'cancel' ? cancelCopy.title.replace('?', '') : 'Восстановить урок'}
        confirmText={scopeDialog?.type === 'cancel' ? cancelCopy.confirmText : 'Восстановить'}
        previews={scopeDialog?.previews}
        onClose={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />
    </>
  );
};
