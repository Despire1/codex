import { FC, KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faCircle,
  faClock,
  faEye,
  faFileLines,
  faHourglassHalf,
  faListCheck,
  faMicrophone,
  faPaperclip,
  faPen,
  faPlay,
  faRobot,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { HomeworkAssignment } from '../../../../entities/types';
import {
  formatStudentHomeworkScore,
  resolveStudentHomeworkActionLabel,
  resolveStudentHomeworkAttachmentLabel,
  resolveStudentHomeworkCardKind,
  resolveStudentHomeworkDeadlineMeta,
  resolveStudentHomeworkDescription,
  resolveStudentHomeworkDurationLabel,
  resolveStudentHomeworkHasAutoCheck,
  resolveStudentHomeworkInfoNote,
  resolveStudentHomeworkProgress,
  resolveStudentHomeworkResponseLabel,
  resolveStudentHomeworkScoreValue,
  resolveStudentHomeworkStatusLabel,
  resolveStudentHomeworkSubjectLabel,
} from '../model/lib/presentation';
import styles from './StudentHomeworkCard.module.css';

type StudentHomeworkCardProps = {
  assignment: HomeworkAssignment;
  onOpen: (assignment: HomeworkAssignment) => void;
};

const resolveStatusIcon = (kind: ReturnType<typeof resolveStudentHomeworkCardKind>) => {
  if (kind === 'overdue') return faTriangleExclamation;
  if (kind === 'submitted') return faHourglassHalf;
  if (kind === 'completed') return faCheck;
  return faCircle;
};

const resolveResponseIcon = (label: string) => {
  if (label === 'Тест') return faListCheck;
  if (label === 'Голосовое') return faMicrophone;
  return faFileLines;
};

const resolveActionIcon = (kind: ReturnType<typeof resolveStudentHomeworkCardKind>) => {
  if (kind === 'new') return faPlay;
  if (kind === 'submitted' || kind === 'completed') return faEye;
  return faPen;
};

const onCardKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  assignment: HomeworkAssignment,
  onOpen: (assignment: HomeworkAssignment) => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpen(assignment);
};

export const StudentHomeworkCard: FC<StudentHomeworkCardProps> = ({ assignment, onOpen }) => {
  const kind = resolveStudentHomeworkCardKind(assignment);
  const deadline = resolveStudentHomeworkDeadlineMeta(assignment);
  const subject = resolveStudentHomeworkSubjectLabel(assignment);
  const description = resolveStudentHomeworkDescription(assignment);
  const durationLabel = resolveStudentHomeworkDurationLabel(assignment);
  const responseLabel = resolveStudentHomeworkResponseLabel(assignment);
  const attachmentLabel = resolveStudentHomeworkAttachmentLabel(assignment);
  const hasAutoCheck = resolveStudentHomeworkHasAutoCheck(assignment);
  const progress = resolveStudentHomeworkProgress(assignment);
  const infoNote = resolveStudentHomeworkInfoNote(assignment);
  const scoreValue = resolveStudentHomeworkScoreValue(assignment);
  const actionLabel = resolveStudentHomeworkActionLabel(assignment);

  return (
    <article
      className={`${styles.card} ${styles[`card_${kind}`]}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(assignment)}
      onKeyDown={(event) => onCardKeyDown(event, assignment, onOpen)}
      aria-label={`${assignment.title}. ${actionLabel}`}
    >
      <div className={styles.body}>
        <div className={styles.headerRow}>
          <div className={styles.headMain}>
            <div className={styles.badgesRow}>
              <span className={`${styles.statusBadge} ${styles[`statusBadge_${kind}`]}`}>
                <FontAwesomeIcon icon={resolveStatusIcon(kind)} className={styles.statusIcon} />
                {resolveStudentHomeworkStatusLabel(kind)}
              </span>
              <span className={styles.subjectBadge}>{subject}</span>
              {scoreValue !== null ? <span className={styles.scoreBadge}>{formatStudentHomeworkScore(scoreValue)}</span> : null}
            </div>
            <h3 className={styles.title}>{assignment.title}</h3>
            <p className={styles.description}>{description}</p>
          </div>

          <div className={styles.deadlineWrap}>
            <div className={`${styles.deadlinePrimary} ${styles[`deadlinePrimary_${deadline.tone}`]}`}>{deadline.primary}</div>
            <div className={`${styles.deadlineSecondary} ${styles[`deadlineSecondary_${deadline.tone}`]}`}>{deadline.secondary}</div>
          </div>
        </div>

        {progress ? (
          <div className={styles.progressCard}>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>Прогресс</span>
              <span className={styles.progressValue}>
                {progress.completed} / {progress.total}
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}

        {infoNote ? <div className={`${styles.infoCard} ${styles[`infoCard_${infoNote.tone}`]}`}>
          <div className={styles.infoTitle}>{infoNote.title}</div>
          <div className={styles.infoText}>{infoNote.text}</div>
        </div> : null}

        <div className={styles.footerRow}>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={faClock} />
              {durationLabel}
            </span>
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={resolveResponseIcon(responseLabel)} />
              {responseLabel}
            </span>
            {attachmentLabel ? (
              <span className={styles.metaItem}>
                <FontAwesomeIcon icon={faPaperclip} />
                {attachmentLabel}
              </span>
            ) : null}
            {hasAutoCheck ? (
              <span className={styles.metaItemAccent}>
                <FontAwesomeIcon icon={faRobot} />
                Авто-проверка
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className={`${styles.actionButton} ${styles[`actionButton_${kind}`]}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(assignment);
            }}
          >
            <FontAwesomeIcon icon={resolveActionIcon(kind)} />
            {actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
};
