import { FC, KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookOpen,
  faCircleCheck,
  faClipboardList,
  faHourglassHalf,
  faListCheck,
  faMicrophone,
  faPen,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { HomeworkAssignment } from '../../../../entities/types';
import {
  formatStudentHomeworkScore,
  resolveStudentHomeworkCardKind,
  resolveStudentHomeworkDescription,
  resolveStudentHomeworkScoreValue,
  resolveStudentHomeworkSubjectLabel,
} from '../model/lib/presentation';
import {
  resolveStudentHomeworkReferenceActionMeta,
  resolveStudentHomeworkReferenceDeadlineMeta,
  resolveStudentHomeworkReferenceProgressMeta,
  resolveStudentHomeworkReferenceStatusMeta,
  resolveStudentHomeworkReferenceTypeMeta,
} from '../model/lib/referencePresentation';
import styles from './StudentHomeworkTableSection.module.css';

type StudentHomeworkTableSectionProps = {
  assignments: HomeworkAssignment[];
  loading: boolean;
  onRefresh: () => void;
  onOpenAssignment: (assignment: HomeworkAssignment) => void;
};

type HomeworkTaskIconTone = 'danger' | 'green' | 'amber' | 'blue' | 'purple' | 'slate';

const resolveTaskIconMeta = (
  assignment: HomeworkAssignment,
): { icon: typeof faClipboardList; tone: HomeworkTaskIconTone } => {
  const kind = resolveStudentHomeworkCardKind(assignment);
  const subject = resolveStudentHomeworkSubjectLabel(assignment);

  if (kind === 'overdue') return { icon: faTriangleExclamation, tone: 'danger' };
  if (kind === 'submitted') return { icon: faHourglassHalf, tone: 'amber' };
  if (kind === 'completed') return { icon: faCircleCheck, tone: 'green' };

  if (subject === 'Лексика') return { icon: faListCheck, tone: 'green' };
  if (subject === 'Чтение') return { icon: faBookOpen, tone: 'green' };
  if (subject === 'Speaking') return { icon: faMicrophone, tone: 'purple' };
  if (subject === 'Writing') return { icon: faPen, tone: 'blue' };

  return { icon: faClipboardList, tone: 'slate' };
};

const onRowKeyDown = (
  event: KeyboardEvent<HTMLTableRowElement>,
  assignment: HomeworkAssignment,
  onOpenAssignment: (assignment: HomeworkAssignment) => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpenAssignment(assignment);
};

export const StudentHomeworkTableSection: FC<StudentHomeworkTableSectionProps> = ({
  assignments,
  loading,
  onRefresh,
  onOpenAssignment,
}) => {
  return (
    <section className={styles.section} aria-label="Список домашних заданий">
      <div className={styles.tableWrap}>
        <div className={styles.scrollArea}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Задание</th>
                <th>Тип</th>
                <th>Статус</th>
                <th>Дедлайн</th>
                <th>Прогресс</th>
                <th className={styles.actionsHead}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyState}>Загрузка заданий…</div>
                  </td>
                </tr>
              ) : null}

              {!loading && assignments.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.emptyState}>
                      <p>По выбранным фильтрам ничего не найдено.</p>
                      <button type="button" onClick={onRefresh}>
                        Обновить список
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading
                ? assignments.map((assignment) => {
                    const typeMeta = resolveStudentHomeworkReferenceTypeMeta(assignment);
                    const statusMeta = resolveStudentHomeworkReferenceStatusMeta(assignment);
                    const deadlineMeta = resolveStudentHomeworkReferenceDeadlineMeta(assignment);
                    const progressMeta = resolveStudentHomeworkReferenceProgressMeta(assignment);
                    const actionMeta = resolveStudentHomeworkReferenceActionMeta(assignment);
                    const scoreValue = resolveStudentHomeworkScoreValue(assignment);
                    const iconMeta = resolveTaskIconMeta(assignment);

                    return (
                      <tr
                        key={assignment.id}
                        className={styles.row}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenAssignment(assignment)}
                        onKeyDown={(event) => onRowKeyDown(event, assignment, onOpenAssignment)}
                        aria-label={`Открыть домашку ${assignment.title}`}
                      >
                        <td>
                          <div className={styles.taskCell}>
                            <span className={`${styles.taskIcon} ${styles[`taskIcon_${iconMeta.tone}`]}`}>
                              <FontAwesomeIcon icon={iconMeta.icon} />
                            </span>
                            <div className={styles.taskMain}>
                              <div className={styles.taskTitleRow}>
                                <h3 className={styles.taskTitle}>{assignment.title}</h3>
                                {statusMeta.tone === 'completed' && scoreValue !== null ? (
                                  <span className={styles.scorePill}>{formatStudentHomeworkScore(scoreValue)}</span>
                                ) : null}
                              </div>
                              <p className={styles.taskDescription}>{resolveStudentHomeworkDescription(assignment)}</p>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className={`${styles.typeBadge} ${styles[`typeBadge_${typeMeta.tone}`]}`}>{typeMeta.label}</span>
                        </td>

                        <td>
                          <span className={`${styles.statusBadge} ${styles[`statusBadge_${statusMeta.tone}`]}`}>
                            <span className={`${styles.statusDot} ${styles[`statusDot_${statusMeta.tone}`]}`} />
                            {statusMeta.label}
                          </span>
                        </td>

                        <td>
                          <div className={styles.deadlineCell}>
                            <div className={`${styles.deadlinePrimary} ${styles[`deadlinePrimary_${deadlineMeta.tone}`]}`}>
                              {deadlineMeta.primary}
                            </div>
                            <div className={`${styles.deadlineSecondary} ${styles[`deadlineSecondary_${deadlineMeta.tone}`]}`}>
                              {deadlineMeta.secondary}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className={styles.progressWrap}>
                            <div className={styles.progressTrack}>
                              <div
                                className={`${styles.progressBar} ${styles[`progressBar_${progressMeta.tone}`]}`}
                                style={{ width: `${progressMeta.percent}%` }}
                              />
                            </div>
                            <span className={`${styles.progressLabel} ${styles[`progressLabel_${progressMeta.tone}`]}`}>
                              {progressMeta.label}
                            </span>
                          </div>
                        </td>

                        <td className={styles.actionsCell}>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles[`actionButton_${actionMeta.tone}`]}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenAssignment(assignment);
                            }}
                          >
                            {actionMeta.label}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
