import { type FC, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAddressCard,
  faArrowLeft,
  faBookOpen,
  faCalendar,
  faCalendarDays,
  faCalendarPlus,
  faChartLine,
  faCheck,
  faClock,
  faComment,
  faEllipsis,
  faEnvelope,
  faPaperPlane,
  faPhone,
  faStar,
  faVideo,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { Homework, Lesson, PaymentEvent, StudentDebtItem, StudentListItem } from '../../../../entities/types';
import {
  buildProfileStats,
  buildProgressSeries,
  buildStudentCardPresentation,
  formatPaymentEventLabel,
  formatPaymentStatusLabel,
  getStatusUiMeta,
  getStudentDisplayName,
  getStudentInitials,
} from '../../model/referencePresentation';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import styles from './StudentsReferenceProfileView.module.css';

type ProfileTabId = 'homework' | 'lessons' | 'payments';

interface StudentsReferenceProfileViewProps {
  studentEntry: StudentListItem;
  studentHomeworks: Homework[];
  studentHomeworksLoading: boolean;
  studentLessons: Lesson[];
  studentLessonsLoading: boolean;
  studentLessonsSummary: Lesson[];
  studentDebtItems: StudentDebtItem[];
  payments: PaymentEvent[];
  paymentsLoading: boolean;
  activeTab: ProfileTabId;
  onTabChange: (tab: ProfileTabId) => void;
  onBack: () => void;
  onScheduleLesson: () => void;
  onWriteToStudent: () => void;
  onRemindHomework: (homeworkId: number) => void;
  onOpenLesson: (lesson: Lesson) => void;
  timeZone: string;
}

const profileTabs: Array<{ id: ProfileTabId; label: string; icon: typeof faBookOpen }> = [
  { id: 'homework', label: 'Домашние задания', icon: faBookOpen },
  { id: 'lessons', label: 'Занятия', icon: faCalendarDays },
  { id: 'payments', label: 'Оплаты', icon: faWallet },
];

const buildChartPolyline = (points: number[], width: number, height: number) => {
  if (points.length === 0) return { line: '', area: '' };
  const safeHeight = Math.max(1, height);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const linePoints = points.map((point, index) => `${index * step},${safeHeight - point}`).join(' ');
  const area = `0,${safeHeight} ${linePoints} ${width},${safeHeight}`;
  return { line: linePoints, area };
};

export const StudentsReferenceProfileView: FC<StudentsReferenceProfileViewProps> = ({
  studentEntry,
  studentHomeworks,
  studentHomeworksLoading,
  studentLessons,
  studentLessonsLoading,
  studentLessonsSummary,
  studentDebtItems,
  payments,
  paymentsLoading,
  activeTab,
  onTabChange,
  onBack,
  onScheduleLesson,
  onWriteToStudent,
  onRemindHomework,
  onOpenLesson,
  timeZone,
}) => {
  const cardPresentation = buildStudentCardPresentation(studentEntry, timeZone);
  const statusMeta = getStatusUiMeta(cardPresentation.status);
  const profileStats = buildProfileStats(studentEntry, studentLessonsSummary, studentHomeworks, studentDebtItems);
  const progress = buildProgressSeries(studentLessonsSummary, timeZone);

  const chartHeight = 170;
  const chartWidth = 360;
  const normalizedChart = progress.points.map((point) => (point.value / progress.maxValue) * 150);
  const chartGeometry = buildChartPolyline(normalizedChart, chartWidth, chartHeight);

  const homeworksOrdered = useMemo(
    () => [...studentHomeworks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [studentHomeworks],
  );
  const lessonsOrdered = useMemo(
    () => [...studentLessons].sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 8),
    [studentLessons],
  );
  const paymentsOrdered = useMemo(
    () => [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [payments],
  );

  const generatedNotes = useMemo(() => {
    const notes: Array<{ text: string; date: string; tone: 'warning' | 'info' }> = [];

    if (studentDebtItems.length > 0) {
      notes.push({
        text: `Есть неоплаченные занятия: ${studentDebtItems.length}. Стоит напомнить об оплате.`,
        date: formatInTimeZone(new Date(), 'd MMM yyyy', { timeZone }),
        tone: 'warning',
      });
    }

    if (profileStats.averageScore >= 8) {
      notes.push({
        text: 'Хороший прогресс по домашним заданиям. Можно добавить задания повышенной сложности.',
        date: formatInTimeZone(new Date(), 'd MMM yyyy', { timeZone }),
        tone: 'info',
      });
    }

    if (notes.length === 0) {
      notes.push({
        text: 'Заметок пока нет. Добавьте заметку после следующего занятия.',
        date: formatInTimeZone(new Date(), 'd MMM yyyy', { timeZone }),
        tone: 'info',
      });
    }

    return notes.slice(0, 2);
  }, [profileStats.averageScore, studentDebtItems.length, timeZone]);

  const renderHomeworkTab = () => {
    if (studentHomeworksLoading && homeworksOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем домашние задания…</div>;
    }

    if (homeworksOrdered.length === 0) {
      return <div className={styles.tabEmpty}>У ученика пока нет домашних заданий.</div>;
    }

    return (
      <div className={styles.listStack}>
        {homeworksOrdered.map((homework) => {
          const done = homework.isDone || homework.status === 'DONE';
          const inProgress = homework.status === 'IN_PROGRESS';
          const assigned = homework.status === 'ASSIGNED';
          const statusLabel = done ? 'Выполнено' : inProgress ? 'В процессе' : assigned ? 'Назначено' : 'Черновик';

          return (
            <article
              key={homework.id}
              className={`${styles.activityCard} ${
                done ? styles.activityDone : inProgress ? styles.activityProgress : styles.activityScheduled
              }`}
            >
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.activityTitle}>{homework.text.slice(0, 70) || 'Домашнее задание'}</h3>
                  <p className={styles.activitySubtitle}>
                    {homework.deadlineAt || homework.deadline
                      ? `Срок: ${formatInTimeZone(homework.deadlineAt ?? homework.deadline ?? '', 'd MMM yyyy', {
                          timeZone,
                        })}`
                      : 'Без дедлайна'}
                  </p>
                </div>
                <span className={styles.statusBadge}>{statusLabel}</span>
              </div>

              <div className={styles.activityFooter}>
                <div className={styles.activityMetaLine}>
                  <FontAwesomeIcon icon={faClock} />
                  <span>
                    {done ? 'Завершено' : inProgress ? 'Выполняется' : 'Ожидает выполнения'}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.activityActionButton}
                  onClick={() => {
                    if (!done) {
                      onRemindHomework(homework.id);
                    }
                  }}
                >
                  {done ? 'Посмотреть' : 'Напомнить'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderLessonsTab = () => {
    if (studentLessonsLoading && lessonsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем занятия…</div>;
    }

    if (lessonsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Занятия пока не назначены.</div>;
    }

    return (
      <div className={styles.listStack}>
        {lessonsOrdered.map((lesson) => {
          const lessonTimestamp = new Date(lesson.startAt).getTime();
          const isUpcoming = lesson.status === 'SCHEDULED' && lessonTimestamp > Date.now();
          const statusLabel = isUpcoming ? 'Предстоящее' : lesson.status === 'COMPLETED' ? 'Проведено' : 'Отменено';
          const lessonEndAt = new Date(lessonTimestamp + Math.max(0, lesson.durationMinutes || 0) * 60_000);

          return (
            <article
              key={lesson.id}
              className={`${styles.activityCard} ${isUpcoming ? styles.activityDone : styles.activityMuted}`}
            >
              <div className={styles.activityHeader}>
                <div className={styles.lessonIconWrap}>
                  <FontAwesomeIcon icon={isUpcoming ? faCalendarPlus : faCheck} />
                </div>
                <div className={styles.lessonMainBlock}>
                  <h3 className={styles.activityTitle}>
                    {formatInTimeZone(lesson.startAt, 'd MMM • HH:mm', { timeZone })} -{' '}
                    {formatInTimeZone(lessonEndAt, 'HH:mm', { timeZone })}
                  </h3>
                  <p className={styles.activitySubtitle}>{lesson.meetingLink ? 'Онлайн занятие' : 'Индивидуальный урок'}</p>
                </div>
                <span className={styles.statusBadge}>{statusLabel}</span>
              </div>

              <div className={styles.activityFooter}>
                <div className={styles.activityMetaLine}>
                  <FontAwesomeIcon icon={faVideo} />
                  <span>{lesson.meetingLink ? 'Есть ссылка на встречу' : 'Ссылка не указана'}</span>
                </div>

                <button
                  type="button"
                  className={styles.activityActionButton}
                  onClick={() => {
                    if (lesson.meetingLink && isUpcoming) {
                      window.open(lesson.meetingLink, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    onOpenLesson(lesson);
                  }}
                >
                  {lesson.meetingLink && isUpcoming ? 'Подключиться' : 'Открыть'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderPaymentsTab = () => {
    if (paymentsLoading && paymentsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем оплаты…</div>;
    }

    if (paymentsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Платежей пока нет.</div>;
    }

    return (
      <div className={styles.listStack}>
        {paymentsOrdered.map((event) => {
          const paymentStatus = formatPaymentStatusLabel(event);
          const amountLabel =
            typeof event.moneyAmount === 'number' && event.moneyAmount > 0
              ? `${event.moneyAmount.toLocaleString('ru-RU')} ₽`
              : `${event.lessonsDelta > 0 ? '+' : ''}${event.lessonsDelta} урок.`;

          return (
            <article key={event.id} className={styles.activityCard}>
              <div className={styles.activityHeaderSimple}>
                <div>
                  <h3 className={styles.activityTitle}>{amountLabel}</h3>
                  <p className={styles.activitySubtitle}>
                    {formatPaymentEventLabel(event)} • {formatInTimeZone(event.createdAt, 'd MMM yyyy', { timeZone })}
                  </p>
                </div>
                <span
                  className={`${styles.statusBadge} ${
                    paymentStatus.tone === 'paid'
                      ? styles.statusPaid
                      : paymentStatus.tone === 'charge'
                        ? styles.statusCharge
                        : styles.statusPending
                  }`}
                >
                  {paymentStatus.label}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const tabContent =
    activeTab === 'homework' ? renderHomeworkTab() : activeTab === 'lessons' ? renderLessonsTab() : renderPaymentsTab();

  const phoneLabel = 'Не указан';
  const emailLabel = 'Не указан';

  return (
    <div className={styles.screen}>
      <div className={styles.scrollArea}>
        <div className={styles.inner}>
          <div className={styles.backRow}>
            <button type="button" className={styles.backButton} onClick={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <h2 className={styles.backTitle}>Назад к списку</h2>
          </div>

          <section className={styles.heroCard}>
            <div className={styles.heroMainRow}>
              <div className={styles.heroIdentity}>
                <div
                  className={styles.heroAvatar}
                  style={{
                    background: cardPresentation.uiColor,
                    borderColor: cardPresentation.uiColor,
                    color: '#ffffff',
                  }}
                >
                  {getStudentInitials(studentEntry)}
                </div>
                <div>
                  <h1 className={styles.heroName}>{getStudentDisplayName(studentEntry)}</h1>
                  <div className={styles.heroBadges}>
                    <span className={styles.heroLevelBadge}>{cardPresentation.levelLabel}</span>
                    <span
                      className={`${styles.heroStatusBadge} ${
                        statusMeta.tone === 'active'
                          ? styles.heroStatusActive
                          : statusMeta.tone === 'paused'
                            ? styles.heroStatusPaused
                            : styles.heroStatusCompleted
                      }`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className={styles.heroContactsRow}>
                    <span>
                      <FontAwesomeIcon icon={faEnvelope} /> {emailLabel}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faPhone} /> {phoneLabel}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faCalendar} /> С нами с{' '}
                      {studentEntry.student.createdAt
                        ? formatInTimeZone(studentEntry.student.createdAt, 'd MMM yyyy', { timeZone })
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryAction} onClick={onWriteToStudent}>
                  <FontAwesomeIcon icon={faComment} /> Написать
                </button>
                <button type="button" className={styles.primaryAction} onClick={onScheduleLesson}>
                  <FontAwesomeIcon icon={faCalendarPlus} /> Назначить занятие
                </button>
                <button type="button" className={styles.menuAction} aria-label="Дополнительные действия">
                  <FontAwesomeIcon icon={faEllipsis} />
                </button>
              </div>
            </div>

            <div className={styles.heroStatsGrid}>
              <div>
                <div className={styles.heroStatValue}>{profileStats.lessonsConducted}</div>
                <div className={styles.heroStatLabel}>Занятий проведено</div>
              </div>
              <div>
                <div className={`${styles.heroStatValue} ${styles.heroStatGreen}`}>{profileStats.attendanceRate}%</div>
                <div className={styles.heroStatLabel}>Посещаемость</div>
              </div>
              <div>
                <div className={`${styles.heroStatValue} ${styles.heroStatBlue}`}>{profileStats.averageScore}</div>
                <div className={styles.heroStatLabel}>Средний балл</div>
              </div>
              <div>
                <div className={`${styles.heroStatValue} ${styles.heroStatViolet}`}>{profileStats.completedHomeworks}</div>
                <div className={styles.heroStatLabel}>Домашек сдано</div>
              </div>
              <div>
                <div className={`${styles.heroStatValue} ${styles.heroStatOrange}`}>{profileStats.courseProgress}%</div>
                <div className={styles.heroStatLabel}>Прогресс курса</div>
              </div>
            </div>
          </section>

          <div className={styles.bodyGrid}>
            <div className={styles.mainColumn}>
              <section className={styles.tabsCard}>
                <div className={styles.tabsHeader}>
                  <div className={styles.tabsRow}>
                    {profileTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
                        onClick={() => onTabChange(tab.id)}
                      >
                        <FontAwesomeIcon icon={tab.icon} />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className={styles.viewAllButton}>
                    Посмотреть всё
                  </button>
                </div>

                <div className={styles.tabContent}>{tabContent}</div>
              </section>
            </div>

            <div className={styles.sideColumn}>
              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideIconWrap}>
                    <FontAwesomeIcon icon={faChartLine} />
                  </div>
                  <div>
                    <h3 className={styles.sideTitle}>Прогресс</h3>
                    <p className={styles.sideSubtitle}>Последние 6 месяцев</p>
                  </div>
                </div>

                <div className={styles.chartWrap}>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className={styles.chartSvg} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="studentsProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#b9ff66" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#b9ff66" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={chartGeometry.area} fill="url(#studentsProgressGradient)" />
                    <polyline points={chartGeometry.line} fill="none" stroke="#b9ff66" strokeWidth="3" />
                  </svg>
                  <div className={styles.chartLabelsRow}>
                    {progress.points.map((point) => (
                      <span key={point.label}>{point.label}</span>
                    ))}
                  </div>
                </div>
              </section>

              <section className={styles.sideCard}>
                <h3 className={styles.sideUpperTitle}>Быстрая статистика</h3>
                <div className={styles.quickStatsList}>
                  <div>
                    <span>Пропущено занятий</span>
                    <strong>{profileStats.missedLessons} из {profileStats.lessonsConducted}</strong>
                  </div>
                  <div>
                    <span>Средняя оценка ДЗ</span>
                    <strong>{profileStats.averageScore}/10</strong>
                  </div>
                  <div>
                    <span>Выполнено домашек</span>
                    <strong>{profileStats.completedHomeworks}/{profileStats.totalHomeworks}</strong>
                  </div>
                  <div>
                    <span>Время на платформе</span>
                    <strong>{profileStats.totalPlatformHours} часов</strong>
                  </div>
                  <div className={styles.quickStatsAccent}>
                    <span>Следующая оплата</span>
                    <strong>{profileStats.nextPaymentDateLabel}</strong>
                  </div>
                </div>
              </section>

              <section className={styles.sideCard}>
                <div className={styles.notesHeader}>
                  <h3 className={styles.sideUpperTitle}>Заметки</h3>
                  <button type="button" className={styles.addNoteButton}>Добавить</button>
                </div>
                <div className={styles.notesList}>
                  {generatedNotes.map((note) => (
                    <article
                      key={`${note.date}_${note.text.slice(0, 12)}`}
                      className={`${styles.noteCard} ${note.tone === 'warning' ? styles.noteWarning : styles.noteInfo}`}
                    >
                      <p>{note.text}</p>
                      <span>{note.date}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.contactCard}>
                <div className={styles.contactHeader}>
                  <div className={styles.contactIconWrap}>
                    <FontAwesomeIcon icon={faAddressCard} />
                  </div>
                  <h3>Контакты</h3>
                </div>

                <div className={styles.contactList}>
                  <div>
                    <FontAwesomeIcon icon={faPaperPlane} />
                    <span>{studentEntry.student.username ? `@${studentEntry.student.username}` : 'Не указан'}</span>
                  </div>
                  <div>
                    <FontAwesomeIcon icon={faPhone} />
                    <span>{phoneLabel}</span>
                  </div>
                  <div>
                    <FontAwesomeIcon icon={faStar} />
                    <span>{cardPresentation.levelLabel}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
