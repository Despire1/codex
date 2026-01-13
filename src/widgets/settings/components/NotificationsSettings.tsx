import { FC } from 'react';
import { Teacher } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

interface NotificationsSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
}

const lessonReminderOptions = [5, 10, 15, 30, 60, 120];
const unpaidFrequencyOptions = [
  { value: 'daily', label: '1 раз в день' },
  { value: 'every_two_days', label: '1 раз в 2 дня' },
  { value: 'weekly', label: '1 раз в неделю' },
];

export const NotificationsSettings: FC<NotificationsSettingsProps> = ({ teacher, onChange }) => {
  const studentSectionDisabled = !teacher.studentNotificationsEnabled;
  const studentPaymentRemindersDisabled = true;

  return (
    <div className={styles.moduleStack}>
      <div className={styles.sectionTitle}>Мне</div>
      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Напоминания о предстоящем уроке</div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.lessonReminderEnabled}
              onChange={(event) => onChange({ lessonReminderEnabled: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
        <div className={styles.inlineField}>
          <div className={styles.inlineLabel}>За сколько минут до урока</div>
          <select
            className={controls.input}
            value={teacher.lessonReminderMinutes}
            onChange={(event) => onChange({ lessonReminderMinutes: Number(event.target.value) })}
            disabled={!teacher.lessonReminderEnabled}
          >
            {lessonReminderOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} минут
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Напоминания о неоплаченных занятиях</div>
            <div className={styles.helperText}>
              Учитываются только завершенные и неоплаченные занятия.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.unpaidReminderEnabled}
              onChange={(event) => onChange({ unpaidReminderEnabled: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
        <div className={styles.inlineField}>
          <div className={styles.inlineLabel}>Как часто</div>
          <select
            className={controls.input}
            value={teacher.unpaidReminderFrequency}
            onChange={(event) => onChange({ unpaidReminderFrequency: event.target.value as Teacher['unpaidReminderFrequency'] })}
            disabled={!teacher.unpaidReminderEnabled}
          >
            {unpaidFrequencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.inlineField}>
          <div className={styles.inlineLabel}>Время отправки</div>
          <input
            className={controls.input}
            type="time"
            value={teacher.unpaidReminderTime}
            onChange={(event) => onChange({ unpaidReminderTime: event.target.value })}
            disabled={!teacher.unpaidReminderEnabled}
          />
        </div>
      </div>

      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Сводка на сегодня</div>
            <div className={styles.helperText}>
              Утром приходит список занятий на день и неоплаченные занятия за прошлые дни.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.dailySummaryEnabled}
              onChange={(event) => onChange({ dailySummaryEnabled: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
        <div className={styles.inlineField}>
          <div className={styles.inlineLabel}>Время отправки</div>
          <input
            className={controls.input}
            type="time"
            value={teacher.dailySummaryTime}
            onChange={(event) => onChange({ dailySummaryTime: event.target.value })}
            disabled={!teacher.dailySummaryEnabled}
          />
        </div>
      </div>

      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Сводка на завтра</div>
            <div className={styles.helperText}>
              Вечером показывает завтрашние занятия. По умолчанию — 20:00.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.tomorrowSummaryEnabled}
              onChange={(event) => onChange({ tomorrowSummaryEnabled: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
        <div className={styles.inlineField}>
          <div className={styles.inlineLabel}>Время отправки</div>
          <input
            className={controls.input}
            type="time"
            value={teacher.tomorrowSummaryTime}
            onChange={(event) => onChange({ tomorrowSummaryTime: event.target.value })}
            disabled={!teacher.tomorrowSummaryEnabled}
          />
        </div>
      </div>

      <div className={styles.sectionTitle}>Ученику</div>
      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Напоминания ученикам о занятиях</div>
            <div className={styles.helperText}>
              При выключении автоматические напоминания не будут отправляться ученикам.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.studentNotificationsEnabled}
              onChange={(event) => onChange({ studentNotificationsEnabled: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
      </div>
      <div
        className={`${styles.sectionBlock} ${studentSectionDisabled || studentPaymentRemindersDisabled ? styles.disabledSection : ''}`}
      >
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Автоматические напоминания ученику об оплате</div>
            <div className={styles.helperText}>Скоро будет доступно.</div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.studentPaymentRemindersEnabled}
              onChange={(event) => onChange({ studentPaymentRemindersEnabled: event.target.checked })}
              disabled={studentSectionDisabled || studentPaymentRemindersDisabled}
            />
            <span className={controls.slider} />
          </label>
        </div>
      </div>
    </div>
  );
};
