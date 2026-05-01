import { isSameDay } from 'date-fns';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Lesson, LinkedStudent, Teacher } from '@/entities/types';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Badge } from '@/shared/ui/Badge/Badge';
import { AttentionCard, AttentionItem } from './components/AttentionCard';
import { UnpaidLessonsPopoverContent } from './components/UnpaidLessonsPopoverContent';
import { ActivityFeedCard } from './components/ActivityFeedCard';
import { useActivityFeedDrawer } from './model/ActivityFeedDrawerContext';
import { DashboardQuickActionsReferenceCard } from './components/DashboardQuickActionsReferenceCard';
import styles from './DashboardSection.module.css';
import { WeeklyCalendarReference } from './components/WeeklyCalendarReference/WeeklyCalendarReference';
import { pluralizeRu } from '@/shared/lib/pluralizeRu';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '@/shared/lib/timezoneDates';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { useDashboardState } from './model/useDashboardState';
import type { DashboardActivityFilters } from './model/useDashboardActivityFeed';
import type { DashboardSummary } from '../../shared/api/client';
import { MobileDashboard } from './components/mobile/MobileDashboard';

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
  onOpenHomeworkAssign: (studentId?: number | null, lessonId?: number | null) => void;
  onCreateHomeworkTemplate: () => void;
  dashboardSummary: DashboardSummary | null;
}

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
  onOpenHomeworkAssign,
  onCreateHomeworkTemplate,
  dashboardSummary,
}) => {
  const timeZone = useTimeZone();
  const {
    markLessonCompleted,
    togglePaid,
    remindLessonPayment,
    openRescheduleModal,
    startEditLesson,
    requestDeleteLessonFromList,
  } = useLessonActions();
  const { unpaidEntries, setWeekRange, isWeekLessonsLoading } = useDashboardState();
  const isDashboardMobile = useIsMobile(1023);
  const {
    items: activityItems,
    loading: activityLoading,
    filters: activityFilters,
    applyFilters: applyActivityFilters,
    resetFilters: resetActivityFiltersFromCtx,
    refresh: refreshActivity,
    open: openActivityDrawer,
    hasUnread: hasUnreadActivity,
    refreshUnread: refreshUnreadActivity,
    markSeen: markActivityAsSeen,
  } = useActivityFeedDrawer();
  const todayZoned = toZonedDate(new Date(), timeZone);
  const [isAttentionOpen, setIsAttentionOpen] = useState(false);
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const showWeeklyCalendar = !isDashboardMobile;

  const attentionItems: AttentionItem[] = useMemo(() => {
    const nowMs = Date.now();
    return lessons.flatMap((lesson) => {
      const startMs = new Date(lesson.startAt).getTime();
      const endMs = startMs + lesson.durationMinutes * 60_000;
      const isPast = endMs < nowMs;
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
  }, [lessons, linkedStudents]);

  const todayLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) => isSameDay(toZonedDate(lesson.startAt, timeZone), todayZoned) && lesson.status !== 'CANCELED',
      ),
    [lessons, timeZone, todayZoned],
  );

  const todayUpcomingLesson = useMemo(() => {
    const nowMs = Date.now();
    return todayLessons
      .filter((lesson) => lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() >= nowMs)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
  }, [todayLessons]);

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

  const handleRemindLessonPayment = useCallback(
    async (lessonId: number, studentId?: number) => {
      const result = await remindLessonPayment(lessonId, studentId);
      void refreshActivity();
      void refreshUnreadActivity();
      return result;
    },
    [refreshActivity, refreshUnreadActivity, remindLessonPayment],
  );

  const handleRequestMobileActivityFeed = useCallback(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const handleApplyActivityFilters = useCallback(
    (next: DashboardActivityFilters) => {
      applyActivityFilters(next);
    },
    [applyActivityFilters],
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
    resetActivityFiltersFromCtx();
  }, [resetActivityFiltersFromCtx]);

  useEffect(() => {
    if (attentionItems.length === 0) {
      setIsAttentionOpen(false);
    }
  }, [attentionItems.length]);

  if (isDashboardMobile) {
    return (
      <MobileDashboard
        lessons={lessons}
        linkedStudents={linkedStudents}
        teacher={teacher}
        unpaidEntries={unpaidEntries}
        summary={dashboardSummary}
        onAddStudent={onAddStudent}
        onCreateLesson={onCreateLesson}
        onOpenSchedule={onOpenSchedule}
        onOpenLesson={onOpenLesson}
        onOpenStudent={onOpenStudent}
        onOpenHomeworkAssign={onOpenHomeworkAssign}
        onCreateHomeworkTemplate={onCreateHomeworkTemplate}
        onTogglePaid={togglePaid}
        onCompleteLesson={markLessonCompleted}
        onRemindLessonPayment={handleRemindLessonPayment}
        onRescheduleLesson={(lesson) => openRescheduleModal(lesson, { skipNavigation: true })}
        onEditLesson={startEditLesson}
        onDeleteLesson={requestDeleteLessonFromList}
        hasUnreadActivity={hasUnreadActivity}
        activityItems={activityItems}
        activityLoading={activityLoading}
        onRequestActivityFeed={handleRequestMobileActivityFeed}
        onRefreshActivity={refreshActivity}
        onRefreshUnreadActivity={refreshUnreadActivity}
        onMarkActivityAsSeen={markActivityAsSeen}
      />
    );
  }

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
        <WeeklyCalendarReference
          className={styles.calendarArea}
          lessons={lessons}
          linkedStudents={linkedStudents}
          timeZone={timeZone}
          weekendWeekdays={teacher.weekendWeekdays}
          isLoading={isWeekLessonsLoading}
          onCreateLesson={(date) => onCreateLesson(date)}
          onOpenLessonDay={onOpenLessonDay}
          onWeekRangeChange={setWeekRange}
        />
      )}

      <DashboardQuickActionsReferenceCard
        className={styles.quickActionsArea}
        onCreateHomework={onCreateHomeworkTemplate}
        onCreateLesson={() => onCreateLesson()}
        onAddStudent={onAddStudent}
      />

      <div className={`${styles.card} ${styles.activityCardShell} ${activityAreaClassName}`}>
        <ActivityFeedCard
          items={activityItems}
          loading={activityLoading}
          activeFiltersCount={activityFiltersCount}
          onResetFilters={handleResetActivityFilters}
          onOpen={openActivityDrawer}
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
              <button type="button" className={styles.unpaidShowAllButton} onClick={() => setIsUnpaidOpen(true)}>
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
                maxVisibleEntries={3}
                showToggle={false}
              />
              {unpaidEntries.length > 3 && (
                <button type="button" className={styles.unpaidShowAllButton} onClick={() => setIsUnpaidOpen(true)}>
                  Показать все
                </button>
              )}
            </div>
          )}
        </div>
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

      {!isDashboardMobile && (
        <Modal open={isUnpaidOpen} onClose={() => setIsUnpaidOpen(false)} title="Неоплаченные занятия">
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
            hideHeader
          />
        </Modal>
      )}
    </section>
  );
};
