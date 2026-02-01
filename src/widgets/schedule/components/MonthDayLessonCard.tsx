import { CSSProperties, MouseEvent } from 'react';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { MeetingLinkIcon, MoreHorizIcon } from '../../../icons/MaterialIcons';
import { Ellipsis } from '../../../shared/ui/Ellipsis/Ellipsis';
import styles from './MonthDayLessonCard.module.css';

interface MonthDayLessonCardProps {
  lessonId: number;
  lessonLabel: string;
  startTime: string;
  endTime: string;
  isPaid: boolean;
  price?: number | null;
  meetingLink?: string | null;
  style?: CSSProperties;
  isCanceled?: boolean;
  isActionsOpen: boolean;
  onEdit: () => void;
  onTogglePaid: () => void;
  onOpenActions: () => void;
  onCloseActions: () => void;
  onDelete: () => void;
  onReschedule: () => void;
  onOpenMeetingLink: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const MonthDayLessonCard = ({
  lessonId,
  lessonLabel,
  startTime,
  endTime,
  isPaid,
  price,
  meetingLink,
  style,
  isCanceled = false,
  isActionsOpen,
  onEdit,
  onTogglePaid,
  onOpenActions,
  onCloseActions,
  onDelete,
  onReschedule,
  onOpenMeetingLink,
}: MonthDayLessonCardProps) => {
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
                      onOpenActions();
                    }}
                  >
                    <MoreHorizIcon width={18} height={18} />
                  </button>
                }
              >
                <div className={styles.actionsPopover} role="menu" aria-label={`Действия для занятия #${lessonId}`}>
                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReschedule();
                      onCloseActions();
                    }}
                  >
                    Перенести занятие
                  </button>
                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit();
                      onCloseActions();
                    }}
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionItem} ${styles.actionDanger}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete();
                      onCloseActions();
                    }}
                  >
                    Удалить занятие
                  </button>
                </div>
              </AdaptivePopover>
            </div>
            {meetingLink && (
              <div className={styles.metaRow}>
                <button type="button" className={styles.linkBadge} onClick={onOpenMeetingLink}>
                  <MeetingLinkIcon className={styles.linkIcon} />
                  Ссылка
                </button>
              </div>
            )}
            <div className={styles.divider} />
            <div className={styles.paymentRow}>
              <button
                type="button"
                className={`${styles.paymentBadge} ${isPaid ? styles.paymentPaid : styles.paymentUnpaid}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePaid();
                }}
                title={paymentLabel}
              >
                <span className={styles.paymentIcon} aria-hidden="true" />
                <span>{paymentLabel}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
  );
};
