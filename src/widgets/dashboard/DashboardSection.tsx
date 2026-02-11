import { addDays, format, isSameDay } from 'date-fns';
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lesson, LinkedStudent, Teacher } from '@/entities/types';
import controls from '../../shared/styles/controls.module.css';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Badge } from '@/shared/ui/Badge/Badge';
import { AttentionCard, AttentionItem } from './components/AttentionCard';
import { UnpaidLessonsPopoverContent } from './components/UnpaidLessonsPopoverContent';
import { ActivityFeedCard } from './components/ActivityFeedCard';
import { ActivityFeedFullscreen } from './components/ActivityFeedFullscreen';
import { ActivityFeedFiltersControl } from './components/ActivityFeedFiltersControl';
import styles from './DashboardSection.module.css';
import { WeeklyCalendar } from './components/WeeklyCalendar/WeeklyCalendar';
import { getLessonColorVars } from '@/shared/lib/lessonColors';
import { pluralizeRu } from '@/shared/lib/pluralizeRu';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { formatInTimeZone, toUtcEndOfDay, toZonedDate } from '@/shared/lib/timezoneDates';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { useDashboardState } from './model/useDashboardState';
import { DashboardActivityFilters, useDashboardActivityFeed } from './model/useDashboardActivityFeed';

interface DashboardSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  teacher: Teacher;
  onAddStudent: () => void;
  onCreateLesson: (date?: Date) => void;
  onOpenSchedule: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onOpenLessonDay: (lesson: Lesson) => void;
  onOpenStudent: (studentId: number) => void;
}

const getStudentLabel = (lesson: Lesson, linkedStudents: LinkedStudent[]) => {
  if (lesson.participants && lesson.participants.length > 1) {
    const names = lesson.participants
      .map((participant) =>
        linkedStudents.find((student) => student.id === participant.studentId)?.link.customName,
      )
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Группа';
  }
  return linkedStudents.find((student) => student.id === lesson.studentId)?.link.customName || 'Ученик';
};

const getLinkedStudentName = (studentId: number, linkedStudents: LinkedStudent[]) =>
  linkedStudents.find((student) => student.id === studentId)?.link.customName || 'Ученик';

export const DashboardSection: FC<DashboardSectionProps> = ({
  lessons,
  linkedStudents,
  teacher,
  onAddStudent,
  onCreateLesson,
  onOpenSchedule,
  onOpenLesson,
  onOpenLessonDay,
  onOpenStudent,
}) => {
  const timeZone = useTimeZone();
  const { markLessonCompleted, togglePaid, remindLessonPayment } = useLessonActions();
  const { unpaidEntries, setWeekRange } = useDashboardState();
  const {
    items: activityItems,
    loading: activityLoading,
    loadingMore: activityLoadingMore,
    hasMore: activityHasMore,
    filters: activityFilters,
    setFilters: setActivityFilters,
    loadMore: loadMoreActivity,
    refresh: refreshActivity,
  } = useDashboardActivityFeed(timeZone);
  const now = new Date();
  const todayZoned = toZonedDate(now, timeZone);
  const hasSyncedActivityForLessonsRef = useRef(false);
  const [isAttentionOpen, setIsAttentionOpen] = useState(false);
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const isDashboardMobile = useIsMobile(1023);
  const showWeeklyCalendar = !isDashboardMobile;
  const lessonsActivitySignature = useMemo(
    () =>
      lessons
        .map((lesson) => {
          const participantsSignature = (lesson.participants ?? [])
            .map((participant) => `${participant.studentId}:${participant.isPaid ? 1 : 0}`)
            .sort()
            .join(',');
          return `${lesson.id}:${lesson.status}:${lesson.startAt}:${lesson.durationMinutes}:${lesson.isPaid ? 1 : 0}:${participantsSignature}`;
        })
        .sort()
        .join('|'),
    [lessons],
  );

  const attentionItems: AttentionItem[] = useMemo(() => {
    return lessons.flatMap((lesson) => {
      const startMs = new Date(lesson.startAt).getTime();
      const endMs = startMs + lesson.durationMinutes * 60_000;
      const isPast = endMs < now.getTime();
      if (!isPast) return [];

      if (lesson.participants && lesson.participants.length > 0) {
        return lesson.participants
          .filter((participant) => lesson.status !== 'COMPLETED' || !participant.isPaid)
          .map((participant) => {
            const studentName = getLinkedStudentName(participant.studentId, linkedStudents);
            return {
              id: `${lesson.id}-${participant.studentId}`,
              lesson,
              studentId: participant.studentId,
              studentName,
              needsCompletion: lesson.status !== 'COMPLETED',
              needsPayment: !participant.isPaid,
            };
          });
      }

      if (lesson.status === 'COMPLETED' && lesson.isPaid) return [];

      return [
        {
          id: `${lesson.id}`,
          lesson,
          studentId: lesson.studentId,
          studentName: getLinkedStudentName(lesson.studentId, linkedStudents),
          needsCompletion: lesson.status !== 'COMPLETED',
          needsPayment: !lesson.isPaid,
        },
      ];
    });
  }, [lessons, linkedStudents, now]);

  const todayLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) => isSameDay(toZonedDate(lesson.startAt, timeZone), todayZoned) && lesson.status !== 'CANCELED',
      ),
    [lessons, timeZone, todayZoned],
  );

  const todayUpcomingLesson = useMemo(() => {
    return todayLessons
      .filter((lesson) => lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
  }, [now, todayLessons]);

  const upcomingLessons = useMemo(() => {
    const windowEnd = toUtcEndOfDay(format(addDays(todayZoned, 2), 'yyyy-MM-dd'), timeZone);
    return lessons
      .filter((lesson) => {
        if (lesson.status !== 'SCHEDULED') return false;
        const startAt = new Date(lesson.startAt);
        return startAt.getTime() >= now.getTime() && startAt.getTime() <= windowEnd.getTime();
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [lessons, now, timeZone, todayZoned]);

  const upcomingLessonCards = upcomingLessons.slice(0, 5);

  const unpaidSummary = useMemo(() => {
    const studentIds = new Set(unpaidEntries.map((entry) => entry.studentId));
    const total = unpaidEntries.reduce((sum, entry) => sum + entry.price, 0);
    return {
      total,
      lessonCount: unpaidEntries.length,
      studentCount: studentIds.size,
    };
  }, [unpaidEntries]);
  const hasUnpaidLessons = unpaidSummary.lessonCount > 0;
  const shouldPlaceActivityInUnpaidArea = !isDashboardMobile && !hasUnpaidLessons;
  const activityAreaClassName = shouldPlaceActivityInUnpaidArea ? styles.unpaidArea : styles.activityArea;

  const activityStudents = useMemo(() => {
    const map = new Map<number, string>();
    linkedStudents.forEach((student) => {
      const name = student.link.customName?.trim() || student.username?.trim() || `Ученик #${student.id}`;
      map.set(student.id, name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [linkedStudents]);

  const handleRemindLessonPayment = useCallback(
    async (lessonId: number, studentId?: number) => {
      const result = await remindLessonPayment(lessonId, studentId);
      void refreshActivity();
      return result;
    },
    [refreshActivity, remindLessonPayment],
  );

  const handleApplyActivityFilters = useCallback(
    (next: DashboardActivityFilters) => {
      setActivityFilters(next);
    },
    [setActivityFilters],
  );

  const activityFiltersCount = useMemo(() => {
    let count = 0;
    if (activityFilters.categories.length > 0) count += 1;
    if (activityFilters.studentId !== null) count += 1;
    if (activityFilters.from) count += 1;
    if (activityFilters.to) count += 1;
    return count;
  }, [activityFilters.categories.length, activityFilters.from, activityFilters.studentId, activityFilters.to]);

  const handleResetActivityFilters = useCallback(() => {
    setActivityFilters({
      categories: [],
      studentId: null,
      from: '',
      to: '',
    });
  }, [setActivityFilters]);

  useEffect(() => {
    if (attentionItems.length === 0) {
      setIsAttentionOpen(false);
    }
  }, [attentionItems.length]);

  useEffect(() => {
    if (!hasSyncedActivityForLessonsRef.current) {
      hasSyncedActivityForLessonsRef.current = true;
      return;
    }
    void refreshActivity();
  }, [lessonsActivitySignature, refreshActivity]);

  return (
    <section
      className={`${styles.grid} ${
        showWeeklyCalendar
          ? styles.gridWithCalendar
          : attentionItems.length > 0
            ? styles.gridWithAttention
            : styles.gridNoAttention
      }`}
    >
      {!showWeeklyCalendar && attentionItems.length > 0 && (
        <AttentionCard
          items={attentionItems}
          isOpen={isAttentionOpen}
          onToggle={() => setIsAttentionOpen((prev) => !prev)}
          onCompleteLesson={(lessonId) => markLessonCompleted(lessonId)}
          onTogglePaid={(lessonId, studentId) => togglePaid(lessonId, studentId)}
          className={`${styles.card} ${styles.attentionCard} ${styles.attentionArea}`}
        />
      )}

      {!showWeeklyCalendar && (
        <div className={`${styles.card} ${styles.todayCard} ${styles.todayArea}`}>
          <div className={styles.cardHeader}>Сегодня</div>
          <div className={styles.todaySummary}>
            <Badge
              variant="groupPaid"
              label={pluralizeRu(todayLessons.length, { one: 'занятие', few: 'занятия', many: 'занятий' })}
              className={styles.todayCount}
            />
            <div className={styles.todayMeta}>
              {todayUpcomingLesson
                ? `Первое — в ${formatInTimeZone(todayUpcomingLesson.startAt, 'HH:mm', { timeZone })}`
                : 'Все занятия на сегодня уже прошли'}
            </div>
          </div>
        </div>
      )}

      {showWeeklyCalendar && (
        <WeeklyCalendar
          className={styles.calendarArea}
          lessons={lessons}
          linkedStudents={linkedStudents}
          timeZone={timeZone}
          onCreateLesson={(date) => onCreateLesson(date)}
          onOpenLessonDay={onOpenLessonDay}
          onWeekRangeChange={setWeekRange}
        />
      )}

      <div className={`${styles.card} ${styles.upcomingCard} ${styles.upcomingArea}`}>
        <div className={styles.cardHeader}>Ближайшие уроки</div>
        {upcomingLessonCards.length === 0 ? (
          <p className={styles.muted}>Нет ближайших занятий</p>
        ) : (
          <div className={styles.lessonList}>
            {upcomingLessonCards.map((lesson) => {
              const date = toZonedDate(lesson.startAt, timeZone);
              const label = isSameDay(date, todayZoned)
                ? 'Сегодня'
                : isSameDay(date, addDays(todayZoned, 1))
                  ? 'Завтра'
                  : isSameDay(date, addDays(todayZoned, 2))
                    ? 'Послезавтра'
                    : 'Скоро';
              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={styles.lessonCard}
                  onClick={() => onOpenLesson(lesson)}
                  style={getLessonColorVars(lesson.color)}
                >
                  <div className={styles.lessonDay}>{label}</div>
                  <div className={styles.lessonTimeRow}>
                    {format(date, 'HH:mm')} · {lesson.durationMinutes} мин
                  </div>
                  <div className={styles.lessonStudent}>{getStudentLabel(lesson, linkedStudents)}</div>
                </button>
              );
            })}
          </div>
        )}
        {upcomingLessons.length > 5 && (
          <button className={styles.inlineAction} onClick={onOpenSchedule}>
            Открыть расписание
          </button>
        )}
      </div>

      <div className={`${styles.card} ${styles.activityCardShell} ${activityAreaClassName}`}>
        <ActivityFeedCard
          items={activityItems}
          loading={activityLoading}
          activeFiltersCount={activityFiltersCount}
          onResetFilters={handleResetActivityFilters}
          onOpen={() => setIsActivityOpen(true)}
        />
      </div>

      {hasUnpaidLessons && (
        <div className={`${styles.unpaidCardWrapper} ${styles.unpaidArea}`}>
          {isDashboardMobile ? (
            <div className={`${styles.card} ${styles.unpaidCard}`}>
              <UnpaidLessonsPopoverContent
                entries={unpaidEntries}
                reminderDelayHours={teacher.paymentReminderDelayHours}
                globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
                onOpenStudent={onOpenStudent}
                onTogglePaid={togglePaid}
                onRemindLessonPayment={handleRemindLessonPayment}
                maxVisibleEntries={1}
                showToggle={false}
              />
              <button
                type="button"
                className={styles.unpaidShowAllButton}
                onClick={() => setIsUnpaidOpen(true)}
              >
                Показать все
              </button>
            </div>
          ) : (
            <div className={`${styles.card} ${styles.unpaidCard} ${styles.unpaidCardFull}`}>
              <UnpaidLessonsPopoverContent
                entries={unpaidEntries}
                reminderDelayHours={teacher.paymentReminderDelayHours}
                globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
                onOpenStudent={onOpenStudent}
                onTogglePaid={togglePaid}
                onRemindLessonPayment={handleRemindLessonPayment}
              />
            </div>
          )}
        </div>
      )}

      <div className={`${styles.card} ${styles.actionsCard} ${styles.actionsArea}`}>
        <div className={styles.cardHeader}>Быстрые действия</div>
        <div className={styles.actionsRow}>
          <button className={controls.secondaryButton} onClick={onAddStudent}>
            Добавить ученика
          </button>
          <button className={controls.secondaryButton} onClick={() => onCreateLesson()}>
            Создать урок
          </button>
        </div>
      </div>

      {!isDashboardMobile && (
        <Modal
          open={isActivityOpen}
          onClose={() => setIsActivityOpen(false)}
          title="Лента активности"
          titleActions={
            <ActivityFeedFiltersControl
              filters={activityFilters}
              students={activityStudents}
              onApplyFilters={handleApplyActivityFilters}
              popoverAlign="start"
            />
          }
        >
          <ActivityFeedFullscreen
            items={activityItems}
            loading={activityLoading}
            loadingMore={activityLoadingMore}
            hasMore={activityHasMore}
            onLoadMore={loadMoreActivity}
          />
        </Modal>
      )}

      <BottomSheet
        isOpen={isDashboardMobile && isUnpaidOpen}
        onClose={() => setIsUnpaidOpen(false)}
        className={styles.unpaidBottomSheet}
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
          onTogglePaid={togglePaid}
          onRemindLessonPayment={handleRemindLessonPayment}
          showAll
          showToggle={false}
          stickyHeader
          fitContainer
        />
      </BottomSheet>

      <BottomSheet
        isOpen={isDashboardMobile && isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        className={styles.activityBottomSheet}
        contentScrollable={false}
      >
        <ActivityFeedFullscreen
          items={activityItems}
          loading={activityLoading}
          loadingMore={activityLoadingMore}
          hasMore={activityHasMore}
          onLoadMore={loadMoreActivity}
          headerTitle="Лента активности"
          headerAction={
            <ActivityFeedFiltersControl
              filters={activityFilters}
              students={activityStudents}
              onApplyFilters={handleApplyActivityFilters}
              popoverAlign="end"
            />
          }
          fitContainer
        />
      </BottomSheet>
    </section>
  );
};
