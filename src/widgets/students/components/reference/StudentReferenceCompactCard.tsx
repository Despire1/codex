import { type CSSProperties, type FC, type KeyboardEvent, useMemo } from 'react';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import { buildCompactStudentCardPresentation, getStudentDisplayName, getStudentInitials } from '../../model/referencePresentation';
import { StudentReferenceCardMenu } from './StudentReferenceCardMenu';
import { type StudentReferenceCardProps } from './StudentReferenceCard.types';
import styles from './StudentReferenceCompactCard.module.css';

export const StudentReferenceCompactCard: FC<StudentReferenceCardProps> = ({
  item,
  timeZone,
  onOpenStudent,
  onEditStudent,
  onDeleteStudent,
  onScheduleLesson,
  onWriteStudent,
  onTopUpBalance,
  onAssignHomework,
}) => {
  const presentation = useMemo(() => buildCompactStudentCardPresentation(item, timeZone), [item, timeZone]);
  const hasAlerts = presentation.alerts.length > 0;
  const inactiveStudentHint = 'Ученик ещё не активирован: ему нужно нажать Start в Telegram, чтобы появиться в системе и получать уведомления.';
  const accentStyle = useMemo(
    () =>
      ({
        '--student-accent': presentation.uiColor,
      }) as CSSProperties,
    [presentation.uiColor],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpenStudent(item.student.id);
  };

  return (
    <article
      className={styles.card}
      style={accentStyle}
      role="button"
      tabIndex={0}
      onClick={() => onOpenStudent(item.student.id)}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.surface}>
        <div className={styles.header}>
          <div className={`${styles.identity} ${!hasAlerts ? styles.identityCentered : ''}`}>
            <div
              className={styles.avatar}
              style={{
                borderColor: presentation.uiColor,
                background: presentation.uiColor,
                color: '#ffffff',
              }}
            >
              {getStudentInitials(item)}
            </div>

            <div className={styles.identityText}>
              <div className={styles.nameRow}>
                <h3 className={styles.name}>{getStudentDisplayName(item)}</h3>
                {presentation.levelLabel ? <span className={styles.levelBadge}>{presentation.levelLabel}</span> : null}
              </div>

              {hasAlerts ? (
                <div className={styles.alertsRow}>
                  {presentation.alerts.map((alert) => {
                    const chipClassName = `${styles.alertChip} ${
                      alert.tone === 'danger'
                        ? styles.alertDanger
                        : alert.tone === 'warning'
                          ? styles.alertWarning
                          : alert.tone === 'inactive'
                            ? styles.alertInactive
                            : alert.tone === 'success'
                              ? styles.alertSuccess
                              : styles.alertMuted
                    }`;

                    const chip = (
                      <span key={`${item.student.id}-${alert.kind}`} className={chipClassName}>
                        {alert.label}
                      </span>
                    );

                    if (alert.kind !== 'inactive') {
                      return chip;
                    }

                    return (
                      <Tooltip
                        key={`${item.student.id}-${alert.kind}`}
                        content={inactiveStudentHint}
                        side="bottom"
                        align="start"
                      >
                        {chip}
                      </Tooltip>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <StudentReferenceCardMenu
            studentId={item.student.id}
            onEditStudent={onEditStudent}
            onDeleteStudent={onDeleteStudent}
            onScheduleLesson={onScheduleLesson}
            onWriteStudent={onWriteStudent}
            onTopUpBalance={onTopUpBalance}
            onAssignHomework={onAssignHomework}
            hasTelegram={Boolean(item.student.username) || item.student.isActivated}
          />
        </div>

        <div className={styles.nextLessonRow}>
          <span
            className={`${styles.nextLessonDot} ${
              presentation.nextLessonTone === 'today'
                ? styles.nextLessonDotToday
                : presentation.nextLessonTone === 'future'
                  ? styles.nextLessonDotFuture
                  : styles.nextLessonDotNone
            }`}
            aria-hidden
          />
          <span className={styles.nextLessonText}>{presentation.nextLessonShortLabel}</span>
        </div>

        <div className={styles.statsRow}>
          <span className={styles.statPill}>{presentation.lessonsLabel}</span>
          <span className={styles.statPill}>{presentation.homeworkLabel}</span>
        </div>
      </div>
    </article>
  );
};
