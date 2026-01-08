import { addDays, addMinutes, endOfDay, format, isSameDay, isToday, isTomorrow, parseISO } from 'date-fns';
import { type FC, useEffect, useMemo, useState } from 'react';
import { Lesson, LinkedStudent } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import { AdaptivePopover } from '../../shared/ui/AdaptivePopover/AdaptivePopover';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { AttentionCard, AttentionItem } from './components/AttentionCard';
import { UnpaidLessonsPopoverContent } from './components/UnpaidLessonsPopoverContent';
import styles from './DashboardSection.module.css';
import { getLessonColorVars } from '../../shared/lib/lessonColors';
import { pluralizeRu } from '../../shared/lib/pluralizeRu';
import { Badge } from '../../shared/ui/Badge/Badge';

interface DashboardSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  onAddStudent: () => void;
  onCreateLesson: () => void;
  onOpenSchedule: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onCompleteLesson: (lessonId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
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
  onAddStudent,
  onCreateLesson,
  onOpenSchedule,
  onOpenLesson,
  onCompleteLesson,
  onTogglePaid,
  onOpenStudent,
}) => {
  const now = new Date();
  const [isAttentionOpen, setIsAttentionOpen] = useState(false);
  const [isUnpaidOpen, setIsUnpaidOpen] = useState(false);
  const [isDashboardMobile, setIsDashboardMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDashboardMobile(event.matches);

    setIsDashboardMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.addEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  const attentionItems: AttentionItem[] = useMemo(() => {
    return lessons.flatMap((lesson) => {
      const start = parseISO(lesson.startAt);
      const end = addMinutes(start, lesson.durationMinutes);
      const isPast = end.getTime() < now.getTime();
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
    () => lessons.filter((lesson) => isToday(parseISO(lesson.startAt)) && lesson.status !== 'CANCELED'),
    [lessons],
  );

  const todayUpcomingLesson = useMemo(() => {
    return todayLessons
      .filter((lesson) => lesson.status === 'SCHEDULED' && parseISO(lesson.startAt).getTime() >= now.getTime())
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())[0];
  }, [now, todayLessons]);

  const upcomingLessons = useMemo(() => {
    return lessons
      .filter((lesson) => {
        if (lesson.status !== 'SCHEDULED') return false;
        const date = parseISO(lesson.startAt);
        const windowEnd = endOfDay(addDays(now, 2));
        return date.getTime() >= now.getTime() && date.getTime() <= windowEnd.getTime();
      })
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());
  }, [lessons, now]);

  const upcomingLessonCards = upcomingLessons.slice(0, 5);

  const unpaidEntries = useMemo(() => {
    return lessons.flatMap((lesson) => {
      if (lesson.status !== 'COMPLETED') return [];
      if (lesson.participants && lesson.participants.length > 0) {
        return lesson.participants
          .filter((participant) => !participant.isPaid)
          .map((participant) => ({
            lesson,
            studentId: participant.studentId,
            studentName: getLinkedStudentName(participant.studentId, linkedStudents),
            price: participant.price,
          }));
      }
      if (lesson.isPaid) return [];
      return [
        {
          lesson,
          studentId: lesson.studentId,
          studentName: getLinkedStudentName(lesson.studentId, linkedStudents),
          price: typeof lesson.price === 'number' ? lesson.price : 0,
        },
      ];
    });
  }, [lessons, linkedStudents]);

  const unpaidGroups = useMemo(() => {
    const map = new Map<
      number,
      { studentName: string; total: number; lessons: { id: number; startAt: string }[] }
    >();
    unpaidEntries.forEach((entry) => {
      const existing = map.get(entry.studentId) ?? {
        studentName: entry.studentName,
        total: 0,
        lessons: [],
      };
      existing.total += entry.price;
      existing.lessons.push({ id: entry.lesson.id, startAt: entry.lesson.startAt });
      map.set(entry.studentId, existing);
    });
    return Array.from(map.entries()).map(([studentId, data]) => ({
      studentId,
      studentName: data.studentName,
      total: data.total,
      lessons: data.lessons.sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime()),
    }));
  }, [unpaidEntries]);

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
              ? `Первое — в ${format(parseISO(todayUpcomingLesson.startAt), 'HH:mm')}`
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
              const date = parseISO(lesson.startAt);
              const label = isToday(date)
                ? 'Сегодня'
                : isTomorrow(date)
                  ? 'Завтра'
                  : isSameDay(date, addDays(now, 2))
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
            <button
              type="button"
              className={`${styles.card} ${styles.unpaidCard}`}
              onClick={() => setIsUnpaidOpen(true)}
            >
              <div className={styles.cardHeader}>Неоплаченные занятия</div>
              <div className={styles.unpaidSummary}>
                {pluralizeRu(unpaidSummary.studentCount, { one: 'ученик', few: 'ученика', many: 'учеников' })} ·{' '}
                {pluralizeRu(unpaidSummary.lessonCount, { one: 'занятие', few: 'занятия', many: 'занятий' })} ·{' '}
                {unpaidSummary.total} ₽
              </div>
            </button>
          ) : (
            <AdaptivePopover
              isOpen={isUnpaidOpen}
              onClose={() => setIsUnpaidOpen(false)}
              align="end"
              side="bottom"
              className={styles.unpaidPopover}
              rootClassName={styles.unpaidPopoverRoot}
              triggerClassName={styles.unpaidTrigger}
              trigger={
                <button
                  type="button"
                  className={`${styles.card} ${styles.unpaidCard}`}
                  onClick={() => setIsUnpaidOpen((prev) => !prev)}
                >
                  <div className={styles.cardHeader}>Неоплаченные занятия</div>
                  <div className={styles.unpaidSummary}>
                    {pluralizeRu(unpaidSummary.studentCount, { one: 'ученик', few: 'ученика', many: 'учеников' })} ·{' '}
                    {pluralizeRu(unpaidSummary.lessonCount, { one: 'занятие', few: 'занятия', many: 'занятий' })} ·{' '}
                    {unpaidSummary.total} ₽
                  </div>
                </button>
              }
            >
              <UnpaidLessonsPopoverContent
                groups={unpaidGroups}
                onOpenStudent={(studentId) => {
                  setIsUnpaidOpen(false);
                  onOpenStudent(studentId);
                }}
              />
            </AdaptivePopover>
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

      <BottomSheet isOpen={isDashboardMobile && isUnpaidOpen} onClose={() => setIsUnpaidOpen(false)}>
        <UnpaidLessonsPopoverContent
          groups={unpaidGroups}
          onOpenStudent={(studentId) => {
            setIsUnpaidOpen(false);
            onOpenStudent(studentId);
          }}
        />
      </BottomSheet>
    </section>
  );
};
