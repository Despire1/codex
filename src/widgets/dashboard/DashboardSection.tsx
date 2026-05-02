import { type FC, useCallback, useEffect, useState } from 'react';
import { type DashboardActionRequiredItem, Lesson, LinkedStudent, Teacher } from '@/entities/types';
import { Modal } from '@/shared/ui/Modal/Modal';
import { AttentionCard } from './components/AttentionCard';
import { UnpaidLessonsPopoverContent } from './components/UnpaidLessonsPopoverContent';
import { UnpaidLessonsCompactCard } from './components/UnpaidLessonsCompactCard';
import { HomeworkReviewCard } from './components/HomeworkReviewCard';
import { useActivityFeedDrawer } from './model/ActivityFeedDrawerContext';
import { DashboardQuickActionsReferenceCard } from './components/DashboardQuickActionsReferenceCard';
import styles from './DashboardSection.module.css';
import { WeeklyCalendarReference } from './components/WeeklyCalendarReference/WeeklyCalendarReference';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { useDashboardState } from './model/useDashboardState';
import type { DashboardSummary } from '../../shared/api/client';
import { MobileDashboard } from './components/mobile/MobileDashboard';

interface DashboardSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  teacher: Teacher;
  onAddStudent: () => void;
  onCreateLesson: (date?: Date, options?: { studentId?: number | null }) => void;
  onOpenSchedule: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onOpenLessonDay: (lesson: Lesson) => void;
  onOpenStudent: (studentId: number) => void;
  onOpenHomeworkAssign: (studentId?: number | null, lessonId?: number | null) => void;
  onCreateHomeworkTemplate: () => void;
  onOpenHomeworkReview?: (assignmentId: number, studentId: number) => void;
  dashboardSummary: DashboardSummary | null;
}

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
  onOpenHomeworkReview,
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
  const {
    unpaidEntries,
    setWeekRange,
    isWeekLessonsLoading,
    actionRequiredItems,
    loadActionRequired,
    loadUnpaidLessons,
    homeworkReviewItems,
  } = useDashboardState();
  const isDashboardMobile = useIsMobile(1023);
  const {
    items: activityItems,
    loading: activityLoading,
    refresh: refreshActivity,
    hasUnread: hasUnreadActivity,
    refreshUnread: refreshUnreadActivity,
    markSeen: markActivityAsSeen,
  } = useActivityFeedDrawer();
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);

  const handleRemindLessonPayment = useCallback(
    async (lessonId: number, studentId?: number) => {
      const result = await remindLessonPayment(lessonId, studentId);
      void refreshActivity();
      void refreshUnreadActivity();
      void loadActionRequired();
      return result;
    },
    [loadActionRequired, refreshActivity, refreshUnreadActivity, remindLessonPayment],
  );

  const handleAttentionAction = useCallback(
    async (item: DashboardActionRequiredItem) => {
      switch (item.action.type) {
        case 'mark_lesson_completed':
          if (item.lessonId) {
            await markLessonCompleted(item.lessonId);
            void loadActionRequired();
            void loadUnpaidLessons();
          }
          break;
        case 'mark_lesson_paid':
          if (item.lessonId) {
            await togglePaid(item.lessonId, item.studentId ?? undefined);
            void loadActionRequired();
            void loadUnpaidLessons();
          }
          break;
        case 'remind_payment':
          if (item.lessonId) {
            await handleRemindLessonPayment(item.lessonId, item.studentId ?? undefined);
          }
          break;
        case 'open_student':
          if (item.studentId) onOpenStudent(item.studentId);
          break;
        case 'create_lesson':
          onCreateLesson(undefined, { studentId: item.studentId });
          break;
      }
    },
    [
      handleRemindLessonPayment,
      loadActionRequired,
      loadUnpaidLessons,
      markLessonCompleted,
      onCreateLesson,
      onOpenStudent,
      togglePaid,
    ],
  );

  const handleHomeworkOpen = useCallback(
    (assignmentId: number, studentId: number) => {
      if (onOpenHomeworkReview) {
        onOpenHomeworkReview(assignmentId, studentId);
        return;
      }
      onOpenStudent(studentId);
    },
    [onOpenHomeworkReview, onOpenStudent],
  );

  const handleRequestMobileActivityFeed = useCallback(() => {
    void refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    if (!isDashboardMobile && unpaidEntries.length === 0) {
      setIsUnpaidOpen(false);
    }
  }, [isDashboardMobile, unpaidEntries.length]);

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
    <section className={`${styles.grid} ${styles.gridWithCalendar}`}>
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

      <DashboardQuickActionsReferenceCard
        className={styles.quickActionsArea}
        onCreateHomework={onCreateHomeworkTemplate}
        onCreateLesson={() => onCreateLesson()}
        onAddStudent={onAddStudent}
      />

      <div className={styles.middleArea}>
        <UnpaidLessonsCompactCard
          entries={unpaidEntries}
          onOpenStudent={onOpenStudent}
          onTogglePaid={togglePaid}
          onRemindLessonPayment={handleRemindLessonPayment}
          onShowAll={() => setIsUnpaidOpen(true)}
        />
        <HomeworkReviewCard items={homeworkReviewItems} onOpenAssignment={handleHomeworkOpen} />
      </div>

      <AttentionCard items={actionRequiredItems} onAction={handleAttentionAction} className={styles.attentionArea} />

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
    </section>
  );
};
