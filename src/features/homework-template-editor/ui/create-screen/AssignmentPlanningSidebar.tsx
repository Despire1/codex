import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ru } from 'date-fns/locale';
import { Lesson } from '../../../../entities/types';
import { api } from '../../../../shared/api/client';
import { useTimeZone } from '../../../../shared/lib/timezoneContext';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import { AdaptivePopover } from '../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import {
  HomeworkCheckIcon,
  HomeworkChevronDownIcon,
  HomeworkRobotIcon,
  HomeworkUserCheckIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { HomeworkEditorAssignmentContext } from '../../model/types';
import {
  HOMEWORK_ATTEMPTS_DEFAULT,
  HOMEWORK_ATTEMPTS_MAX,
  HOMEWORK_ATTEMPTS_MIN,
  HOMEWORK_TIMER_DEFAULT_MINUTES,
  HOMEWORK_TIMER_MAX_MINUTES,
  HOMEWORK_TIMER_MIN_MINUTES,
  HomeworkTemplateQuizSettings,
  normalizeHomeworkAttemptsLimit,
  normalizeHomeworkTimerDurationMinutes,
} from '../../../../entities/homework-template/model/lib/quizSettings';
import { HomeworkQuizCapabilities } from '../../../../entities/homework-template/model/lib/quizProgress';
import {
  createQuickDeadlineValue,
  toLocalDateTimeValue,
  toUtcIsoFromLocal,
} from '../../../homework-assign/model/lib/assignmentStarter';
import controls from '../../../../shared/styles/controls.module.css';
import {
  AssignmentStudentOption,
  buildStudentInitials,
  resolveAssignmentStudentOptionAvatarColor,
  resolveAssignmentStudentOptionAvatarTextColor,
} from '../../model/lib/assignmentCreateScreen';
import styles from './AssignmentPlanningSidebar.module.css';

type FutureLessonRef = Pick<Lesson, 'id' | 'startAt' | 'durationMinutes'>;

interface AssignmentPlanningSidebarProps {
  surface?: 'card' | 'plain';
  assignment: HomeworkEditorAssignmentContext;
  assignmentTitle?: string;
  students: AssignmentStudentOption[];
  quizSettings: HomeworkTemplateQuizSettings;
  quizCapabilities: HomeworkQuizCapabilities;
  studentLocked?: boolean;
  studentRequired?: boolean;
  studentError?: string | null;
  lessonError?: string | null;
  scheduledError?: string | null;
  showCancelIssueAction?: boolean;
  cancelIssueSubmitting?: boolean;
  onChange: (next: HomeworkEditorAssignmentContext) => void;
  onQuizSettingsChange: (next: HomeworkTemplateQuizSettings) => void;
  onAlignTitle?: () => void;
  onCancelIssue?: () => void;
}

const findMismatchedStudentInTitle = (
  title: string,
  currentStudentId: number | null,
  students: AssignmentStudentOption[],
): AssignmentStudentOption | null => {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const haystack = trimmed.toLocaleLowerCase('ru-RU');
  for (const student of students) {
    if (currentStudentId !== null && student.id === currentStudentId) continue;
    const firstName = (student.name ?? '').trim().split(/\s+/)[0] ?? '';
    if (firstName.length < 3) continue;
    const stem = firstName.toLocaleLowerCase('ru-RU').slice(0, Math.max(3, firstName.length - 2));
    const stemPattern = new RegExp(
      `(^|[^a-zа-яё])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-zа-яё]{0,3}([^a-zа-яё]|$)`,
      'iu',
    );
    if (stemPattern.test(haystack)) return student;
  }
  return null;
};

export const AssignmentPlanningSidebar: FC<AssignmentPlanningSidebarProps> = ({
  surface = 'card',
  assignment,
  assignmentTitle = '',
  students,
  quizSettings,
  quizCapabilities,
  studentLocked = false,
  studentRequired = true,
  studentError = null,
  lessonError = null,
  scheduledError = null,
  showCancelIssueAction = false,
  cancelIssueSubmitting = false,
  onChange,
  onQuizSettingsChange,
  onAlignTitle,
  onCancelIssue,
}) => {
  const timeZone = useTimeZone();
  const requestIdRef = useRef(0);
  const [futureLessons, setFutureLessons] = useState<FutureLessonRef[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [isStudentSelectOpen, setStudentSelectOpen] = useState(false);
  const hasSelectedStudent = assignment.studentId !== null;

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === assignment.studentId) ?? null,
    [assignment.studentId, students],
  );
  const titleMismatchedStudent = useMemo(
    () => findMismatchedStudentInTitle(assignmentTitle, assignment.studentId, students),
    [assignment.studentId, assignmentTitle, students],
  );
  const isDeadlineInPast = useMemo(() => {
    if (!assignment.deadlineAt) return false;
    const ts = new Date(assignment.deadlineAt).getTime();
    return Number.isFinite(ts) && ts < Date.now();
  }, [assignment.deadlineAt]);
  const selectedStudentAvatarColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarColor(selectedStudent?.uiColor),
    [selectedStudent?.uiColor],
  );
  const selectedStudentAvatarTextColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarTextColor(selectedStudentAvatarColor),
    [selectedStudentAvatarColor],
  );

  const scheduledLocalValue = useMemo(() => {
    if (!assignment.scheduledFor) return '';
    return toLocalDateTimeValue(assignment.scheduledFor, timeZone);
  }, [assignment.scheduledFor, timeZone]);

  const deadlineLocalValue = useMemo(() => {
    if (!assignment.deadlineAt) return '';
    return toLocalDateTimeValue(assignment.deadlineAt, timeZone);
  }, [assignment.deadlineAt, timeZone]);
  const attemptsValue = quizSettings.attemptsLimit ?? HOMEWORK_ATTEMPTS_DEFAULT;
  const attemptsDisabled = !quizCapabilities.attemptsSupported || !quizSettings.autoCheckEnabled;
  const correctAnswersDisabled =
    !quizCapabilities.correctAnswersSupported || !quizSettings.autoCheckEnabled || attemptsValue > 1;
  const correctAnswersChecked = attemptsValue > 1 ? false : quizSettings.showCorrectAnswers;

  const resolveFutureLessons = useCallback(async (studentId: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingLessons(true);

    try {
      const response = await api.listStudentLessons(studentId, {
        status: 'not_completed',
        sort: 'asc',
      });
      if (requestIdRef.current !== requestId) return;

      const nowTs = Date.now();
      const nextLessons = response.items
        .filter((lesson) => lesson.status !== 'CANCELED')
        .filter((lesson) => {
          const lessonTs = new Date(lesson.startAt).getTime();
          return Number.isFinite(lessonTs) && lessonTs > nowTs;
        })
        .map((lesson) => ({
          id: lesson.id,
          startAt: lesson.startAt,
          durationMinutes: lesson.durationMinutes,
        }));
      setFutureLessons(nextLessons);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setFutureLessons([]);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingLessons(false);
      }
    }
  }, []);

  useEffect(() => {
    if (studentLocked) {
      setStudentSelectOpen(false);
    }
  }, [studentLocked]);

  useEffect(() => {
    if (!assignment.studentId) {
      setFutureLessons([]);
      return;
    }
    void resolveFutureLessons(assignment.studentId);
  }, [assignment.studentId, resolveFutureLessons]);

  useEffect(() => {
    if (assignment.sendMode !== 'AUTO_AFTER_LESSON_DONE') return;
    if (loadingLessons) return;
    if (!futureLessons.length) {
      onChange({
        ...assignment,
        sendMode: 'MANUAL',
        lessonId: null,
      });
      return;
    }
    if (futureLessons.some((lesson) => lesson.id === assignment.lessonId)) return;
    onChange({
      ...assignment,
      lessonId: futureLessons[0]?.id ?? null,
    });
  }, [assignment, futureLessons, loadingLessons, onChange]);

  const updateScheduledForPart = (part: 'date' | 'time', value: string) => {
    const [datePart = '', timePart = ''] = scheduledLocalValue.split('T');
    const nextDate = part === 'date' ? value : datePart;
    const nextTime = part === 'time' ? value : timePart;

    if (!nextDate || !nextTime) {
      onChange({
        ...assignment,
        scheduledFor: null,
      });
      return;
    }

    onChange({
      ...assignment,
      scheduledFor: toUtcIsoFromLocal(`${nextDate}T${nextTime}`, timeZone),
    });
  };

  const updateDeadlinePart = (part: 'date' | 'time', value: string) => {
    const [datePart = '', timePart = ''] = deadlineLocalValue.split('T');
    const nextDate = part === 'date' ? value : datePart;
    const nextTime = part === 'time' ? value : timePart;

    if (!nextDate || !nextTime) {
      onChange({
        ...assignment,
        deadlineAt: null,
      });
      return;
    }

    onChange({
      ...assignment,
      deadlineAt: toUtcIsoFromLocal(`${nextDate}T${nextTime}`, timeZone),
    });
  };

  const handleStudentChange = (studentId: number | null) => {
    onChange({
      ...assignment,
      studentId,
      lessonId: null,
      scheduledFor: null,
      deadlineAt: null,
      sendMode: 'MANUAL',
    });
    setStudentSelectOpen(false);
  };

  return (
    <aside className={styles.sidebar}>
      <section className={`${styles.card} ${surface === 'plain' ? styles.cardPlain : ''}`}>
        <label className={styles.label}>
          Ученик {studentRequired ? <span className={styles.required}>*</span> : null}
        </label>
        <AdaptivePopover
          isOpen={isStudentSelectOpen && !studentLocked}
          onClose={() => setStudentSelectOpen(false)}
          side="bottom"
          align="start"
          offset={10}
          matchTriggerWidth
          rootClassName={styles.studentSelectPopoverRoot}
          triggerClassName={styles.studentSelectPopoverTrigger}
          className={styles.studentSelectPopover}
          trigger={
            <button
              type="button"
              className={`${styles.studentSelect} ${studentError ? styles.invalid : ''} ${isStudentSelectOpen ? styles.studentSelectOpen : ''}`}
              data-validation-path="assignment.studentId"
              onClick={() => {
                if (studentLocked) return;
                setStudentSelectOpen((prev) => !prev);
              }}
              aria-haspopup="listbox"
              aria-expanded={isStudentSelectOpen}
              aria-invalid={Boolean(studentError)}
              disabled={studentLocked}
            >
              <div
                className={styles.studentAvatar}
                style={{ background: selectedStudentAvatarColor, color: selectedStudentAvatarTextColor }}
              >
                {buildStudentInitials(selectedStudent?.name ?? 'Ученик')}
              </div>
              <div className={styles.studentMeta}>
                <strong>{selectedStudent?.name ?? 'Выберите ученика'}</strong>
                {selectedStudent ? <span>{selectedStudent.level?.trim() || 'Уровень не указан'}</span> : null}
              </div>
              <HomeworkChevronDownIcon
                size={12}
                className={`${styles.studentChevron} ${isStudentSelectOpen ? styles.studentChevronOpen : ''}`}
              />
            </button>
          }
        >
          <div className={styles.studentOptionsList} role="listbox" aria-label="Выбор ученика">
            <button
              type="button"
              role="option"
              aria-selected={!hasSelectedStudent}
              className={`${styles.studentOption} ${!hasSelectedStudent ? styles.studentOptionSelected : ''}`}
              onClick={() => handleStudentChange(null)}
            >
              <span className={styles.studentOptionMeta}>
                <span className={styles.studentOptionLabel}>Не выбрано</span>
              </span>
              <HomeworkCheckIcon
                size={11}
                className={`${styles.studentOptionCheck} ${!hasSelectedStudent ? styles.studentOptionCheckVisible : ''}`}
              />
            </button>
            {students.map((student) => {
              const isSelected = student.id === assignment.studentId;
              const avatarColor = resolveAssignmentStudentOptionAvatarColor(student.uiColor);
              const avatarTextColor = resolveAssignmentStudentOptionAvatarTextColor(avatarColor);
              return (
                <button
                  key={student.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${styles.studentOption} ${isSelected ? styles.studentOptionSelected : ''}`}
                  onClick={() => handleStudentChange(student.id)}
                >
                  <span
                    className={styles.studentOptionAvatar}
                    style={{ background: avatarColor, color: avatarTextColor }}
                  >
                    {buildStudentInitials(student.name)}
                  </span>
                  <span className={styles.studentOptionMeta}>
                    <span className={styles.studentOptionLabel}>{student.name}</span>
                    <span className={styles.studentOptionDescription}>
                      {student.level?.trim() || 'Уровень не указан'}
                    </span>
                  </span>
                  <HomeworkCheckIcon
                    size={11}
                    className={`${styles.studentOptionCheck} ${isSelected ? styles.studentOptionCheckVisible : ''}`}
                  />
                </button>
              );
            })}
          </div>
        </AdaptivePopover>
        {studentError ? <p className={styles.error}>{studentError}</p> : null}

        {titleMismatchedStudent ? (
          <div className={styles.titleMismatch}>
            <span>
              Имя задания упоминает <strong>{titleMismatchedStudent.name}</strong>, но получатель —{' '}
              <strong>{selectedStudent?.name ?? 'не выбран'}</strong>. Имя задания и адресат не совпадают.
            </span>
            {onAlignTitle ? (
              <button type="button" className={styles.titleMismatchAction} onClick={onAlignTitle}>
                Убрать имя из названия
              </button>
            ) : null}
          </div>
        ) : null}

        {!hasSelectedStudent && !studentRequired ? (
          <p className={styles.helperText}>Без ученика задание сохранится как шаблон в библиотеке.</p>
        ) : null}

        {hasSelectedStudent ? <div className={styles.divider} /> : null}

        {hasSelectedStudent ? (
          <>
            <label className={styles.label}>Когда отправить</label>
            <div className={styles.optionList}>
              <label
                className={`${styles.optionCard} ${assignment.sendMode === 'MANUAL' ? styles.optionCardActive : ''}`}
              >
                <input
                  type="radio"
                  name="assignment-send-mode"
                  checked={assignment.sendMode === 'MANUAL'}
                  onChange={() =>
                    onChange({
                      ...assignment,
                      sendMode: 'MANUAL',
                      scheduledFor: null,
                      lessonId: null,
                    })
                  }
                />
                <div>
                  <strong>Сейчас</strong>
                  <span>Отправить сразу после создания</span>
                </div>
              </label>

              <label
                className={`${styles.optionCard} ${assignment.sendMode === 'AUTO_AFTER_LESSON_DONE' ? styles.optionCardActive : ''}`}
              >
                <input
                  type="radio"
                  name="assignment-send-mode"
                  checked={assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'}
                  onChange={() =>
                    onChange({
                      ...assignment,
                      sendMode: 'AUTO_AFTER_LESSON_DONE',
                      scheduledFor: null,
                      lessonId: futureLessons[0]?.id ?? null,
                    })
                  }
                />
                <div className={styles.optionContent}>
                  <strong>После урока</strong>
                  <span>Автоматически после занятия</span>
                  {assignment.sendMode === 'AUTO_AFTER_LESSON_DONE' ? (
                    <select
                      className={`${styles.selectField} ${lessonError ? styles.invalidField : ''}`}
                      value={assignment.lessonId ?? ''}
                      data-validation-path="assignment.lessonId"
                      onChange={(event) =>
                        onChange({
                          ...assignment,
                          lessonId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    >
                      {loadingLessons ? <option value="">Загружаем уроки…</option> : null}
                      {!loadingLessons && futureLessons.length === 0 ? (
                        <option value="">Нет ближайших уроков</option>
                      ) : null}
                      {futureLessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', { timeZone, locale: ru })}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </label>

              <label
                className={`${styles.optionCard} ${assignment.sendMode === 'SCHEDULED' ? styles.optionCardActive : ''}`}
              >
                <input
                  type="radio"
                  name="assignment-send-mode"
                  checked={assignment.sendMode === 'SCHEDULED'}
                  onChange={() =>
                    onChange({
                      ...assignment,
                      sendMode: 'SCHEDULED',
                      lessonId: null,
                      scheduledFor:
                        assignment.scheduledFor ?? toUtcIsoFromLocal(createQuickDeadlineValue(1, timeZone), timeZone),
                    })
                  }
                />
                <div className={styles.optionContent}>
                  <strong>Запланировать</strong>
                  <div className={styles.dateTimeGrid} data-validation-path="assignment.scheduledFor">
                    <input
                      type="date"
                      className={`${styles.dateInput} ${scheduledError ? styles.invalidField : ''}`}
                      value={scheduledLocalValue.split('T')[0] ?? ''}
                      onChange={(event) => updateScheduledForPart('date', event.target.value)}
                    />
                    <input
                      type="time"
                      className={`${styles.dateInput} ${scheduledError ? styles.invalidField : ''}`}
                      value={scheduledLocalValue.split('T')[1] ?? ''}
                      onChange={(event) => updateScheduledForPart('time', event.target.value)}
                    />
                  </div>
                </div>
              </label>
            </div>
            {lessonError ? <p className={styles.error}>{lessonError}</p> : null}
            {scheduledError ? <p className={styles.error}>{scheduledError}</p> : null}

            <div className={styles.divider} />

            <label className={styles.label}>Дедлайн</label>
            <div className={styles.dateTimeGrid}>
              <input
                type="date"
                className={`${styles.dateInput} ${isDeadlineInPast ? styles.invalidField : ''}`}
                value={deadlineLocalValue.split('T')[0] ?? ''}
                aria-invalid={isDeadlineInPast}
                onChange={(event) => updateDeadlinePart('date', event.target.value)}
              />
              <input
                type="time"
                className={`${styles.dateInput} ${isDeadlineInPast ? styles.invalidField : ''}`}
                value={deadlineLocalValue.split('T')[1] ?? ''}
                aria-invalid={isDeadlineInPast}
                onChange={(event) => updateDeadlinePart('time', event.target.value)}
              />
            </div>
            {isDeadlineInPast ? (
              <p className={styles.deadlineWarning}>
                Дедлайн уже прошёл. Установите дату в будущем — иначе ученик увидит просроченное задание.
              </p>
            ) : null}
            <div className={styles.quickActions}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...assignment,
                    deadlineAt: toUtcIsoFromLocal(createQuickDeadlineValue(1, timeZone), timeZone),
                  })
                }
              >
                Завтра
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...assignment,
                    deadlineAt: toUtcIsoFromLocal(createQuickDeadlineValue(3, timeZone), timeZone),
                  })
                }
              >
                Через 3 дня
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...assignment,
                    deadlineAt: toUtcIsoFromLocal(createQuickDeadlineValue(7, timeZone), timeZone),
                  })
                }
              >
                Неделя
              </button>
            </div>

            <div className={styles.divider} />
          </>
        ) : null}

        <div className={styles.gradingSection}>
          <label className={styles.label}>Режим оценки</label>
          <div className={styles.optionList}>
            <label
              className={`${styles.gradeCard} ${quizSettings.autoCheckEnabled ? styles.optionCardActive : ''}`}
              title="Система сама сверит ответы с правильными. Подходит для choice / fill-in / matching. Открытые ответы и аудио всё равно потребуют ручной проверки."
            >
              <div className={`${styles.gradeIcon} ${styles.gradeIconAuto}`}>
                <HomeworkRobotIcon size={14} />
              </div>
              <div>
                <strong>Автопроверка</strong>
              </div>
              <input
                type="radio"
                name="assignment-grading-mode"
                checked={quizSettings.autoCheckEnabled}
                onChange={() => onQuizSettingsChange({ ...quizSettings, autoCheckEnabled: true })}
              />
            </label>

            <label
              className={`${styles.gradeCard} ${!quizSettings.autoCheckEnabled ? styles.optionCardActive : ''}`}
              title="Вы сами читаете каждый ответ и ставите оценку."
            >
              <div className={`${styles.gradeIcon} ${styles.gradeIconManual}`}>
                <HomeworkUserCheckIcon size={14} />
              </div>
              <div>
                <strong>Вручную</strong>
              </div>
              <input
                type="radio"
                name="assignment-grading-mode"
                checked={!quizSettings.autoCheckEnabled}
                onChange={() => onQuizSettingsChange({ ...quizSettings, autoCheckEnabled: false })}
              />
            </label>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.field}>
          <label className={styles.label}>Таймер попытки</label>
          <label className={styles.toggleRow}>
            <span className={styles.settingMeta}>
              <strong>Ограничить время</strong>
              <span>Стартует после нажатия «Начать».</span>
            </span>
            <span className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={quizSettings.timerEnabled}
                onChange={(event) =>
                  onQuizSettingsChange({
                    ...quizSettings,
                    timerEnabled: event.target.checked,
                    timerDurationMinutes: event.target.checked
                      ? (quizSettings.timerDurationMinutes ?? HOMEWORK_TIMER_DEFAULT_MINUTES)
                      : quizSettings.timerDurationMinutes,
                  })
                }
              />
              <span className={`${controls.slider} ${styles.switchSlider}`} />
            </span>
          </label>
          {quizSettings.timerEnabled ? (
            <div className={styles.inlineInputRow}>
              <input
                type="number"
                min={HOMEWORK_TIMER_MIN_MINUTES}
                max={HOMEWORK_TIMER_MAX_MINUTES}
                value={quizSettings.timerDurationMinutes ?? ''}
                onChange={(event) =>
                  onQuizSettingsChange({
                    ...quizSettings,
                    timerDurationMinutes: normalizeHomeworkTimerDurationMinutes(event.target.value),
                  })
                }
              />
              <span>минут</span>
            </div>
          ) : null}
        </div>

        <div className={styles.divider} />

        <div className={styles.field}>
          <label className={styles.label}>Автопроверяемый результат</label>
          <div className={styles.settingGroup}>
            <label className={styles.settingRow}>
              <span className={styles.settingMeta}>
                <strong>Количество попыток</strong>
                <span>Только для автопроверяемого теста.</span>
              </span>
              <div className={styles.inlineInputRow}>
                <input
                  type="number"
                  min={HOMEWORK_ATTEMPTS_MIN}
                  max={HOMEWORK_ATTEMPTS_MAX}
                  value={attemptsValue}
                  disabled={attemptsDisabled}
                  onChange={(event) => {
                    const nextAttemptsLimit =
                      normalizeHomeworkAttemptsLimit(event.target.value) ?? HOMEWORK_ATTEMPTS_DEFAULT;
                    onQuizSettingsChange({
                      ...quizSettings,
                      attemptsLimit: nextAttemptsLimit,
                      showCorrectAnswers: nextAttemptsLimit > 1 ? false : quizSettings.showCorrectAnswers,
                    });
                  }}
                />
                <span>шт</span>
              </div>
            </label>

            <label className={styles.settingRow}>
              <span className={styles.settingMeta}>
                <strong>Показывать правильные ответы</strong>
                <span>После финального результата.</span>
              </span>
              <span className={`${controls.switch} ${styles.switchControl}`}>
                <input
                  type="checkbox"
                  checked={correctAnswersChecked}
                  disabled={correctAnswersDisabled}
                  onChange={(event) =>
                    onQuizSettingsChange({
                      ...quizSettings,
                      showCorrectAnswers: event.target.checked,
                    })
                  }
                />
                <span className={`${controls.slider} ${styles.switchSlider}`} />
              </span>
            </label>
          </div>
        </div>

        {showCancelIssueAction ? (
          <>
            <div className={styles.divider} />
            <button
              type="button"
              className={styles.cancelIssueButton}
              onClick={onCancelIssue}
              disabled={cancelIssueSubmitting}
            >
              {cancelIssueSubmitting ? 'Отменяем выдачу…' : 'Отменить выдачу'}
            </button>
          </>
        ) : null}
      </section>
    </aside>
  );
};
