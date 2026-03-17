import { useEffect, useState } from 'react';
import { getParticipantName, type LessonParticipantLike } from '@/entities/lesson/lib/lessonDetails';
import type { LessonPaymentTone } from '@/entities/lesson/lib/lessonStatusPresentation';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import styles from './LessonPopoverPaymentControl.module.css';

interface LessonPopoverPaymentControlProps {
  lesson: Lesson;
  participants: LessonParticipantLike[];
  linkedStudentsById: Map<number, LinkedStudent>;
  paymentLabel: string;
  paymentTone: LessonPaymentTone;
  badgeClassName: string;
  onTogglePaid: (studentId?: number) => void;
}

const getPaymentActionLabel = (isPaid: boolean) => (isPaid ? 'Отменить оплату' : 'Отметить оплату');

export const LessonPopoverPaymentControl = ({
  lesson,
  participants,
  linkedStudentsById,
  paymentLabel,
  paymentTone,
  badgeClassName,
  onTogglePaid,
}: LessonPopoverPaymentControlProps) => {
  const [isParticipantListOpen, setIsParticipantListOpen] = useState(false);
  const isGroupLesson = participants.length > 1;
  const primaryParticipant = participants[0];
  const aggregateTooltip = isGroupLesson
    ? 'Изменить оплату ученика'
    : getPaymentActionLabel(Boolean(primaryParticipant?.isPaid));

  useEffect(() => {
    setIsParticipantListOpen(false);
  }, [lesson.id, paymentLabel, paymentTone]);

  const handleBadgeClick = () => {
    if (!isGroupLesson) {
      onTogglePaid(primaryParticipant?.studentId);
      return;
    }

    setIsParticipantListOpen((current) => !current);
  };

  return (
    <div className={styles.root}>
      <Tooltip content={aggregateTooltip}>
        <button
          type="button"
          className={[
            badgeClassName,
            styles.badgeButton,
            isParticipantListOpen ? styles.badgeButtonExpanded : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={aggregateTooltip}
          aria-expanded={isGroupLesson ? isParticipantListOpen : undefined}
          aria-haspopup={isGroupLesson ? 'menu' : undefined}
          onClick={handleBadgeClick}
        >
          {paymentLabel}
        </button>
      </Tooltip>

      {isGroupLesson && isParticipantListOpen ? (
        <div className={styles.participantList} role="menu" aria-label="Выбор ученика для изменения оплаты">
          <p className={styles.participantListHint}>Выберите ученика, для которого нужно изменить оплату.</p>
          {participants.map((participant) => {
            const participantName = getParticipantName(participant, linkedStudentsById);
            const isPaid = Boolean(participant.isPaid);
            const participantActionLabel = getPaymentActionLabel(isPaid);

            return (
              <Tooltip key={participant.studentId} content={participantActionLabel} className={styles.participantTooltip}>
                <button
                  type="button"
                  className={styles.participantButton}
                  role="menuitem"
                  onClick={() => {
                    setIsParticipantListOpen(false);
                    onTogglePaid(participant.studentId);
                  }}
                >
                  <span className={styles.participantName}>{participantName}</span>
                  <span
                    className={[
                      styles.participantStatus,
                      isPaid ? styles.participantStatusPaid : styles.participantStatusUnpaid,
                    ].join(' ')}
                  >
                    {isPaid ? 'Оплачено' : 'Не оплачено'}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
