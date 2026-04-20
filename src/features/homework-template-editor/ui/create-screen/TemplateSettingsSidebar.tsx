import { CSSProperties, FC } from 'react';
import {
  HOMEWORK_ATTEMPTS_DEFAULT,
  HOMEWORK_ATTEMPTS_MAX,
  HOMEWORK_ATTEMPTS_MIN,
  HOMEWORK_TIMER_DEFAULT_MINUTES,
  HOMEWORK_TIMER_MAX_MINUTES,
  HOMEWORK_TIMER_MIN_MINUTES,
  normalizeHomeworkAttemptsLimit,
  normalizeHomeworkTimerDurationMinutes,
} from '../../../../entities/homework-template/model/lib/quizSettings';
import { HomeworkQuizCapabilities } from '../../../../entities/homework-template/model/lib/quizProgress';
import {
  TemplateCreateStats,
  TemplateQuizSettings,
} from '../../model/lib/createTemplateScreen';
import {
  HomeworkCheckIcon,
  HomeworkPlayIcon,
  HomeworkRobotIcon,
  HomeworkSlidersIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import controls from '../../../../shared/styles/controls.module.css';
import styles from './TemplateSettingsSidebar.module.css';

interface TemplateSettingsSidebarProps {
  settings: TemplateQuizSettings;
  capabilities: HomeworkQuizCapabilities;
  stats: TemplateCreateStats;
  validationErrors: string[];
  validationWarnings: string[];
  onOpenPreview: () => void;
  onSettingsChange: (next: TemplateQuizSettings) => void;
}

export const TemplateSettingsSidebar: FC<TemplateSettingsSidebarProps> = ({
  settings,
  capabilities,
  stats,
  validationErrors,
  validationWarnings,
  onOpenPreview,
  onSettingsChange,
}) => {
  const attemptsValue = settings.attemptsLimit ?? HOMEWORK_ATTEMPTS_DEFAULT;
  const attemptsDisabled = !capabilities.attemptsSupported || !settings.autoCheckEnabled;
  const correctAnswersDisabled =
    !capabilities.correctAnswersSupported || !settings.autoCheckEnabled || attemptsValue > 1;
  const correctAnswersChecked = attemptsValue > 1 ? false : settings.showCorrectAnswers;

  return (
    <div className={styles.sidebar}>
      <section className={styles.settingsCard}>
        <div className={styles.settingsHeader}>
          <span className={styles.settingsIcon}>
            <HomeworkSlidersIcon size={15} />
          </span>
          <h2 className={styles.settingsTitle}>Настройки</h2>
        </div>

        <div className={styles.settingsGroup}>
          <h3>Автопроверка</h3>
          <label className={styles.toggleRow}>
            <span className={styles.toggleMeta}>
              <span className={styles.toggleMetaIcon}>
                <HomeworkRobotIcon size={13} />
              </span>
              <span>
                <strong>Включить</strong>
                <small>Автоматическая оценка</small>
              </span>
            </span>
            <span className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={settings.autoCheckEnabled}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    autoCheckEnabled: event.target.checked,
                  })
                }
              />
              <span className={`${controls.slider} ${styles.switchSlider}`} />
            </span>
          </label>
        </div>

        <div className={styles.settingsGroup}>
          <h3>Проходной балл</h3>
          <div className={styles.rangeRow}>
            <input
              type="range"
              className={styles.passingScoreRange}
              min={0}
              max={100}
              value={settings.passingScorePercent}
              style={
                {
                  '--range-progress': `${settings.passingScorePercent}%`,
                } as CSSProperties
              }
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  passingScorePercent: Number(event.target.value),
                })
              }
            />
            <span className={styles.rangeValue}>{settings.passingScorePercent}%</span>
          </div>
          <p>Минимальный балл для успешного прохождения</p>
        </div>

        <div className={styles.settingsGroup}>
          <h3>Попытки</h3>
          <div className={styles.numberInputRow}>
            <input
              type="number"
              min={HOMEWORK_ATTEMPTS_MIN}
              max={HOMEWORK_ATTEMPTS_MAX}
              value={attemptsValue}
              disabled={attemptsDisabled}
              onChange={(event) => {
                const nextAttemptsLimit = normalizeHomeworkAttemptsLimit(event.target.value) ?? HOMEWORK_ATTEMPTS_DEFAULT;
                onSettingsChange({
                  ...settings,
                  attemptsLimit: nextAttemptsLimit,
                  showCorrectAnswers: nextAttemptsLimit > 1 ? false : settings.showCorrectAnswers,
                });
              }}
            />
            <span>попыток</span>
          </div>
        </div>

        <label className={styles.toggleRowPlain}>
          <span>
            <strong>Показывать правильные ответы</strong>
            <small>После финального результата</small>
          </span>
          <span className={`${controls.switch} ${styles.switchControl}`}>
            <input
              type="checkbox"
              checked={correctAnswersChecked}
              disabled={correctAnswersDisabled}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  showCorrectAnswers: event.target.checked,
                })
              }
            />
            <span className={`${controls.slider} ${styles.switchSlider}`} />
          </span>
        </label>
        {correctAnswersDisabled ? (
          <p className={styles.settingHint}>
            {!capabilities.correctAnswersSupported
              ? 'Показ правильных ответов доступен только для полностью автопроверяемого теста.'
              : !settings.autoCheckEnabled
                ? 'Сначала включите автопроверку.'
                : 'При нескольких попытках правильные ответы скрыты автоматически.'}
          </p>
        ) : null}

        <label className={styles.toggleRowPlain}>
          <span>
            <strong>Перемешивать вопросы</strong>
            <small>Случайный порядок</small>
          </span>
          <span className={`${controls.switch} ${styles.switchControl}`}>
            <input
              type="checkbox"
              checked={settings.shuffleQuestions}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  shuffleQuestions: event.target.checked,
                })
              }
            />
            <span className={`${controls.slider} ${styles.switchSlider}`} />
          </span>
        </label>

        <label className={styles.toggleRowPlain}>
          <span>
            <strong>Таймер</strong>
            <small>Ограничение по времени</small>
          </span>
          <span className={`${controls.switch} ${styles.switchControl}`}>
            <input
              type="checkbox"
              checked={settings.timerEnabled}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  timerEnabled: event.target.checked,
                  timerDurationMinutes: event.target.checked
                    ? settings.timerDurationMinutes ?? HOMEWORK_TIMER_DEFAULT_MINUTES
                  : settings.timerDurationMinutes,
                })
              }
            />
            <span className={`${controls.slider} ${styles.switchSlider}`} />
          </span>
        </label>

        {settings.timerEnabled ? (
          <div className={styles.timerControls}>
            <label className={styles.timerLabel} htmlFor="template-timer-duration-minutes">
              Время на выполнение
            </label>
            <div className={styles.timerInputRow}>
              <input
                id="template-timer-duration-minutes"
                type="number"
                inputMode="numeric"
                min={HOMEWORK_TIMER_MIN_MINUTES}
                max={HOMEWORK_TIMER_MAX_MINUTES}
                value={settings.timerDurationMinutes ?? ''}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    timerDurationMinutes: normalizeHomeworkTimerDurationMinutes(event.target.value),
                  })
                }
              />
              <span>мин</span>
            </div>
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
        <p>Посмотрите, как задание будет выглядеть для ученика</p>
        <button type="button" onClick={onOpenPreview}>
          <HomeworkPlayIcon size={12} />
          Открыть предпросмотр
        </button>
      </section>

      <section className={styles.statsCard}>
        <h3>Статистика домашнего задания</h3>
        <div className={styles.statsList}>
          <div>
            <span>Всего вопросов</span>
            <strong>{stats.questionCount}</strong>
          </div>
          <div>
            <span>Максимум баллов</span>
            <strong>{stats.totalPoints}</strong>
          </div>
          <div>
            <span>Время выполнения</span>
            <strong>~{stats.estimatedMinutes} мин</strong>
          </div>
          <div>
            <span>Автопроверка</span>
            {stats.autoCheckEnabled ? (
              <strong className={styles.okBadge}>
                <HomeworkCheckIcon size={10} /> Включена
              </strong>
            ) : (
              <strong className={styles.mutedBadge}>Отключена</strong>
            )}
          </div>
        </div>

        {validationErrors.length > 0 ? (
          <div className={styles.errorBlock}>
            {validationErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        {validationWarnings.length > 0 ? (
          <div className={styles.warningBlock}>
            {validationWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};
