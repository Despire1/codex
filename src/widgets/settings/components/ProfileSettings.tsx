import { FC, useEffect, useState } from 'react';
import { Teacher } from '../../../entities/types';
import { isValidEmail, normalizeEmail } from '../../../shared/lib/email';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

interface ProfileSettingsProps {
  teacher: Teacher;
  timeZoneOptions: { value: string; label: string }[];
  onChange: (patch: Partial<Teacher>) => void;
}

export const ProfileSettings: FC<ProfileSettingsProps> = ({ teacher, timeZoneOptions, onChange }) => {
  const usernameLabel = teacher.username ? `@${teacher.username}` : 'не указан';
  const [emailValue, setEmailValue] = useState(teacher.receiptEmail ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    setEmailValue(teacher.receiptEmail ?? '');
    setEmailError(null);
  }, [teacher.receiptEmail]);

  const handleEmailChange = (value: string) => {
    setEmailValue(value);
    const normalized = normalizeEmail(value);
    if (!normalized) {
      setEmailError(null);
      onChange({ receiptEmail: null });
      return;
    }
    if (!isValidEmail(normalized)) {
      setEmailError('Некорректный e-mail');
      return;
    }
    setEmailError(null);
    onChange({ receiptEmail: normalized });
  };

  return (
    <div className={styles.moduleStack}>
      <div className={styles.sectionBlock}>
        <div className={styles.label}>Имя</div>
        <div className={styles.readonlyValue}>{teacher.name ?? '—'}</div>
      </div>
      <div className={styles.sectionBlock}>
        <div className={styles.label}>Telegram username</div>
        <div className={styles.readonlyValue}>{usernameLabel}</div>
      </div>
      <div className={styles.sectionBlock}>
        <div className={styles.label}>E-mail для чека</div>
        <input
          className={`${controls.input} ${emailError ? styles.inputError : ''}`}
          value={emailValue}
          type="email"
          placeholder="email@example.com"
          onChange={(event) => handleEmailChange(event.target.value)}
        />
        {emailError ? (
          <div className={styles.errorText}>{emailError}</div>
        ) : (
          <div className={styles.helperText}>На этот адрес будут приходить чеки за подписку.</div>
        )}
      </div>
      <div className={styles.sectionBlock}>
        <div className={styles.label}>Часовой пояс</div>
        <select
          className={controls.input}
          value={teacher.timezone ?? ''}
          onChange={(event) => onChange({ timezone: event.target.value || null })}
        >
          <option value="">Выберите часовой пояс</option>
          {timeZoneOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className={styles.helperText}>После сохранения все даты будут отображаться в выбранной зоне.</div>
      </div>
    </div>
  );
};
