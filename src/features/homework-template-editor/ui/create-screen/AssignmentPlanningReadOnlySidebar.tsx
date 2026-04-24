import { FC, useMemo } from 'react';
import { ru } from 'date-fns/locale';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import { useTimeZone } from '../../../../shared/lib/timezoneContext';
import {
  HomeworkCalendarDayIcon,
  HomeworkPaperPlaneIcon,
  HomeworkRobotIcon,
  HomeworkUserCheckIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import type { HomeworkTemplateQuizSettings } from '../../../../entities/homework-template/model/lib/quizSettings';
import type { HomeworkEditorAssignmentContext } from '../../model/types';
import {
  AssignmentStudentOption,
  buildStudentInitials,
  resolveAssignmentStudentOptionAvatarColor,
  resolveAssignmentStudentOptionAvatarTextColor,
} from '../../model/lib/assignmentCreateScreen';
import type { HomeworkQuizCapabilities } from '../../../../entities/homework-template/model/lib/quizProgress';
import styles from './AssignmentPlanningReadOnlySidebar.module.css';

interface AssignmentPlanningReadOnlySidebarProps {
  assignment: HomeworkEditorAssignmentContext;
  students: AssignmentStudentOption[];
  quizSettings: HomeworkTemplateQuizSettings;
  quizCapabilities: HomeworkQuizCapabilities;
}

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return 'Не указано';
  try {
    return formatInTimeZone(value, 'd MMMM yyyy, HH:mm', { timeZone, locale: ru });
  } catch {
    return 'Не указано';
  }
};

const resolveSendModeLabel = (assignment: HomeworkEditorAssignmentContext, timeZone: string) => {
  if (assignment.sendMode === 'AUTO_AFTER_LESSON_DONE') {
    return 'После урока';
  }

  if (assignment.sendMode === 'SCHEDULED') {
    return assignment.scheduledFor
      ? `Запланировано · ${formatDateTime(assignment.scheduledFor, timeZone)}`
      : 'Запланировано';
  }

  return 'Сразу после выдачи';
};

export const AssignmentPlanningReadOnlySidebar: FC<AssignmentPlanningReadOnlySidebarProps> = ({
  assignment,
  students,
  quizSettings,
  quizCapabilities: _quizCapabilities,
}) => {
  const timeZone = useTimeZone();
  const selectedStudent = useMemo(
    () => students.find((student) => student.id === assignment.studentId) ?? null,
    [assignment.studentId, students],
  );
  const avatarColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarColor(selectedStudent?.uiColor),
    [selectedStudent?.uiColor],
  );
  const avatarTextColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarTextColor(avatarColor),
    [avatarColor],
  );
  const hasSelectedStudent = assignment.studentId !== null;

  return (
    <aside className={styles.sidebar}>
      <section className={styles.card}>
        <div className={styles.field}>
          <span className={styles.label}>Ученик</span>
          <div className={styles.studentCard}>
            <span
              className={styles.studentAvatar}
              style={{ background: avatarColor, color: avatarTextColor }}
            >
              {buildStudentInitials(selectedStudent?.name ?? 'Не выбран')}
            </span>
            <span className={styles.studentMeta}>
              <strong>{selectedStudent?.name ?? 'Не выбран'}</strong>
              <span>{selectedStudent?.level?.trim() || 'Без уровня'}</span>
            </span>
          </div>
        </div>

        {hasSelectedStudent ? (
          <>
            <div className={styles.divider} />

            <div className={styles.field}>
              <span className={styles.label}>Когда отправить</span>
              <div className={styles.infoCard}>
                <span className={styles.infoIcon}>
                  <HomeworkPaperPlaneIcon size={14} />
                </span>
                <div className={styles.infoContent}>
                  <strong>{resolveSendModeLabel(assignment, timeZone)}</strong>
                  <span>Параметры выдачи отображаются без редактирования.</span>
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Дедлайн</span>
              <div className={styles.infoCard}>
                <span className={styles.infoIcon}>
                  <HomeworkCalendarDayIcon size={14} />
                </span>
                <div className={styles.infoContent}>
                  <strong>{formatDateTime(assignment.deadlineAt, timeZone)}</strong>
                  <span>Срок, который увидит ученик в своей домашке.</span>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div className={styles.divider} />

        <div className={styles.field}>
          <span className={styles.label}>Режим оценки</span>
          <div className={styles.modeList}>
            <div className={`${styles.modeCard} ${quizSettings.autoCheckEnabled ? styles.modeCardActive : ''}`}>
              <span className={`${styles.modeIcon} ${styles.modeIconAuto}`}>
                <HomeworkRobotIcon size={14} />
              </span>
              <span className={styles.modeCopy}>
                <strong>Автопроверка</strong>
                <span>Подходит для тестовых вопросов</span>
              </span>
            </div>

            <div className={`${styles.modeCard} ${!quizSettings.autoCheckEnabled ? styles.modeCardActive : ''}`}>
              <span className={`${styles.modeIcon} ${styles.modeIconManual}`}>
                <HomeworkUserCheckIcon size={14} />
              </span>
              <span className={styles.modeCopy}>
                <strong>Вручную</strong>
                <span>Учитель проверяет ответы сам</span>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Таймер попытки</span>
          <div className={styles.infoCard}>
            <span className={styles.infoIcon}>
              <HomeworkCalendarDayIcon size={14} />
            </span>
            <div className={styles.infoContent}>
              <strong>
                {quizSettings.timerEnabled
                  ? `${quizSettings.timerDurationMinutes ? `${quizSettings.timerDurationMinutes} мин` : 'Включен'}`
                  : 'Выключен'}
              </strong>
              <span>Таймер запускается, когда ученик начинает попытку.</span>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Автопроверяемый результат</span>
            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>
                <HomeworkRobotIcon size={14} />
              </span>
              <div className={styles.infoContent}>
                <strong>{quizSettings.attemptsLimit === null ? '∞ попыток' : `${quizSettings.attemptsLimit} попыток`}</strong>
                <span>
                  {quizSettings.showCorrectAnswers
                    ? 'Правильные ответы показываются после финального результата.'
                  : 'Правильные ответы скрыты.'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
};
