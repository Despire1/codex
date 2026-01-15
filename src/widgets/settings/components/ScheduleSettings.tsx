import { FC } from 'react';
import { Teacher } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

interface ScheduleSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  onComingSoonClick: () => void;
}

export const ScheduleSettings: FC<ScheduleSettingsProps> = ({ teacher, onChange, onComingSoonClick }) => {
  return (
    <div className={styles.moduleStack}>
      <div className={styles.sectionBlock}>
        <div className={styles.label}>Длительность урока по умолчанию (мин)</div>
        <input
          className={controls.input}
          type="number"
          min={15}
          max={240}
          step={5}
          value={teacher.defaultLessonDuration}
          onChange={(event) => {
            const numeric = Number(event.target.value);
            if (!Number.isFinite(numeric)) return;
            const clamped = Math.min(Math.max(Math.round(numeric), 15), 240);
            onChange({ defaultLessonDuration: clamped });
          }}
        />
        <div className={styles.helperText}>Применяется при создании новых уроков.</div>
      </div>
      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Автоматически отмечать занятия как проведённые</div>
            <div className={styles.helperText}>
              Если выключено, занятия нужно подтверждать вручную. Автосписание и напоминания об оплате начнут работать
              только после подтверждения занятия.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.autoConfirmLessons}
              onChange={(event) => onChange({ autoConfirmLessons: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
      </div>
      <div className={styles.comingSoonGroup}>
        <div className={styles.comingSoonHeader}>Дополнительные настройки расписания</div>
        <div className={styles.comingSoonRow} onClick={onComingSoonClick} role="button" aria-disabled="true">
          <div>
            <div className={styles.label}>Перерыв между уроками (мин)</div>
            <div className={styles.helperText}>Будет доступно в следующих обновлениях.</div>
          </div>
          <span className={styles.comingSoonBadge}>Скоро</span>
        </div>
        <div className={styles.comingSoonRow} onClick={onComingSoonClick} role="button" aria-disabled="true">
          <div>
            <div className={styles.label}>Рабочие дни недели</div>
            <div className={styles.helperText}>Будет доступно в следующих обновлениях.</div>
          </div>
          <span className={styles.comingSoonBadge}>Скоро</span>
        </div>
        <div className={styles.comingSoonRow} onClick={onComingSoonClick} role="button" aria-disabled="true">
          <div>
            <div className={styles.label}>Рабочие часы (с/по)</div>
            <div className={styles.helperText}>Будет доступно в следующих обновлениях.</div>
          </div>
          <span className={styles.comingSoonBadge}>Скоро</span>
        </div>
      </div>
    </div>
  );
};
