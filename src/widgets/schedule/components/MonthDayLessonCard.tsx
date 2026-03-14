import { addMinutes, format } from 'date-fns';
import { CSSProperties, MouseEvent } from 'react';
import { Lesson, LinkedStudent } from '../../../entities/types';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { MeetingLinkIcon, MoreHorizIcon, RotateIcon } from '../../../icons/MaterialIcons';
import { Ellipsis } from '../../../shared/ui/Ellipsis/Ellipsis';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel, isLessonInSeries, resolveLessonPaid } from '../../../entities/lesson/lib/lessonDetails';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import {
  resolveLessonHasPaidParticipant,
  resolveLessonMutationDisabledReason,
} from '../../../entities/lesson/lib/lessonMutationGuards';
import styles from './MonthDayLessonCard.module.css';

interface MonthDayLessonCardProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  style?: CSSProperties;
  isActionsOpen: boolean;
  onEdit: () => void;
  onTogglePaid: (studentId?: number) => void;
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
  timeZone,
  style,
  isActionsOpen,
  onEdit,
  onTogglePaid,
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
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const startTime = format(startDate, 'HH:mm');
  const endTime = format(endDate, 'HH:mm');
  const isPaid = resolveLessonPaid(lesson, participants);
  const participant = participants[0];
  const isCanceled = lesson.status === 'CANCELED';
  const isRecurring = isLessonInSeries(lesson);
  const mutationDisabledReason = resolveLessonMutationDisabledReason(lesson);
  const isCorrectionCancel = lesson.status === 'COMPLETED' || resolveLessonHasPaidParticipant(lesson);
  const paymentLabel = isPaid ? 'Оплачено' : 'Не оплачено';

  return (
    <div className={styles.cardWrap} style={style}>
      <div className={`${styles.card} ${isCanceled ? styles.canceled : ''}`} style={style} onClick={onEdit}>
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <div className={styles.headerInfo}>
              <div className={styles.timeBadge}>
                <span className={styles.timeStart}>{startTime}</span>
                <span className={styles.timeEnd}>{endTime}</span>
              </div>
              <Ellipsis className={styles.title} title={lessonLabel}>
                {lessonLabel}
              </Ellipsis>
            </div>
            <div
              className={[
                styles.headerControls,
                isRecurring ? styles.headerControlsWithRecurring : '',
                isActionsOpen ? styles.headerControlsExpanded : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isRecurring && (
                <Tooltip content="Повторяющееся занятие">
                  <span className={styles.recurringControl}>
                    <span className={styles.recurringIconBadge} aria-label="Повторяющееся занятие">
                      <RotateIcon className={styles.recurringIcon} />
                    </span>
                  </span>
                </Tooltip>
              )}
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
                  {!isCanceled && (
                    <>
                      <Tooltip content={mutationDisabledReason}>
                        <button
                          type="button"
                          className={styles.actionItem}
                          disabled={Boolean(mutationDisabledReason)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onReschedule();
                            onCloseActions();
                          }}
                        >
                          Перенести занятие
                        </button>
                      </Tooltip>
                      <Tooltip content={mutationDisabledReason}>
                        <button
                          type="button"
                          className={styles.actionItem}
                          disabled={Boolean(mutationDisabledReason)}
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
                        {isCorrectionCancel ? 'Исправить статус' : 'Отменить'}
                      </button>
                    </>
                  )}
                  {isCanceled && (
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
                  <Tooltip content={mutationDisabledReason}>
                    <button
                      type="button"
                      className={`${styles.actionItem} ${styles.actionDanger}`}
                      disabled={Boolean(mutationDisabledReason)}
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
          {(lesson.meetingLink || isCanceled) && (
            <div className={styles.metaRow}>
              {lesson.meetingLink && (
                <button
                  type="button"
                  className={styles.linkBadge}
                  onClick={(event) => onOpenMeetingLink(event, lesson.meetingLink as string)}
                >
                  <MeetingLinkIcon className={styles.linkIcon} />
                  Ссылка
                </button>
              )}
              {isCanceled && <span className={`${styles.linkBadge} ${styles.canceledBadge}`}>Отменено</span>}
            </div>
          )}
          {isPaid && (
            <>
              <div className={styles.divider} />
              <div className={styles.paymentRow}>
                <Tooltip content={paymentLabel}>
                  <button
                    type="button"
                    className={`${styles.paymentBadge} ${styles.paymentPaid}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePaid(participant?.studentId);
                    }}
                  >
                    <span className={styles.paymentIcon} aria-hidden="true" />
                    <span>{paymentLabel}</span>
                  </button>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
