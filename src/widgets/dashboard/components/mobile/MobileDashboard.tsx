import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityFeedItem, Lesson, LinkedStudent, Teacher, UnpaidLessonEntry } from '@/entities/types';
import type { DashboardSummary } from '@/shared/api/client';
import { AddOutlinedIcon, EventNoteIcon, PeopleIcon, TaskAltIcon } from '@/icons/MaterialIcons';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { AnchoredPopover } from '@/shared/ui/AnchoredPopover/AnchoredPopover';
import { UnpaidLessonsPopoverContent } from '../UnpaidLessonsPopoverContent';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import {
  buildMobileDashboardPresentation,
  formatRubles,
  resolveLessonAmountRub,
  resolveLessonPrimaryStudentId,
  type MobileDashboardCloseLesson,
} from '../../model/mobileDashboardPresentation';
import { MobileDashboardHeader } from './MobileDashboardHeader';
import { MobileDashboardStats } from './MobileDashboardStats';
import { MobileDashboardNextLessonCard } from './MobileDashboardNextLessonCard';
import { MobileDashboardCloseLessonCard } from './MobileDashboardCloseLessonCard';
import { MobileDashboardSchedule } from './MobileDashboardSchedule';
import { MobileDashboardQuickActions } from './MobileDashboardQuickActions';
import { ActivityFeedFullscreen } from '../ActivityFeedFullscreen';
import { ActivityFeedFiltersControl } from '../ActivityFeedFiltersControl';
import type { DashboardActivityFilters } from '../../model/useDashboardActivityFeed';
import styles from './MobileDashboard.module.css';
import { formatInTimeZone } from '@/shared/lib/timezoneDates';

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
  const [scheduleMode, setScheduleMode] = useState<'day' | 'week'>('day');
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [actionsLesson, setActionsLesson] = useState<Lesson | null>(null);
  const fabButtonRef = useRef<HTMLButtonElement | null>(null);
  const activitySeenRef = useRef<string | null>(null);
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
  const lessonById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
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

  const closeLessonPaymentStudentId =
    presentation.closeLesson?.primaryStudentId ??
    (presentation.closeLesson ? resolveLessonPrimaryStudentId(presentation.closeLesson.lesson, { preferUnpaid: true }) : null);

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
        console.error('Failed to mark activity feed as seen in mobile drawer', error);
        activitySeenRef.current = null;
      });
  }, [
    activityItems,
    activityLoading,
    isActivityOpen,
    onMarkActivityAsSeen,
    onRefreshUnreadActivity,
  ]);

  return (
    <section className={styles.root}>
      <MobileDashboardHeader
        dateLabel={presentation.headerDateLabel}
        scheduleMode={scheduleMode}
        onScheduleModeChange={setScheduleMode}
        hasActivityUnread={hasUnreadActivity}
        onOpenActivityFeed={() => {
          setIsActivityOpen(true);
          onRequestActivityFeed();
          if (activityFeedRequested) {
            void onRefreshActivity();
          }
          void onRefreshUnreadActivity();
        }}
      />

      <MobileDashboardStats
        todayPlanRub={presentation.todayPlanRub}
        todayPlanDeltaPercent={presentation.todayPlanDeltaPercent}
        unpaidRub={presentation.unpaidRub}
        unpaidStudentsCount={presentation.unpaidStudentsCount}
        receivableWeekRub={presentation.receivableWeekRub}
      />

      <MobileDashboardNextLessonCard
        nextLesson={presentation.nextLesson}
        onReschedule={() => {
          if (!presentation.nextLesson) return;
          onRescheduleLesson(presentation.nextLesson.lesson);
        }}
      />

      <MobileDashboardCloseLessonCard
        closeLesson={presentation.closeLesson}
        onTogglePaid={(lessonId, studentId) => {
          void onTogglePaid(lessonId, studentId);
        }}
        onOpenHomeworkAssign={onOpenHomeworkAssign}
        onOpenActions={() => setActionsLesson(presentation.closeLesson?.lesson ?? null)}
      />

      <section className={styles.unpaidCard}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Неоплаченные занятия</h3>
          {unpaidEntries.length > 0 ? (
            <button type="button" className={styles.sectionAction} onClick={() => setIsUnpaidOpen(true)}>
              Показать все
            </button>
          ) : null}
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
          maxVisibleEntries={1}
          showToggle={false}
        />
      </section>

      <MobileDashboardSchedule
        mode={scheduleMode}
        dayTimeline={presentation.dayTimeline}
        weekTimeline={presentation.weekTimeline}
        onOpenLesson={(lessonId) => {
          const lesson = lessonById.get(lessonId);
          if (!lesson) return;
          onOpenLesson(lesson);
        }}
        onOpenSchedule={onOpenSchedule}
      />

      <MobileDashboardQuickActions onAddStudent={onAddStudent} onCreateLesson={onCreateLesson} />

      <div className={styles.bottomSpacer} />

      <button
        type="button"
        ref={fabButtonRef}
        className={styles.fab}
        onClick={() => setIsFabOpen((prev) => !prev)}
        aria-label="Быстрые действия"
      >
        <AddOutlinedIcon width={28} height={28} />
      </button>

      <AnchoredPopover
        isOpen={isFabOpen}
        anchorEl={fabButtonRef.current}
        onClose={() => setIsFabOpen(false)}
        side="top"
        align="end"
        offset={10}
        className={styles.fabPopover}
      >
        <div className={styles.fabPopoverActions}>
          <button
            type="button"
            className={styles.fabPopoverAction}
            onClick={() => {
              setIsFabOpen(false);
              onCreateLesson();
            }}
          >
            <EventNoteIcon width={16} height={16} />
            <span>Создать урок</span>
          </button>
          <button
            type="button"
            className={styles.fabPopoverAction}
            onClick={() => {
              setIsFabOpen(false);
              onAddStudent();
            }}
          >
            <PeopleIcon width={16} height={16} />
            <span>Добавить ученика</span>
          </button>
          <button
            type="button"
            className={styles.fabPopoverAction}
            onClick={() => {
              setIsFabOpen(false);
              onOpenHomeworkAssign(quickHomeworkPrefill.studentId, quickHomeworkPrefill.lessonId);
            }}
          >
            <TaskAltIcon width={16} height={16} />
            <span>Выдать ДЗ</span>
          </button>
        </div>
      </AnchoredPopover>

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
                  formatInTimeZone(actionsLesson.startAt, 'd MMM, HH:mm', { timeZone })}
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
                <span>Отметить проведенным</span>
              </button>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  void onTogglePaid(actionsLesson.id, closeLessonPaymentStudentId ?? undefined);
                }}
              >
                <span>{actionLessonPresentation?.isPaid ? 'Отменить оплату' : 'Отметить оплату'}</span>
              </button>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  onRescheduleLesson(actionsLesson);
                }}
              >
                <span>Перенести</span>
              </button>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setActionsLesson(null);
                  onEditLesson(actionsLesson);
                }}
              >
                <span>Редактировать</span>
              </button>
              <button
                type="button"
                className={`${styles.sheetAction} ${styles.sheetActionDanger}`}
                onClick={() => {
                  setActionsLesson(null);
                  onDeleteLesson(actionsLesson);
                }}
              >
                <span>Удалить</span>
              </button>
              <button type="button" className={styles.sheetCancel} onClick={() => setActionsLesson(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </section>
  );
};
