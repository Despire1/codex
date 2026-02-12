import { FC, useState } from 'react';
import controls from '../../shared/styles/controls.module.css';
import styles from './StudentSettingsSection.module.css';
import { api } from '../../shared/api/client';

type StudentSettingsSectionProps = {
  activeTeacherName?: string | null;
};

export const StudentSettingsSection: FC<StudentSettingsSectionProps> = ({ activeTeacherName }) => {
  const [timezone, setTimezone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateStudentPreferencesV2({ timezone: timezone.trim() || null });
      setMessage('Сохранено');
    } catch (error) {
      setMessage('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.page}>
      <h2 className={styles.title}>Настройки</h2>
      {activeTeacherName ? <p className={styles.caption}>Активный преподаватель: {activeTeacherName}</p> : null}

      <div className={styles.card}>
        <label className={styles.label} htmlFor="student-timezone-input">
          Таймзона ученика
        </label>
        <input
          id="student-timezone-input"
          className={controls.input}
          placeholder="Например, Europe/Moscow"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
        />
        <div className={styles.actions}>
          <button type="button" className={controls.primaryButton} disabled={saving} onClick={onSave}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
        {message ? <div className={styles.message}>{message}</div> : null}
      </div>
    </section>
  );
};
