import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkGroupListItem, Lesson } from '../../../../entities/types';
import { api } from '../../../../shared/api/client';
import { Checkbox } from '../../../../shared/ui/Checkbox';
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

type FutureLessonRef = Pick<Lesson, 'id' | 'startAt' | 'durationMinutes'>;

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
  const [futureLessons, setFutureLessons] = useState<FutureLessonRef[]>([]);

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

  const resolveFutureLessons = useCallback(async (studentId: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsResolvingNextLesson(true);

    try {
      const response = await api.listStudentLessons(studentId, {
        status: 'not_completed',
        sort: 'asc',
      });
      if (requestIdRef.current !== requestId) return [];

      const nowTs = Date.now();
      const nextLessons = response.items
        .filter((lesson) => {
          if (lesson.status === 'CANCELED') return false;
          const lessonTs = new Date(lesson.startAt).getTime();
          return Number.isFinite(lessonTs) && lessonTs > nowTs;
        })
        .map((lesson) => ({
          id: lesson.id,
          startAt: lesson.startAt,
          durationMinutes: lesson.durationMinutes,
        }));

      setFutureLessons(nextLessons);
      return nextLessons;
    } catch {
      if (requestIdRef.current !== requestId) return [];
      setFutureLessons([]);
      return [];
    } finally {
      if (requestIdRef.current === requestId) {
        setIsResolvingNextLesson(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!assignment.studentId) {
      setFutureLessons([]);
      return;
    }
    void resolveFutureLessons(assignment.studentId);
  }, [assignment.studentId, resolveFutureLessons]);

  const futureLessonOptions = useMemo(
    () =>
      futureLessons.map((lesson) => ({
        value: String(lesson.id),
        label: formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', { timeZone }),
        description:
          lesson.durationMinutes > 0
            ? `${lesson.durationMinutes} мин`
            : undefined,
      })),
    [futureLessons, timeZone],
  );

  const autoSendEnabled = assignment.sendMode === 'AUTO_AFTER_LESSON_DONE';
  const selectedLesson = useMemo(
    () => futureLessons.find((lesson) => lesson.id === assignment.lessonId) ?? null,
    [futureLessons, assignment.lessonId],
  );

  useEffect(() => {
    if (isResolvingNextLesson) return;
    if (assignment.sendMode !== 'AUTO_AFTER_LESSON_DONE') return;
    if (futureLessons.length === 0) {
      onChange({
        ...assignment,
        sendMode: 'MANUAL',
        lessonId: null,
      });
      return;
    }
    if (selectedLesson) return;
    const firstLesson = futureLessons[0];
    if (!firstLesson) return;
    onChange({
      ...assignment,
      lessonId: firstLesson.id,
      deadlineAt: firstLesson.startAt,
    });
  }, [assignment, futureLessons, isResolvingNextLesson, onChange, selectedLesson]);

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
            compact
            onChange={(nextValue) =>
              onChange({
                ...assignment,
                studentId: nextValue ? Number(nextValue) : null,
                sendMode: 'MANUAL',
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
            compact
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
        </div>

        {futureLessons.length > 0 ? (
          <div className={styles.autoSendBlock}>
            <label className={styles.autoSendToggle}>
              <Checkbox
                checked={autoSendEnabled}
                disabled={disabled || isResolvingNextLesson}
                onChange={(event) => {
                  const checked = event.target.checked;
                  if (!checked) {
                    onChange({
                      ...assignment,
                      sendMode: 'MANUAL',
                      lessonId: null,
                    });
                    return;
                  }

                  const lesson = selectedLesson ?? futureLessons[0] ?? null;
                  onChange({
                    ...assignment,
                    sendMode: 'AUTO_AFTER_LESSON_DONE',
                    lessonId: lesson?.id ?? null,
                    deadlineAt: lesson?.startAt ?? assignment.deadlineAt,
                  });
                }}
              />
              <span className={styles.autoSendMeta}>
                <strong>Отправить автоматически после урока</strong>
                <span>Домашка уйдёт ученику сразу после завершения выбранного урока.</span>
              </span>
            </label>

            {autoSendEnabled ? (
              <label className={styles.field}>
                Урок для авто-отправки
                <AssignmentSettingsSelect
                  value={assignment.lessonId ? String(assignment.lessonId) : ''}
                  options={futureLessonOptions}
                  placeholder={isResolvingNextLesson ? 'Загружаем уроки…' : 'Выберите урок'}
                  ariaLabel="Выбор урока для автоматической отправки домашнего задания"
                  disabled={disabled || isResolvingNextLesson || futureLessonOptions.length === 0}
                  compact
                  onChange={(nextValue) => {
                    const lesson = futureLessons.find((item) => String(item.id) === nextValue) ?? null;
                    onChange({
                      ...assignment,
                      sendMode: 'AUTO_AFTER_LESSON_DONE',
                      lessonId: lesson?.id ?? null,
                      deadlineAt: lesson?.startAt ?? assignment.deadlineAt,
                    });
                  }}
                />
                {selectedLesson ? (
                  <p className={styles.inlineInfo}>
                    Выдача сработает после урока {formatInTimeZone(selectedLesson.startAt, 'd MMM, HH:mm', { timeZone })}.
                  </p>
                ) : null}
              </label>
            ) : null}
          </div>
        ) : null}

        {validationErrors.length > 0 ? (
          <div className={styles.validationBlock}>
            {validationErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <span className={styles.previewIcon}>
            <HomeworkPlayIcon size={14} />
          </span>
          <h3>Предпросмотр</h3>
        </div>
        <p>Посмотрите, как домашнее задание будет выглядеть для ученика перед отправкой.</p>
        <button type="button" onClick={onOpenPreview} disabled={disabled}>
          <HomeworkPlayIcon size={12} />
          Открыть предпросмотр
        </button>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <HomeworkBookOpenIcon size={15} />
          </span>
          <div>
            <h2 className={styles.cardTitle}>Дополнительные действия</h2>
            <p className={styles.cardSubtitle}>Сохраните удачную домашку как шаблон, чтобы быстро использовать её повторно.</p>
          </div>
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
              «Сохранить черновик» оставит домашку в работе у преподавателя. «Выдать» сразу отправит ученику текущую версию.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
