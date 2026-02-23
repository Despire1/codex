import { addDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
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
import type { DashboardSummary } from '@/shared/api/client';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
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
import { ActivityFeedFullscreen } from '../ActivityFeedFullscreen';
import { ActivityFeedFiltersControl } from '../ActivityFeedFiltersControl';
import type { DashboardActivityFilters } from '../../model/useDashboardActivityFeed';
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
  activityLoadingMore: boolean;
  activityHasMore: boolean;
  activityFilters: DashboardActivityFilters;
  activityStudents: Array<{ id: number; name: string }>;
  activityFeedRequested: boolean;
  onRequestActivityFeed: () => void;
  onRefreshActivity: () => Promise<void>;
  onRefreshUnreadActivity: () => Promise<void>;
  onMarkActivityAsSeen: (seenThrough?: string) => Promise<void> | void;
  onLoadMoreActivity: () => Promise<void> | void;
  onApplyActivityFilters: (next: DashboardActivityFilters) => void;
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
  onTogglePaid,
  onCompleteLesson,
  onRemindLessonPayment,
  onRescheduleLesson,
  onEditLesson,
  onDeleteLesson,
  hasUnreadActivity,
  activityItems,
  activityLoading,
  activityLoadingMore,
  activityHasMore,
  activityFilters,
  activityStudents,
  activityFeedRequested,
  onRequestActivityFeed,
  onRefreshActivity,
  onRefreshUnreadActivity,
  onMarkActivityAsSeen,
  onLoadMoreActivity,
  onApplyActivityFilters,
}) => {
  const timeZone = useTimeZone();
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [actionsLesson, setActionsLesson] = useState<Lesson | null>(null);
  const activitySeenRef = useRef<string | null>(null);
  const now = new Date();
  const nowTs = now.getTime();

  const presentation = useMemo(
    () =>
      buildMobileDashboardPresentation({
        lessons,
        linkedStudents,
        unpaidEntries,
        summary,
        timeZone,
      }),
    [lessons, linkedStudents, summary, timeZone, unpaidEntries],
  );

  const actionLessonPresentation = resolveCloseLessonForActions(presentation.closeLesson, actionsLesson);

  const quickHomeworkPrefill = useMemo(() => {
    if (presentation.nextLesson) {
      const targetLesson = presentation.nextLesson.lesson;
      return {
        lessonId: targetLesson.id,
        studentId: resolveLessonPrimaryStudentId(targetLesson, { preferUnpaid: true }) ?? null,
      };
    }

    if (presentation.closeLesson) {
      return {
        lessonId: presentation.closeLesson.lesson.id,
        studentId: presentation.closeLesson.primaryStudentId,
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

  const weekDaysWithLessons = useMemo(
    () => presentation.weekTimeline.filter((day) => day.items.length > 0).slice(0, 4),
    [presentation.weekTimeline],
  );

  const upcomingLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() >= nowTs)
        .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
        .slice(0, 3),
    [lessons, nowTs],
  );

  const todayZoned = useMemo(() => toZonedDate(now, timeZone), [now, timeZone]);
  const tomorrowZoned = useMemo(() => addDays(todayZoned, 1), [todayZoned]);

  const teacherFirstName = useMemo(() => {
    const baseName = (teacher.name ?? teacher.username ?? 'Преподаватель').trim();
    return baseName.split(' ')[0] || 'Преподаватель';
  }, [teacher.name, teacher.username]);

  const openActivityFeed = () => {
    setIsActivityOpen(true);
    onRequestActivityFeed();
    if (activityFeedRequested) {
      void onRefreshActivity();
    }
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
        // eslint-disable-next-line no-console
        console.error('Failed to mark activity feed as seen in mobile dashboard', error);
        activitySeenRef.current = null;
      });
  }, [activityItems, activityLoading, isActivityOpen, onMarkActivityAsSeen, onRefreshUnreadActivity]);

  return (
    <section className={styles.root}>
      <section className={styles.welcomeSection}>
        <div className={styles.welcomeTextBlock}>
          <h1 className={styles.welcomeTitle}>Добро пожаловать, {teacherFirstName}! 👋</h1>
          <p className={styles.welcomeDate}>Сегодня, {formatInTimeZone(now, 'd MMMM yyyy', { locale: ru, timeZone })}</p>
        </div>

        <div className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div>
              <h2 className={styles.heroTitle}>{pluralizeLessons(presentation.dayTimeline.length)} на сегодня</h2>
              <p className={styles.heroSubtitle}>
                {presentation.nextLesson
                  ? `Следующий в ${formatInTimeZone(presentation.nextLesson.lesson.startAt, 'HH:mm', {
                      timeZone,
                    })} с ${presentation.nextLesson.studentLabel}`
                  : 'На сегодня уроков больше нет'}
              </p>
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
          <button
            type="button"
            className={styles.quickAction}
            onClick={() => onOpenHomeworkAssign(quickHomeworkPrefill.studentId, quickHomeworkPrefill.lessonId)}
          >
            <span className={`${styles.quickActionIcon} ${styles.quickActionPrimary}`} aria-hidden>
              <FontAwesomeIcon icon={faFileInvoice} />
            </span>
            <span className={styles.quickActionTitle}>Создать ДЗ</span>
            <span className={styles.quickActionSubtitle}>Новое задание</span>
          </button>

          <button type="button" className={styles.quickAction} onClick={onAddStudent}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionBlue}`} aria-hidden>
              <FontAwesomeIcon icon={faUserPlus} />
            </span>
            <span className={styles.quickActionTitle}>Добавить</span>
            <span className={styles.quickActionSubtitle}>Нового ученика</span>
          </button>

          <button type="button" className={styles.quickAction} onClick={() => onCreateLesson()}>
            <span className={`${styles.quickActionIcon} ${styles.quickActionPurple}`} aria-hidden>
              <FontAwesomeIcon icon={faCalendarPlus} />
            </span>
            <span className={styles.quickActionTitle}>Урок</span>
            <span className={styles.quickActionSubtitle}>Запланировать</span>
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
                  <button type="button" className={styles.attentionAction} onClick={() => setActionsLesson(presentation.closeLesson?.lesson ?? null)}>
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
                        <span className={`${styles.weekLessonStripe} ${styles[`weekLessonStripe${index}`]}`} aria-hidden />
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
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        className={styles.activitySheet}
        contentScrollable={false}
      >
        <div className={styles.activitySheetContent}>
          <ActivityFeedFullscreen
            items={activityItems}
            loading={activityLoading}
            loadingMore={activityLoadingMore}
            hasMore={activityHasMore}
            onLoadMore={() => {
              void onLoadMoreActivity();
            }}
            headerTitle="Лента активности"
            headerAction={
              <ActivityFeedFiltersControl
                filters={activityFilters}
                students={activityStudents}
                onApplyFilters={onApplyActivityFilters}
                popoverAlign="end"
              />
            }
            fitContainer
            autoLoadMoreOnScroll
          />
        </div>
      </BottomSheet>

      <BottomSheet isOpen={Boolean(actionsLesson)} onClose={() => setActionsLesson(null)} className={styles.lessonSheet}>
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
                  const studentId =
                    resolveLessonPrimaryStudentId(actionsLesson, {
                      preferUnpaid: true,
                    }) ?? undefined;
                  setActionsLesson(null);
                  void onTogglePaid(actionsLesson.id, studentId);
                }}
              >
                {actionLessonPresentation?.isPaid ? 'Отменить оплату' : 'Отметить оплату'}
              </button>

              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  const studentId =
                    resolveLessonPrimaryStudentId(actionsLesson, {
                      preferUnpaid: true,
                    }) ?? null;
                  setActionsLesson(null);
                  onOpenHomeworkAssign(studentId, actionsLesson.id);
                }}
              >
                Выдать ДЗ
              </button>

              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  onRescheduleLesson(actionsLesson);
                }}
              >
                Перенести
              </button>

              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  onEditLesson(actionsLesson);
                }}
              >
                Редактировать
              </button>

              <button
                type="button"
                className={`${styles.sheetAction} ${styles.sheetActionDanger}`}
                onClick={() => {
                  setActionsLesson(null);
                  onDeleteLesson(actionsLesson);
                }}
              >
                Удалить
              </button>

              <button type="button" className={styles.sheetCancel} onClick={() => setActionsLesson(null)}>
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
