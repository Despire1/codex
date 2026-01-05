import { type FC } from 'react';
import { Teacher } from '../../entities/types';
import { TransferLinkCard } from '../../features/auth/transfer';
import controls from '../../shared/styles/controls.module.css';
import styles from './SettingsSection.module.css';

interface SettingsSectionProps {
  teacher: Teacher;
  onTeacherChange: (teacher: Teacher) => void;
}

export const SettingsSection: FC<SettingsSectionProps> = ({ teacher, onTeacherChange }) => {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h2>Профиль и настройки</h2>
        <span className={styles.muted}>Авторизация через Telegram</span>
      </div>
      <div className={styles.settingsGrid}>
        <div>
          <div className={styles.label}>Имя</div>
          <div className={styles.settingValue}>{teacher.name}</div>
        </div>
        <div>
          <div className={styles.label}>Telegram</div>
          <div className={styles.settingValue}>@{teacher.username}</div>
        </div>
        <div>
          <div className={styles.label}>Chat ID</div>
          <div className={styles.settingValue}>{teacher.chatId}</div>
        </div>
        <div>
          <div className={styles.label}>Длительность урока по умолчанию</div>
          <input
            className={controls.input}
            type="number"
            value={teacher.defaultLessonDuration}
            onChange={(e) => onTeacherChange({ ...teacher, defaultLessonDuration: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className={styles.label}>Напоминать за (мин)</div>
          <input
            className={controls.input}
            type="number"
            value={teacher.reminderMinutesBefore}
            onChange={(e) => onTeacherChange({ ...teacher, reminderMinutesBefore: Number(e.target.value) })}
          />
        </div>
      </div>
      <TransferLinkCard />
      <div className={styles.helperBox}>
        Вход доступен только через Telegram. Для доступа с компьютера создайте одноразовую ссылку в Mini App.
      </div>
    </section>
  );
};
