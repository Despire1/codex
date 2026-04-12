import { FC, useEffect, useState } from 'react';
import { Teacher } from '../../../entities/types';
import { EditOutlinedIcon, PersonOutlineIcon } from '../../../icons/MaterialIcons';
import { isValidEmail, normalizeEmail } from '../../../shared/lib/email';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

interface ProfileSettingsProps {
  teacher: Teacher;
  timeZoneOptions: { value: string; label: string }[];
  onChange: (patch: Partial<Teacher>) => void;
  initials: string;
}

export const ProfileSettings: FC<ProfileSettingsProps> = ({ teacher, timeZoneOptions, onChange, initials }) => {
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
      <section className={styles.settingsCard}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPrimary}`}>
            <PersonOutlineIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Основная информация</h2>
            <p className={styles.sectionDescription}>Данные вашего профиля</p>
          </div>
        </div>

        <div className={styles.profileHero}>
          <div className={styles.profileAvatarWrap}>
            <div className={styles.profileAvatar}>{initials}</div>
            <span className={styles.profileAvatarAction} aria-hidden>
              <EditOutlinedIcon width={16} height={16} />
            </span>
          </div>

          <div className={styles.profileReadOnlyGrid}>
            <div className={styles.readonlyFieldBlock}>
              <label className={styles.fieldLabel}>Имя</label>
              <div className={styles.readonlyField}>{teacher.name ?? '—'}</div>
              <p className={styles.readonlyHint}>Только для чтения</p>
            </div>

            <div className={styles.readonlyFieldBlock}>
              <label className={styles.fieldLabel}>Telegram username</label>
              <div className={`${styles.readonlyField} ${styles.readonlyFieldAccent}`}>{usernameLabel}</div>
              <p className={styles.readonlyHint}>Только для чтения</p>
            </div>
          </div>
        </div>

        <div className={styles.sectionDivider} />

        <div className={styles.subSectionHeader}>
          <h3 className={styles.subSectionTitle}>Контакты и локаль</h3>
        </div>

        <div className={styles.fieldGridTwo}>
          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>E-mail для чека</label>
            <input
              className={`${controls.input} ${styles.fieldInput} ${emailError ? styles.inputError : ''}`}
              value={emailValue}
              type="email"
              placeholder="email@example.com"
              onChange={(event) => handleEmailChange(event.target.value)}
            />
            {emailError ? (
              <div className={styles.errorText}>{emailError}</div>
            ) : (
              <div className={styles.fieldHint}>Будет использоваться для отправки чеков.</div>
            )}
          </div>

          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>Часовой пояс</label>
            <select
              className={`${controls.input} ${styles.fieldInput}`}
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
            <div className={styles.fieldHint}>После сохранения все даты будут отображаться в выбранной зоне.</div>
          </div>
        </div>
      </section>
    </div>
  );
};
