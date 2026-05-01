import { addDays, isSameDay, ru } from 'date-fns';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarCheck,
  faCalendarPlus,
  faClock,
  faClockRotateLeft,
  faExclamation,
  faFileInvoice,
  faLocationDot,
  faUserPlus,
  faVideo,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { ActivityFeedItem, Lesson, LinkedStudent, Teacher, UnpaidLessonEntry } from '@/entities/types';
import {
  isVisibleLesson,
  resolveLessonDeleteDisabledReason,
  resolveLessonEditDisabledReason,
  resolveLessonLimitedEditNotice,
  resolveLessonMutationDisabledReason,
} from '@/entities/lesson/lib/lessonMutationGuards';
import { normalizeLesson } from '@/shared/lib/normalizers';
import { api, type DashboardSummary } from '@/shared/api/client';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '@/shared/lib/timezoneDates';
import {
  buildMobileDashboardPresentation,
  formatRubles,
  resolveLessonAmountRub,
  resolveLessonIsPaid,
  resolveLessonPrimaryStudentId,
  type MobileDashboardCloseLesson,
} from '../../model/mobileDashboardPresentation';
import { UnpaidLessonsPopoverContent } from '../UnpaidLessonsPopoverContent';
import { useActivityFeedDrawer } from '../../model/ActivityFeedDrawerContext';
import styles from './MobileDashboard.module.css';

interface MobileDashboardProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  teacher: Teacher;
  unpaidEntries: UnpaidLessonEntry[];
  summary: DashboardSummary | null;
  onAddStudent: () => void;
  onCreateLesson: () => void;
  onOpenSchedule: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onOpenStudent: (studentId: number) => void;
  onOpenHomeworkAssign: (studentId?: number | null, lessonId?: number | null) => void;
  onCreateHomeworkTemplate: () => void;
  onTogglePaid: (lessonId: number, studentId?: number) => Promise<void>;
  onCompleteLesson: (lessonId: number) => Promise<void>;
  onRemindLessonPayment: (
    lessonId: number,
    studentId?: number,
  ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
  onRescheduleLesson: (lesson: Lesson) => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lesson: Lesson) => void;
  hasUnreadActivity: boolean;
  activityItems: ActivityFeedItem[];
  activityLoading: boolean;
  onRequestActivityFeed: () => void;
  onRefreshActivity: () => Promise<void> | void;
  onRefreshUnreadActivity: () => Promise<void> | void;
  onMarkActivityAsSeen: (seenThrough?: string) => Promise<void> | void;
}

const capitalizeFirst = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

const pluralizeLessons = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} урок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} урока`;
  return `${count} уроков`;
};

const formatCompactRubles = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return '₽0';
  if (amount >= 1000) {
    const value = amount / 1000;
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    return `₽${String(rounded).replace('.', ',')}k`;
  }
  return `₽${Math.round(amount)}`;
};

const resolveLinkedStudentName = (lesson: Lesson, linkedStudents: LinkedStudent[], fallback = 'Урок') => {
  if (lesson.participants && lesson.participants.length > 1) {
    const names = lesson.participants
      .map((participant) => linkedStudents.find((student) => student.id === participant.studentId)?.link.customName)
      .filter(Boolean) as string[];
    return names.length > 0 ? names.join(', ') : fallback;
  }

  if (lesson.participants && lesson.participants.length === 1) {
    const studentId = lesson.participants[0].studentId;
    return linkedStudents.find((student) => student.id === studentId)?.link.customName ?? fallback;
  }

  return linkedStudents.find((student) => student.id === lesson.studentId)?.link.customName ?? fallback;
};

const resolveCloseLessonForActions = (
  closeLesson: MobileDashboardCloseLesson | null,
  lesson: Lesson | null,
): MobileDashboardCloseLesson | null => {
  if (!closeLesson || !lesson) return null;
  return closeLesson.lesson.id === lesson.id ? closeLesson : null;
};

const resolveLessonLocation = (lesson: Lesson) => {
  if (!lesson.meetingLink) return { label: 'Офлайн', icon: faLocationDot };
  if (lesson.meetingLink.toLowerCase().includes('zoom')) return { label: 'Zoom', icon: faVideo };
  return { label: 'Онлайн', icon: faVideo };
};

const resolveParticipantName = (studentId: number, linkedStudents: LinkedStudent[]) =>
  linkedStudents.find((student) => student.id === studentId)?.link.customName ??
  linkedStudents.find((student) => student.id === studentId)?.username ??
  'Ученик';

type ParticipantActionState = {
  lesson: Lesson;
  action: 'togglePaid' | 'assignHomework';
} | null;

export const MobileDashboard: FC<MobileDashboardProps> = ({
  lessons,
  linkedStudents,
  teacher,
  unpaidEntries,
  summary,
  onAddStudent,
  onCreateLesson,
  onOpenSchedule,
  onOpenLesson,
  onOpenStudent,
  onOpenHomeworkAssign,
  onCreateHomeworkTemplate,
  onTogglePaid,
  onCompleteLesson,
  onRemindLessonPayment,
  onRescheduleLesson,
  onEditLesson,
  onDeleteLesson,
  hasUnreadActivity,
  activityItems,
  activityLoading,
  onRequestActivityFeed,
  onRefreshActivity,
  onRefreshUnreadActivity,
  onMarkActivityAsSeen,
}) => {
  const timeZone = useTimeZone();
  const { open: openActivityDrawer, isOpen: isActivityOpen } = useActivityFeedDrawer();
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const [actionsLesson, setActionsLesson] = useState<Lesson | null>(null);
  const [participantActionState, setParticipantActionState] = useState<ParticipantActionState>(null);
  const activitySeenRef = useRef<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const nowTs = now.getTime();

  const [upcomingLessonsData, setUpcomingLessonsData] = useState<Lesson[]>([]);

  const loadUpcomingLessons = useCallback(async () => {
    const start = new Date();
    const end = addDays(start, 28);
    try {
      const data = await api.listLessonsForRange({ start: start.toISOString(), end: end.toISOString() });
      const normalized = (data.lessons ?? []).map(normalizeLesson).filter(isVisibleLesson);
      setUpcomingLessonsData(normalized);
    } catch (error) {
      console.error('Failed to load upcoming lessons for mobile dashboard', error);
    }
  }, []);

  useEffect(() => {
    void loadUpcomingLessons();
  }, [loadUpcomingLessons]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadUpcomingLessons();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadUpcomingLessons]);

  const lessonsForPresentation = useMemo(() => {
    const byId = new Map<number, Lesson>();
    lessons.forEach((lesson) => byId.set(lesson.id, lesson));
    upcomingLessonsData.forEach((lesson) => {
      if (!byId.has(lesson.id)) byId.set(lesson.id, lesson);
    });
    return Array.from(byId.values());
  }, [lessons, upcomingLessonsData]);

  const presentation = useMemo(
    () =>
      buildMobileDashboardPresentation({
        lessons: lessonsForPresentation,
        linkedStudents,
        unpaidEntries,
        summary,
        timeZone,
      }),
    [lessonsForPresentation, linkedStudents, summary, timeZone, unpaidEntries],
  );

  const actionLessonPresentation = resolveCloseLessonForActions(presentation.closeLesson, actionsLesson);
  const actionRescheduleDisabledReason = actionsLesson ? resolveLessonMutationDisabledReason(actionsLesson) : null;
  const actionEditDisabledReason = actionsLesson ? resolveLessonEditDisabledReason(actionsLesson) : null;
  const actionDeleteDisabledReason = actionsLesson ? resolveLessonDeleteDisabledReason(actionsLesson) : null;
  const actionHelperText =
    (actionsLesson ? resolveLessonLimitedEditNotice(actionsLesson) : null) ??
    actionEditDisabledReason ??
    actionRescheduleDisabledReason ??
    actionDeleteDisabledReason;

  const quickHomeworkPrefill = useMemo(() => {
    if (presentation.nextLesson) {
      const targetLesson = presentation.nextLesson.lesson;
      return {
        lessonId: targetLesson.id,
        studentId:
          targetLesson.participants && targetLesson.participants.length > 1
            ? null
            : (resolveLessonPrimaryStudentId(targetLesson, { preferUnpaid: true }) ?? null),
      };
    }

    if (presentation.closeLesson) {
      return {
        lessonId: presentation.closeLesson.lesson.id,
        studentId:
          presentation.closeLesson.lesson.participants && presentation.closeLesson.lesson.participants.length > 1
            ? null
            : presentation.closeLesson.primaryStudentId,
      };
    }

    return { lessonId: null, studentId: null };
  }, [presentation.closeLesson, presentation.nextLesson]);

  const monthlyIncomeRub = useMemo(() => {
    const currentMonthKey = formatInTimeZone(now, 'yyyy-MM', { timeZone });
    return lessons.reduce((sum, lesson) => {
      if (lesson.status !== 'COMPLETED') return sum;
      if (!resolveLessonIsPaid(lesson)) return sum;
      const lessonMonthKey = formatInTimeZone(lesson.startAt, 'yyyy-MM', { timeZone });
      if (lessonMonthKey !== currentMonthKey) return sum;
      return sum + resolveLessonAmountRub(lesson);
    }, 0);
  }, [lessons, now, timeZone]);

  const weeklyLessonsCount = useMemo(
    () => presentation.weekTimeline.reduce((sum, day) => sum + day.items.length, 0),
    [presentation.weekTimeline],
  );

  const attendancePercent = useMemo(() => {
    const pastLessons = lessons.filter((lesson) => {
      if (lesson.status === 'CANCELED') return false;
      const endAtMs = new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;
      return endAtMs <= nowTs;
    });

    if (pastLessons.length === 0) return null;

    const completedLessons = pastLessons.filter((lesson) => lesson.status === 'COMPLETED').length;
    return Math.round((completedLessons / pastLessons.length) * 100);
  }, [lessons, nowTs]);

  const needsCompletionCount = useMemo(
    () =>
      lessons.filter((lesson) => {
        if (lesson.status === 'CANCELED' || lesson.status === 'COMPLETED') return false;
        const endAtMs = new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;
        return endAtMs <= nowTs;
      }).length,
    [lessons, nowTs],
  );

  const unpaidTotalRub = useMemo(
    () => unpaidEntries.reduce((sum, entry) => sum + Math.max(0, Math.round(Number(entry.price) || 0)), 0),
    [unpaidEntries],
  );

  const participantActionOptions = useMemo(() => {
    if (!participantActionState?.lesson.participants || participantActionState.lesson.participants.length === 0) {
      return [];
    }

    return participantActionState.lesson.participants.map((participant) => ({
      studentId: participant.studentId,
      label: resolveParticipantName(participant.studentId, linkedStudents),
      isPaid: participant.isPaid,
    }));
  }, [linkedStudents, participantActionState]);

  const requestParticipantAction = (lesson: Lesson, action: 'togglePaid' | 'assignHomework') => {
    if (!lesson.participants || lesson.participants.length <= 1) {
      const studentId = resolveLessonPrimaryStudentId(lesson, { preferUnpaid: true }) ?? null;
      if (action === 'togglePaid') {
        void onTogglePaid(lesson.id, studentId ?? undefined);
        return;
      }
      onOpenHomeworkAssign(studentId, lesson.id);
      return;
    }

    setParticipantActionState({ lesson, action });
  };

  const weekDaysWithLessons = useMemo(
    () => presentation.weekTimeline.filter((day) => day.items.length > 0).slice(0, 4),
    [presentation.weekTimeline],
  );

  const upcomingLessons = useMemo(
    () =>
      lessonsForPresentation
        .filter((lesson) => lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() >= nowTs)
        .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
        .slice(0, 3),
    [lessonsForPresentation, nowTs],
  );

  const todayZoned = useMemo(() => toZonedDate(now, timeZone), [now, timeZone]);
  const tomorrowZoned = useMemo(() => addDays(todayZoned, 1), [todayZoned]);

  const teacherFirstName = useMemo(() => {
    const baseName = (teacher.name ?? teacher.username ?? 'Преподаватель').trim();
    return baseName.split(' ')[0] || 'Преподаватель';
  }, [teacher.name, teacher.username]);

  const upcomingTodayCount = useMemo(
    () => presentation.dayTimeline.filter((item) => !item.isPast && item.lesson.status !== 'COMPLETED').length,
    [presentation.dayTimeline],
  );

  const heroTitleLabel = useMemo(() => {
    if (upcomingTodayCount > 0) return `${pluralizeLessons(upcomingTodayCount)} сегодня`;
    if (presentation.dayTimeline.length > 0) return 'Сегодня уроки завершены';
    return 'Сегодня уроков нет';
  }, [presentation.dayTimeline.length, upcomingTodayCount]);

  const heroSubtitleLabel = useMemo(() => {
    if (!presentation.nextLesson) return 'Следующий урок ещё не запланирован';
    const startAt = new Date(presentation.nextLesson.lesson.startAt);
    const startZoned = toZonedDate(startAt, timeZone);
    const timeLabel = formatInTimeZone(startAt, 'HH:mm', { timeZone });
    const studentLabel = presentation.nextLesson.studentLabel;

    if (isSameDay(startZoned, todayZoned)) {
      return `Следующий в ${timeLabel} — ${studentLabel}`;
    }
    if (isSameDay(startZoned, tomorrowZoned)) {
      return `Завтра в ${timeLabel} — ${studentLabel}`;
    }
    const dateLabel = formatInTimeZone(startAt, 'EEE, d MMM', { locale: ru, timeZone }).replace('.', '');
    return `${capitalizeFirst(dateLabel)} в ${timeLabel} — ${studentLabel}`;
  }, [presentation.nextLesson, timeZone, todayZoned, tomorrowZoned]);

  const openActivityFeed = () => {
    openActivityDrawer();
    onRequestActivityFeed();
    void onRefreshActivity();
    void onRefreshUnreadActivity();
  };

  useEffect(() => {
    if (!isActivityOpen || activityLoading || activityItems.length === 0) return;
    const seenThrough = activityItems[0].occurredAt;
    if (!seenThrough || activitySeenRef.current === seenThrough) return;

    activitySeenRef.current = seenThrough;
    Promise.resolve(onMarkActivityAsSeen(seenThrough))
      .then(() => {
        void onRefreshUnreadActivity();
      })
      .catch((error) => {
        console.error('Failed to mark activity feed as seen in mobile dashboard', error);
        activitySeenRef.current = null;
      });
  }, [activityItems, activityLoading, isActivityOpen, onMarkActivityAsSeen, onRefreshUnreadActivity]);

  return (
    <section className={styles.root}>
      <section className={styles.welcomeSection}>
        <div className={styles.welcomeTextBlock}>
          <h1 className={styles.welcomeTitle}>Добро пожаловать, {teacherFirstName}! 👋</h1>
          <p className={styles.welcomeDate}>
            Сегодня, {formatInTimeZone(now, 'd MMMM yyyy', { locale: ru, timeZone })}
          </p>
        </div>

        <div className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div>
              <h2 className={styles.heroTitle}>{heroTitleLabel}</h2>
              <p className={styles.heroSubtitle}>{heroSubtitleLabel}</p>
            </div>

            <div className={styles.heroIconWrap} aria-hidden>
              <FontAwesomeIcon icon={faCalendarCheck} />
            </div>
          </div>

          <button type="button" className={styles.heroButton} onClick={onOpenSchedule}>
            Посмотреть расписание
          </button>
        </div>
      </section>

      <section className={styles.statsSection}>
        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
            <FontAwesomeIcon icon={faWallet} />
          </div>
          <h3 className={styles.statValue}>{formatCompactRubles(monthlyIncomeRub)}</h3>
          <p className={styles.statLabel}>Доход за месяц</p>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
            <FontAwesomeIcon icon={faCalendarCheck} />
          </div>
          <h3 className={styles.statValue}>{weeklyLessonsCount}</h3>
          <p className={styles.statLabel}>Уроков на неделе</p>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOrange}`}>
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </div>
          <h3 className={styles.statValue}>{formatCompactRubles(unpaidTotalRub)}</h3>
          <p className={styles.statLabel}>Ожидает оплаты</p>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconPurple}`}>
            <FontAwesomeIcon icon={faCalendarCheck} />
          </div>
          <h3 className={styles.statValue}>{attendancePercent === null ? '—' : `${attendancePercent}%`}</h3>
          <p className={styles.statLabel}>Посещаемость</p>
        </article>
      </section>

      <section className={styles.quickActionsSection}>
        <h2 className={styles.sectionTitle}>Быстрые действия</h2>
        <div className={styles.quickGrid}>
          <button type="button" className={styles.quickAction} onClick={onCreateHomeworkTemplate}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionPrimary}`} aria-hidden>
              <FontAwesomeIcon icon={faFileInvoice} />
            </span>
            <span className={styles.quickActionTitle}>Создать задание</span>
            <span className={styles.quickActionSubtitle}>Новое ДЗ</span>
          </button>

          <button type="button" className={styles.quickAction} onClick={onAddStudent}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionBlue}`} aria-hidden>
              <FontAwesomeIcon icon={faUserPlus} />
            </span>
            <span className={styles.quickActionTitle}>Добавить ученика</span>
            <span className={styles.quickActionSubtitle}>Новый ученик</span>
          </button>

          <button type="button" className={styles.quickAction} onClick={() => onCreateLesson()}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionPurple}`} aria-hidden>
              <FontAwesomeIcon icon={faCalendarPlus} />
            </span>
            <span className={styles.quickActionTitle}>Создать урок</span>
            <span className={styles.quickActionSubtitle}>Новый урок</span>
          </button>

          <button type="button" className={styles.quickAction} onClick={() => setIsUnpaidOpen(true)}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionGreen}`} aria-hidden>
              <FontAwesomeIcon icon={faWallet} />
            </span>
            <span className={styles.quickActionTitle}>Оплата</span>
            <span className={styles.quickActionSubtitle}>Запросить</span>
          </button>
        </div>
      </section>

      <section className={styles.attentionSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Требуют внимания</h2>
          {hasUnreadActivity || activityItems.length > 0 ? (
            <button type="button" className={styles.sectionAction} onClick={openActivityFeed}>
              Все
            </button>
          ) : null}
        </div>

        <div className={styles.attentionList}>
          {needsCompletionCount > 0 ? (
            <div className={styles.attentionCard}>
              <div className={`${styles.attentionIcon} ${styles.attentionIconRed}`} aria-hidden>
                <FontAwesomeIcon icon={faExclamation} />
              </div>
              <div className={styles.attentionBody}>
                <h3>{pluralizeLessons(needsCompletionCount)} нужно закрыть</h3>
                <p>Уроки завершились, но не отмечены как проведенные</p>
                {presentation.closeLesson ? (
                  <button
                    type="button"
                    className={styles.attentionAction}
                    onClick={() => setActionsLesson(presentation.closeLesson?.lesson ?? null)}
                  >
                    Закрыть урок
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {unpaidEntries.length > 0 ? (
            <div className={styles.attentionCard}>
              <div className={`${styles.attentionIcon} ${styles.attentionIconOrange}`} aria-hidden>
                <FontAwesomeIcon icon={faClock} />
              </div>
              <div className={styles.attentionBody}>
                <h3>Просрочено {unpaidEntries.length} оплат</h3>
                <p>Общая сумма: {formatRubles(unpaidTotalRub)}</p>
                <button type="button" className={styles.attentionAction} onClick={() => setIsUnpaidOpen(true)}>
                  Открыть долги
                </button>
              </div>
            </div>
          ) : null}

          {hasUnreadActivity ? (
            <div className={styles.attentionCard}>
              <div className={`${styles.attentionIcon} ${styles.attentionIconBlue}`} aria-hidden>
                <FontAwesomeIcon icon={faClock} />
              </div>
              <div className={styles.attentionBody}>
                <h3>Есть новые события</h3>
                <p>Проверьте последние действия по урокам и домашкам</p>
                <button type="button" className={styles.attentionAction} onClick={openActivityFeed}>
                  Открыть ленту
                </button>
              </div>
            </div>
          ) : null}

          {needsCompletionCount === 0 && unpaidEntries.length === 0 && !hasUnreadActivity ? (
            <p className={styles.attentionEmpty}>Сейчас все под контролем.</p>
          ) : null}
        </div>
      </section>

      <section className={styles.weekSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Расписание на неделю</h2>
          <button type="button" className={styles.sectionAction} onClick={onOpenSchedule}>
            Вся неделя
          </button>
        </div>

        <div className={styles.weekList}>
          {weekDaysWithLessons.length > 0 ? (
            weekDaysWithLessons.map((day) => {
              const dayDate = new Date(`${day.key}T00:00:00`);
              const dayLabel = capitalizeFirst(
                formatInTimeZone(dayDate, 'EEEE, d MMM', {
                  locale: ru,
                  timeZone,
                }).replace('.', ''),
              );

              return (
                <article key={day.key} className={styles.weekDayCard}>
                  <div className={styles.weekDayHeader}>
                    <h3>{dayLabel}</h3>
                    <span>{pluralizeLessons(day.items.length)}</span>
                  </div>

                  <div className={styles.weekDayItems}>
                    {day.items.slice(0, 2).map((item, index) => (
                      <button
                        key={`${day.key}_${item.lesson.id}`}
                        type="button"
                        className={styles.weekLessonItem}
                        onClick={() => onOpenLesson(item.lesson)}
                      >
                        <span
                          className={`${styles.weekLessonStripe} ${styles[`weekLessonStripe${index}`]}`}
                          aria-hidden
                        />
                        <span className={styles.weekLessonText}>
                          <strong>
                            {item.startTimeLabel} - {item.studentLabel}
                          </strong>
                          <small>{item.subtitle}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </article>
              );
            })
          ) : (
            <p className={styles.weekEmpty}>На этой неделе запланированных уроков нет.</p>
          )}
        </div>
      </section>

      <section className={styles.unpaidSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Неоплаченные занятия</h2>
          <button type="button" className={styles.sectionAction} onClick={() => setIsUnpaidOpen(true)}>
            Все
          </button>
        </div>

        <UnpaidLessonsPopoverContent
          entries={unpaidEntries}
          reminderDelayHours={teacher.paymentReminderDelayHours}
          globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
          onOpenStudent={onOpenStudent}
          onTogglePaid={(lessonId, studentId) => {
            void onTogglePaid(lessonId, studentId);
          }}
          onRemindLessonPayment={onRemindLessonPayment}
          maxVisibleEntries={2}
          showToggle={false}
          hideHeader
        />
      </section>

      <section className={styles.upcomingSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Ближайшие уроки</h2>
          <button type="button" className={styles.sectionAction} onClick={onOpenSchedule}>
            Календарь
          </button>
        </div>

        <div className={styles.upcomingList}>
          {upcomingLessons.length > 0 ? (
            upcomingLessons.map((lesson, index) => {
              const lessonDate = toZonedDate(lesson.startAt, timeZone);
              const dayTag = isSameDay(lessonDate, todayZoned)
                ? 'Сегодня'
                : isSameDay(lessonDate, tomorrowZoned)
                  ? 'Завтра'
                  : formatInTimeZone(lesson.startAt, 'd MMM', { locale: ru, timeZone }).replace('.', '');
              const location = resolveLessonLocation(lesson);
              const startLabel = formatInTimeZone(lesson.startAt, 'HH:mm', { timeZone });
              const endLabel = formatInTimeZone(
                new Date(new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000),
                'HH:mm',
                { timeZone },
              );
              const lessonSubtitle =
                lesson.participants && lesson.participants.length > 1 ? 'Групповое занятие' : 'Индивидуальный урок';

              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={`${styles.upcomingCard} ${styles[`upcomingCard${index}`]}`}
                  onClick={() => onOpenLesson(lesson)}
                >
                  <div className={styles.upcomingTop}>
                    <div>
                      <h3>{resolveLinkedStudentName(lesson, linkedStudents)}</h3>
                      <p>{lessonSubtitle}</p>
                    </div>
                    <span>{dayTag}</span>
                  </div>

                  <div className={styles.upcomingMeta}>
                    <span>
                      <FontAwesomeIcon icon={faClock} /> {startLabel} - {endLabel}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={location.icon} /> {location.label}
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className={styles.upcomingEmpty}>Ближайших уроков пока нет.</p>
          )}
        </div>
      </section>

      <BottomSheet
        isOpen={isUnpaidOpen}
        onClose={() => setIsUnpaidOpen(false)}
        className={styles.unpaidSheet}
        contentScrollable={false}
      >
        <UnpaidLessonsPopoverContent
          entries={unpaidEntries}
          reminderDelayHours={teacher.paymentReminderDelayHours}
          globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
          onOpenStudent={(studentId) => {
            setIsUnpaidOpen(false);
            onOpenStudent(studentId);
          }}
          onTogglePaid={(lessonId, studentId) => {
            void onTogglePaid(lessonId, studentId);
          }}
          onRemindLessonPayment={onRemindLessonPayment}
          showAll
          showToggle={false}
          stickyHeader
          fitContainer
        />
      </BottomSheet>

      <BottomSheet
        isOpen={Boolean(actionsLesson)}
        onClose={() => setActionsLesson(null)}
        className={styles.lessonSheet}
      >
        {actionsLesson ? (
          <div className={styles.lessonSheetContent}>
            <div className={styles.lessonSheetHeader}>
              <div className={styles.lessonSheetTitle}>
                {actionLessonPresentation?.studentLabel ?? resolveLinkedStudentName(actionsLesson, linkedStudents)}
              </div>
              <div className={styles.lessonSheetMeta}>
                {actionLessonPresentation?.timeLabel ??
                  formatInTimeZone(actionsLesson.startAt, 'd MMM, HH:mm', {
                    timeZone,
                  })}
                {' • '}
                {formatRubles(actionLessonPresentation?.amountRub ?? resolveLessonAmountRub(actionsLesson))}
              </div>
            </div>

            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  void onCompleteLesson(actionsLesson.id);
                }}
              >
                Отметить проведенным
              </button>

              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  requestParticipantAction(actionsLesson, 'togglePaid');
                }}
              >
                {actionLessonPresentation?.isPaid ? 'Отменить оплату' : 'Отметить оплату'}
              </button>

              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  requestParticipantAction(actionsLesson, 'assignHomework');
                }}
              >
                Выдать ДЗ
              </button>

              <Tooltip content={actionRescheduleDisabledReason} className={styles.sheetActionTooltip}>
                <button
                  type="button"
                  className={styles.sheetAction}
                  disabled={Boolean(actionRescheduleDisabledReason)}
                  onClick={() => {
                    setActionsLesson(null);
                    onRescheduleLesson(actionsLesson);
                  }}
                >
                  Перенести
                </button>
              </Tooltip>

              <Tooltip content={actionEditDisabledReason} className={styles.sheetActionTooltip}>
                <button
                  type="button"
                  className={styles.sheetAction}
                  disabled={Boolean(actionEditDisabledReason)}
                  onClick={() => {
                    setActionsLesson(null);
                    onEditLesson(actionsLesson);
                  }}
                >
                  Редактировать
                </button>
              </Tooltip>

              <Tooltip content={actionDeleteDisabledReason} className={styles.sheetActionTooltip}>
                <button
                  type="button"
                  className={`${styles.sheetAction} ${styles.sheetActionDanger}`}
                  disabled={Boolean(actionDeleteDisabledReason)}
                  onClick={() => {
                    setActionsLesson(null);
                    onDeleteLesson(actionsLesson);
                  }}
                >
                  Удалить
                </button>
              </Tooltip>

              <button type="button" className={styles.sheetCancel} onClick={() => setActionsLesson(null)}>
                Отмена
              </button>
            </div>
            {actionHelperText && <div className={styles.sheetHelper}>{actionHelperText}</div>}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        isOpen={Boolean(participantActionState)}
        onClose={() => setParticipantActionState(null)}
        className={styles.lessonSheet}
      >
        {participantActionState ? (
          <div className={styles.lessonSheetContent}>
            <div className={styles.lessonSheetHeader}>
              <div className={styles.lessonSheetTitle}>
                {participantActionState.action === 'togglePaid'
                  ? 'Выберите ученика для оплаты'
                  : 'Выберите ученика для ДЗ'}
              </div>
              <div className={styles.lessonSheetMeta}>
                {participantActionState.action === 'togglePaid'
                  ? 'Оплата применится только к выбранному участнику.'
                  : 'Домашнее задание будет выдано выбранному участнику.'}
              </div>
            </div>
            <div className={styles.sheetActions}>
              {participantActionOptions.map((participant) => (
                <button
                  key={participant.studentId}
                  type="button"
                  className={styles.sheetAction}
                  onClick={() => {
                    const current = participantActionState;
                    setParticipantActionState(null);
                    if (current.action === 'togglePaid') {
                      void onTogglePaid(current.lesson.id, participant.studentId);
                      return;
                    }
                    onOpenHomeworkAssign(participant.studentId, current.lesson.id);
                  }}
                >
                  {participant.label}
                  {participantActionState.action === 'togglePaid' && participant.isPaid ? ' • уже оплачено' : ''}
                </button>
              ))}
              <button type="button" className={styles.sheetCancel} onClick={() => setParticipantActionState(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <div className={styles.bottomSpacer} />
    </section>
  );
};
