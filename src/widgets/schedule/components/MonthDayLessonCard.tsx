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
  const showPrice = !isPaid && price !== undefined && price !== null;

  return (
    <div className={`${styles.card} ${isCanceled ? styles.canceled : ''}`} style={style} onClick={onEdit}>
      <span className={styles.accent} aria-hidden="true" />
      <div className={styles.timeBadge}>
        <span className={styles.timeStart}>{startTime}</span>
        <span className={styles.timeEnd}>{endTime}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.headerRow}>
          <Ellipsis className={styles.title} title={lessonLabel}>
            {lessonLabel}
          </Ellipsis>
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
        <div className={styles.metaRow}>
          {meetingLink && (
            <button type="button" className={styles.linkBadge} onClick={onOpenMeetingLink}>
              <MeetingLinkIcon className={styles.linkIcon} />
              Ссылка
            </button>
          )}
        </div>
        <div className={styles.divider} />
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
          {showPrice && <span className={styles.paymentPrice}>({price} ₽)</span>}
        </button>
      </div>
    </div>
  );
};
