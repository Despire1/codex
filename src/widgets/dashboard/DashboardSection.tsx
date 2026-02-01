import { addDays, format, isSameDay } from 'date-fns';
import { type FC, useMemo, useState } from 'react';
import { Lesson, LinkedStudent, Teacher } from '@/entities/types';
import controls from '../../shared/styles/controls.module.css';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { Badge } from '@/shared/ui/Badge/Badge';
import { AttentionCard, AttentionItem } from './components/AttentionCard';
import { UnpaidLessonsPopoverContent } from './components/UnpaidLessonsPopoverContent';
import styles from './DashboardSection.module.css';
import { getLessonColorVars } from '@/shared/lib/lessonColors';
import { pluralizeRu } from '@/shared/lib/pluralizeRu';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { formatInTimeZone, toUtcEndOfDay, toZonedDate } from '@/shared/lib/timezoneDates';
import { useIsMobile } from '@/shared/lib/useIsMobile';

interface DashboardSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  teacher: Teacher;
  onAddStudent: () => void;
  onCreateLesson: () => void;
  onOpenSchedule: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onCompleteLesson: (lessonId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onRemindLessonPayment: (
    lessonId: number,
    studentId?: number,
  ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
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
  onCompleteLesson,
  onTogglePaid,
  onRemindLessonPayment,
  onOpenStudent,
}) => {
  const timeZone = useTimeZone();
  const now = new Date();
  const todayZoned = toZonedDate(now, timeZone);
  const [isAttentionOpen, setIsAttentionOpen] = useState(false);
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const isDashboardMobile = useIsMobile(1023);

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

  const studentMap = useMemo(() => {
    return new Map(linkedStudents.map((student) => [student.id, student]));
  }, [linkedStudents]);

  const unpaidEntries = useMemo(() => {
    return lessons.flatMap((lesson) => {
      if (lesson.status !== 'COMPLETED') return [];

      const buildEntry = (studentId: number, price: number) => {
        const student = studentMap.get(studentId);
        return {
          lessonId: lesson.id,
          startAt: lesson.startAt,
          completedAt: lesson.completedAt ?? null,
          lastPaymentReminderAt: lesson.lastPaymentReminderAt ?? null,
          paymentReminderCount: lesson.paymentReminderCount ?? 0,
          studentId,
          studentName: getLinkedStudentName(studentId, linkedStudents),
          price,
          isActivated: student?.isActivated ?? true,
          paymentRemindersEnabled: student?.paymentRemindersEnabled ?? true,
        };
      };

      if (lesson.participants && lesson.participants.length > 0) {
        return lesson.participants
          .filter((participant) => !participant.isPaid)
          .map((participant) => buildEntry(participant.studentId, participant.price));
      }
      if (lesson.isPaid) return [];

      const price = typeof lesson.price === 'number' ? lesson.price : 0;
      return [buildEntry(lesson.studentId, price)];
    });
  }, [lessons, linkedStudents, studentMap]);

  const unpaidSummary = useMemo(() => {
    const studentIds = new Set(unpaidEntries.map((entry) => entry.studentId));
    const total = unpaidEntries.reduce((sum, entry) => sum + entry.price, 0);
    return {
      total,
      lessonCount: unpaidEntries.length,
      studentCount: studentIds.size,
    };
  }, [unpaidEntries]);

  useEffect(() => {
    if (attentionItems.length === 0) {
      setIsAttentionOpen(false);
    }
  }, [attentionItems.length]);

  return (
    <section
      className={`${styles.grid} ${attentionItems.length > 0 ? styles.gridWithAttention : styles.gridNoAttention}`}
    >
      {attentionItems.length > 0 && (
        <AttentionCard
          items={attentionItems}
          isOpen={isAttentionOpen}
          onToggle={() => setIsAttentionOpen((prev) => !prev)}
          onCompleteLesson={(lessonId) => onCompleteLesson(lessonId)}
          onTogglePaid={(lessonId, studentId) => onTogglePaid(lessonId, studentId)}
          className={`${styles.card} ${styles.attentionCard} ${styles.attentionArea}`}
        />
      )}

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

      {unpaidSummary.lessonCount > 0 && (
        <div className={`${styles.unpaidCardWrapper} ${styles.unpaidArea}`}>
          {isDashboardMobile ? (
            <div className={`${styles.card} ${styles.unpaidCard}`}>
              <UnpaidLessonsPopoverContent
                entries={unpaidEntries}
                reminderDelayHours={teacher.paymentReminderDelayHours}
                globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
                onOpenStudent={onOpenStudent}
                onTogglePaid={onTogglePaid}
                onRemindLessonPayment={onRemindLessonPayment}
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
                onTogglePaid={onTogglePaid}
                onRemindLessonPayment={onRemindLessonPayment}
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
          <button className={controls.secondaryButton} onClick={onCreateLesson}>
            Создать урок
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={isDashboardMobile && isUnpaidOpen}
        onClose={() => setIsUnpaidOpen(false)}
        className={styles.unpaidBottomSheet}
      >
        <UnpaidLessonsPopoverContent
          entries={unpaidEntries}
          reminderDelayHours={teacher.paymentReminderDelayHours}
          globalPaymentRemindersEnabled={teacher.globalPaymentRemindersEnabled}
          onOpenStudent={(studentId) => {
            setIsUnpaidOpen(false);
            onOpenStudent(studentId);
          }}
          onTogglePaid={onTogglePaid}
          onRemindLessonPayment={onRemindLessonPayment}
          showAll
          showToggle={false}
          stickyHeader
        />
      </BottomSheet>
    </section>
  );
};
