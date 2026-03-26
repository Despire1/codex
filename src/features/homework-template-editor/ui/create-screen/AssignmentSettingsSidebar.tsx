import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkGroupListItem, Lesson } from '../../../../entities/types';
import { api } from '../../../../shared/api/client';
import { DatePickerField } from '../../../../shared/ui/DatePickerField';
import { useTimeZone } from '../../../../shared/lib/timezoneContext';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import {
  HomeworkBookOpenIcon,
  HomeworkBookmarkRegularIcon,
  HomeworkPaperPlaneIcon,
  HomeworkPlayIcon,
  HomeworkSlidersIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { HomeworkEditorAssignmentContext } from '../../model/types';
import {
  createQuickDeadlineValue,
  resolveNextUpcomingLesson,
  toLocalDateTimeValue,
  toUtcIsoFromLocal,
} from '../../../homework-assign/model/lib/assignmentStarter';
import { AssignmentSettingsSelect } from './AssignmentSettingsSelect';
import styles from './AssignmentSettingsSidebar.module.css';

type StudentOption = {
  id: number;
  name: string;
};

interface AssignmentSettingsSidebarProps {
  assignment: HomeworkEditorAssignmentContext;
  students: StudentOption[];
  groups: HomeworkGroupListItem[];
  disabled?: boolean;
  studentLocked?: boolean;
  saveAsTemplateSubmitting?: boolean;
  validationErrors: string[];
  onChange: (next: HomeworkEditorAssignmentContext) => void;
  onOpenPreview: () => void;
  onSaveAsTemplate: () => void;
}

type NextLessonRef = Pick<Lesson, 'id' | 'startAt'>;

export const AssignmentSettingsSidebar: FC<AssignmentSettingsSidebarProps> = ({
  assignment,
  students,
  groups,
  disabled = false,
  studentLocked = false,
  saveAsTemplateSubmitting = false,
  validationErrors,
  onChange,
  onOpenPreview,
  onSaveAsTemplate,
}) => {
  const timeZone = useTimeZone();
  const requestIdRef = useRef(0);
  const [isResolvingNextLesson, setIsResolvingNextLesson] = useState(false);
  const [nextLesson, setNextLesson] = useState<NextLessonRef | null>(null);

  const assignmentGroups = useMemo(
    () =>
      groups
        .filter((group) => !group.isArchived && !group.isSystem)
        .slice()
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
          return left.title.localeCompare(right.title, 'ru');
        }),
    [groups],
  );
  const studentOptions = useMemo(
    () => students.map((student) => ({ value: String(student.id), label: student.name })),
    [students],
  );
  const groupOptions = useMemo(
    () => [
      { value: '', label: 'Без группы' },
      ...assignmentGroups.map((group) => ({
        value: String(group.id ?? ''),
        label: group.title,
      })),
    ],
    [assignmentGroups],
  );

  const deadlineLocalValue = useMemo(() => {
    if (!assignment.deadlineAt) return '';
    return toLocalDateTimeValue(assignment.deadlineAt, timeZone);
  }, [assignment.deadlineAt, timeZone]);

  const selectedLessonLabel = useMemo(() => {
    if (!assignment.lessonId) return null;
    if (nextLesson?.id === assignment.lessonId) {
      return `Следующий урок: ${formatInTimeZone(nextLesson.startAt, 'd MMM, HH:mm', { timeZone })}`;
    }
    return `Привязка к уроку #${assignment.lessonId}`;
  }, [assignment.lessonId, nextLesson, timeZone]);

  const resolveStudentLessons = useCallback(async (studentId: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsResolvingNextLesson(true);

    try {
      const response = await api.listStudentLessons(studentId, {
        status: 'not_completed',
        sort: 'asc',
      });
      if (requestIdRef.current !== requestId) return null;

      const lesson = resolveNextUpcomingLesson(response.items);
      if (!lesson) {
        setNextLesson(null);
        return null;
      }

      const ref = {
        id: lesson.id,
        startAt: lesson.startAt,
      };
      setNextLesson(ref);
      return ref;
    } catch {
      if (requestIdRef.current !== requestId) return null;
      setNextLesson(null);
      return null;
    } finally {
      if (requestIdRef.current === requestId) {
        setIsResolvingNextLesson(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!assignment.studentId) {
      setNextLesson(null);
      return;
    }
    void resolveStudentLessons(assignment.studentId);
  }, [assignment.studentId, resolveStudentLessons]);

  useEffect(() => {
    if (isResolvingNextLesson) return;
    if (assignment.sendMode !== 'AUTO_AFTER_LESSON_DONE') return;
    if (nextLesson) return;

    onChange({
      ...assignment,
      sendMode: 'MANUAL',
      lessonId: null,
    });
  }, [assignment, isResolvingNextLesson, nextLesson, onChange]);

  const canUseNextLesson = Boolean(nextLesson);

  const applyNextLesson = useCallback(async () => {
    if (!assignment.studentId) return;
    const lesson = await resolveStudentLessons(assignment.studentId);
    if (!lesson) {
      onChange({
        ...assignment,
        lessonId: null,
      });
      return;
    }

    onChange({
      ...assignment,
      lessonId: lesson.id,
      deadlineAt: lesson.startAt,
    });
  }, [assignment, onChange, resolveStudentLessons]);

  return (
    <div className={styles.sidebar}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <HomeworkSlidersIcon size={15} />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Параметры выдачи</h2>
            <p className={styles.cardSubtitle}>Кому отправить домашку и как её выдать.</p>
          </div>
        </div>

        <label className={styles.field}>
          Кому
          <AssignmentSettingsSelect
            value={assignment.studentId ? String(assignment.studentId) : ''}
            options={studentOptions}
            placeholder="Выберите ученика…"
            ariaLabel="Выбор ученика для домашнего задания"
            disabled={disabled || studentLocked || students.length === 0}
            onChange={(nextValue) =>
              onChange({
                ...assignment,
                studentId: nextValue ? Number(nextValue) : null,
                lessonId: null,
              })
            }
          />
        </label>

        <label className={styles.field}>
          Группа
          <AssignmentSettingsSelect
            value={assignment.groupId ? String(assignment.groupId) : ''}
            options={groupOptions}
            placeholder="Без группы"
            ariaLabel="Выбор группы для домашнего задания"
            disabled={disabled}
            onChange={(nextValue) =>
              onChange({
                ...assignment,
                groupId: nextValue ? Number(nextValue) : null,
              })
            }
          />
        </label>

        <label className={styles.field}>
          Дедлайн
          <DatePickerField
            mode="datetime"
            className={styles.datePickerField}
            placeholder="Выберите дату и время"
            value={deadlineLocalValue || undefined}
            onChange={(nextValue) =>
              onChange({
                ...assignment,
                deadlineAt: nextValue ? toUtcIsoFromLocal(nextValue, timeZone) : null,
              })
            }
            disabled={disabled}
          />
        </label>

        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.quickButton}
            onClick={() =>
              onChange({
                ...assignment,
                deadlineAt: toUtcIsoFromLocal(createQuickDeadlineValue(2, timeZone), timeZone),
              })
            }
            disabled={disabled}
          >
            +2 дня
          </button>
          {canUseNextLesson ? (
            <button
              type="button"
              className={styles.quickButton}
              onClick={() => {
                void applyNextLesson();
              }}
              disabled={disabled || isResolvingNextLesson}
            >
              {isResolvingNextLesson ? 'Ищем урок…' : 'След. урок'}
            </button>
          ) : null}
        </div>

        {selectedLessonLabel ? <p className={styles.inlineInfo}>{selectedLessonLabel}</p> : null}

        <div className={styles.field}>
          Способ отправки
          <div className={styles.radioGrid}>
            <label className={styles.radioCard}>
              <input
                type="radio"
                name="assignment-send-mode"
                checked={assignment.sendMode === 'MANUAL'}
                onChange={() =>
                  onChange({
                    ...assignment,
                    sendMode: 'MANUAL',
                  })
                }
                disabled={disabled}
              />
              <span className={styles.radioMeta}>
                <strong>Вручную</strong>
                <span>«Сохранить» оставит домашку невыданной, «Выдать» отправит сразу.</span>
              </span>
            </label>

            {canUseNextLesson ? (
              <label className={styles.radioCard}>
                <input
                  type="radio"
                  name="assignment-send-mode"
                  checked={assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'}
                  onChange={() => {
                    onChange({
                      ...assignment,
                      sendMode: 'AUTO_AFTER_LESSON_DONE',
                    });
                    if (!assignment.lessonId) {
                      void applyNextLesson();
                    }
                  }}
                  disabled={disabled}
                />
                <span className={styles.radioMeta}>
                  <strong>Авто после урока</strong>
                  <span>При сохранении домашка станет запланированной и уйдёт после завершения урока.</span>
                </span>
              </label>
            ) : null}
          </div>
        </div>

        {validationErrors.length > 0 ? (
          <div className={styles.validationBlock}>
            {validationErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <HomeworkBookOpenIcon size={15} />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Дополнительные действия</h2>
            <p className={styles.cardSubtitle}>Сохраните удачную домашку как шаблон или проверьте предпросмотр.</p>
          </div>
        </div>

        <div className={styles.actionsRow}>
          <button type="button" className={styles.previewButton} onClick={onOpenPreview}>
            <HomeworkPlayIcon size={12} />
            Предпросмотр
          </button>
        </div>

        <button
          type="button"
          className={styles.saveTemplateButton}
          onClick={onSaveAsTemplate}
          disabled={disabled || saveAsTemplateSubmitting}
        >
          <HomeworkBookmarkRegularIcon size={13} />
          {saveAsTemplateSubmitting ? 'Сохраняю шаблон…' : 'Сохранить как шаблон'}
        </button>

        <p className={styles.cardSubtitle}>
          Шаблон сохранит контент задания и ваши template-метки, чтобы использовать их позже повторно.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <HomeworkPaperPlaneIcon size={15} />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Что произойдёт дальше</h2>
            <p className={styles.cardSubtitle}>
              «Сохранить» оставит домашку в работе у преподавателя. «Выдать» сразу отправит ученику текущую версию.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
