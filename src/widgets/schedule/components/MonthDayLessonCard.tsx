import { addMinutes, format } from 'date-fns';
import { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { HomeworkAssignment, Lesson, LinkedStudent } from '../../../entities/types';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { BookOpenIcon, MeetingLinkIcon, MoreHorizIcon, RotateIcon } from '../../../icons/MaterialIcons';
import { Ellipsis } from '../../../shared/ui/Ellipsis/Ellipsis';
import { getLessonColorTheme, getLessonColorVars } from '../../../shared/lib/lessonColors';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel, isLessonInSeries } from '../../../entities/lesson/lib/lessonDetails';
import { resolveLessonCancelActionCopy } from '../../../entities/lesson/lib/lessonStatusPresentation';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import {
  resolveLessonDeleteDisabledReason,
  resolveLessonEditDisabledReason,
  resolveLessonMutationDisabledReason,
} from '../../../entities/lesson/lib/lessonMutationGuards';
import {
  resolveMonthDayHomeworkSummary,
  resolveMonthDayHomeworkTitle,
  resolveMonthDayLessonSubtitle,
} from '../model/monthDayLessonPresentation';
import styles from './MonthDayLessonCard.module.css';

interface MonthDayLessonCardProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  homeworkAssignments: HomeworkAssignment[];
  timeZone: string;
  style?: CSSProperties;
  isActionsOpen: boolean;
  onOpenHomeworkAssignment: (assignment: HomeworkAssignment) => void;
  onEdit: () => void;
  onOpenActions: () => void;
  onCloseActions: () => void;
  onDelete: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onOpenMeetingLink: (event: MouseEvent<HTMLButtonElement>, meetingLink: string) => void;
}

export const MonthDayLessonCard = ({
  lesson,
  linkedStudentsById,
  homeworkAssignments,
  timeZone,
  style,
  isActionsOpen,
  onOpenHomeworkAssignment,
  onEdit,
  onOpenActions,
  onCloseActions,
  onDelete,
  onReschedule,
  onCancel,
  onRestore,
  onOpenMeetingLink,
}: MonthDayLessonCardProps) => {
  const participants = buildParticipants(lesson, linkedStudentsById);
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);
  const subtitle = resolveMonthDayLessonSubtitle(lesson, participants);
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const startTime = format(startDate, 'HH:mm');
  const endTime = format(endDate, 'HH:mm');
  const isCanceled = lesson.status === 'CANCELED';
  const isRecurring = isLessonInSeries(lesson);
  const { primaryAssignment, extraCount } = resolveMonthDayHomeworkSummary(homeworkAssignments);
  const rescheduleDisabledReason = resolveLessonMutationDisabledReason(lesson);
  const editDisabledReason = resolveLessonEditDisabledReason(lesson);
  const deleteDisabledReason = resolveLessonDeleteDisabledReason(lesson);
  const cancelCopy = resolveLessonCancelActionCopy(lesson);
  const hasMetaRow = Boolean(primaryAssignment || lesson.meetingLink || isCanceled);
  const lessonColorTheme = getLessonColorTheme(lesson.color);
  const styleVars = {
    ...getLessonColorVars(lesson.color),
    '--lesson-text': lessonColorTheme.hoverBackground,
    '--lesson-strong-border': lessonColorTheme.hoverBorder,
    '--lesson-strong-text': lessonColorTheme.hoverText,
  } as CSSProperties;

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onEdit();
  };

  return (
    <div className={styles.cardWrap} style={style}>
      <div
        className={`${styles.card} ${isCanceled ? styles.canceled : ''}`}
        style={styleVars}
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={handleCardKeyDown}
      >
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <div className={styles.headerInfo}>
              <div className={styles.timeBadge}>
                <span className={styles.timeStart}>{startTime}</span>
                <span className={styles.timeDivider} aria-hidden="true" />
                <span className={styles.timeEnd}>{endTime}</span>
              </div>

              <div className={styles.identity}>
                <Ellipsis className={styles.title} title={lessonLabel}>
                  {lessonLabel}
                </Ellipsis>
                <p className={styles.subtitle}>{subtitle}</p>
              </div>
            </div>

            <div className={styles.headerControls}>
              {isRecurring ? (
                <Tooltip content="Повторяющееся занятие">
                  <span className={styles.recurringIconBadge} aria-label="Повторяющееся занятие">
                    <RotateIcon className={styles.recurringIcon} />
                  </span>
                </Tooltip>
              ) : null}

              <AdaptivePopover
                isOpen={isActionsOpen}
                onClose={onCloseActions}
                side="bottom"
                align="end"
                trigger={
                  <button
                    type="button"
                    className={styles.actionsButton}
                    aria-label="Быстрые действия"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isActionsOpen) {
                        onCloseActions();
                        return;
                      }
                      onOpenActions();
                    }}
                  >
                    <MoreHorizIcon width={18} height={18} />
                  </button>
                }
              >
                <div className={styles.actionsPopover} role="menu" aria-label={`Действия для занятия #${lesson.id}`}>
                  {!isCanceled ? (
                    <>
                      <Tooltip content={rescheduleDisabledReason}>
                        <button
                          type="button"
                          className={styles.actionItem}
                          disabled={Boolean(rescheduleDisabledReason)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onReschedule();
                            onCloseActions();
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
                            onEdit();
                            onCloseActions();
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
                          onCancel();
                          onCloseActions();
                        }}
                      >
                        {cancelCopy.actionLabel}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.actionItem}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRestore();
                        onCloseActions();
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
                        onDelete();
                        onCloseActions();
                      }}
                    >
                      Удалить занятие
                    </button>
                  </Tooltip>
                </div>
              </AdaptivePopover>
            </div>
          </div>

          {hasMetaRow ? (
            <div className={styles.metaRow}>
              {primaryAssignment ? (
                <Tooltip content={resolveMonthDayHomeworkTitle(primaryAssignment)} align="start">
                  <button
                    type="button"
                    className={styles.homeworkBadge}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenHomeworkAssignment(primaryAssignment);
                    }}
                  >
                    <BookOpenIcon className={styles.homeworkIcon} />
                    <span className={styles.homeworkBadgeLabel}>{resolveMonthDayHomeworkTitle(primaryAssignment)}</span>
                  </button>
                </Tooltip>
              ) : null}

              {extraCount > 0 ? <span className={styles.homeworkCountBadge}>+{extraCount}</span> : null}

              {lesson.meetingLink ? (
                <button
                  type="button"
                  className={styles.linkBadge}
                  onClick={(event) => onOpenMeetingLink(event, lesson.meetingLink as string)}
                >
                  <MeetingLinkIcon className={styles.linkIcon} />
                  Ссылка
                </button>
              ) : null}

              {isCanceled ? <span className={`${styles.linkBadge} ${styles.canceledBadge}`}>Отменено</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
