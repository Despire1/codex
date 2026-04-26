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
  saveStatus?: 'idle' | 'saving' | 'error';
}

export const ProfileSettings: FC<ProfileSettingsProps> = ({
  teacher,
  timeZoneOptions,
  onChange,
  initials,
  saveStatus = 'idle',
}) => {
  const usernameLabel = teacher.username ? `@${teacher.username}` : 'не указан';
  const [emailValue, setEmailValue] = useState(teacher.receiptEmail ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState(teacher.name ?? '');

  useEffect(() => {
    setEmailValue(teacher.receiptEmail ?? '');
    setEmailError(null);
  }, [teacher.receiptEmail]);

  useEffect(() => {
    setNameValue(teacher.name ?? '');
  }, [teacher.name]);

  const handleNameBlur = () => {
    const trimmed = nameValue.trim();
    if (trimmed === (teacher.name ?? '').trim()) return;
    onChange({ name: trimmed || null });
  };

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
            <p className={styles.sectionDescription}>
              Данные вашего профиля.{' '}
              {saveStatus === 'saving'
                ? 'Сохраняем…'
                : saveStatus === 'error'
                  ? 'Не удалось сохранить — проверьте подключение.'
                  : 'Изменения применяются автоматически.'}
            </p>
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
            <div className={styles.fieldBlock}>
              <label className={styles.fieldLabel} htmlFor="profile-display-name">
                Имя
              </label>
              <input
                id="profile-display-name"
                className={`${controls.input} ${styles.fieldInput}`}
                value={nameValue}
                type="text"
                maxLength={60}
                placeholder="Как к вам обращаться"
                onChange={(event) => setNameValue(event.target.value)}
                onBlur={handleNameBlur}
              />
              <p className={styles.fieldHint}>Видят ваши ученики в уведомлениях.</p>
            </div>

            <div className={styles.readonlyFieldBlock}>
              <label className={styles.fieldLabel}>Telegram username</label>
              <div className={`${styles.readonlyField} ${styles.readonlyFieldAccent}`}>{usernameLabel}</div>
              <p className={styles.readonlyHint}>
                Только для чтения. Имя приходит из Telegram и обновляется автоматически при следующем входе.
              </p>
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
              <div className={styles.fieldHint}>
                Сюда придут чеки YooKassa за оплату подписки TeacherBot. Не используется для уведомлений ученикам.
              </div>
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
