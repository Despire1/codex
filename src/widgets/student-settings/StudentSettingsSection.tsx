import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleOutlineIcon,
  ContentCopyOutlinedIcon,
  PersonOutlineIcon,
  SettingsIcon,
} from '../../icons/MaterialIcons';
import controls from '../../shared/styles/controls.module.css';
import { getTimeZoneOptions } from '../../shared/lib/timezones';
import styles from './StudentSettingsSection.module.css';
import { api } from '../../shared/api/client';

type StudentSettingsSectionProps = {
  activeTeacherName?: string | null;
};

const getTeacherInitials = (name?: string | null) => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'TP';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export const StudentSettingsSection: FC<StudentSettingsSectionProps> = ({ activeTeacherName }) => {
  const [timezone, setTimezone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const teacherInitials = useMemo(() => getTeacherInitials(activeTeacherName), [activeTeacherName]);
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);
  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timezone) return;
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch (_error) {
      // ignore
    }
  }, [timezone]);

  const saveTimezone = useCallback(async (value: string) => {
    if (lastSavedRef.current === value) return;
    lastSavedRef.current = value;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateStudentPreferencesV2({ timezone: value || null });
      setMessage('Сохранено');
    } catch (_error) {
      setMessage('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (lastSavedRef.current === null) {
      lastSavedRef.current = timezone.trim();
      return;
    }
    const next = timezone.trim();
    if (next === lastSavedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveTimezone(next);
    }, 500);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [timezone, saveTimezone]);

  return (
    <section className={styles.page}>
      <section className={styles.heroCard}>
        <div className={styles.heroHeader}>
          <div className={styles.heroIconWrap}>
            <PersonOutlineIcon width={20} height={20} />
          </div>
          <div>
            <h2 className={styles.heroTitle}>Настройки ученика</h2>
            <p className={styles.heroSubtitle}>Отдельный профиль для учащихся</p>
          </div>
        </div>

        <div className={styles.heroBody}>
          <p className={styles.heroCaption}>
            Этот раздел содержит специальные настройки, которые применяются к профилю ученика. Изменения здесь не влияют
            на настройки преподавателя.
          </p>

          <div className={styles.fieldBlock}>
            <label className={styles.label} htmlFor="student-timezone-input">
              Таймзона ученика
            </label>
            <select
              id="student-timezone-input"
              className={`${controls.input} ${styles.input}`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              <option value="">Выберите часовой пояс</option>
              {timeZoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className={styles.helperText}>Используется для расчёта времени занятий.</div>
          </div>

          <div className={styles.teacherCard}>
            <div className={styles.teacherCardTitle}>Активный преподаватель</div>
            <div className={styles.teacherInfo}>
              <div className={styles.teacherAvatar}>{teacherInitials}</div>
              <div>
                <div className={styles.teacherName}>{activeTeacherName ?? 'Не выбран'}</div>
                <div className={styles.teacherMeta}>Только для чтения</div>
              </div>
            </div>
          </div>

          <div className={styles.message}>
            {saving ? 'Сохраняем…' : (message ?? 'Изменения сохраняются автоматически')}
          </div>
        </div>
      </section>

      <section className={styles.infoCard}>
        <div className={styles.infoHeader}>
          <div className={`${styles.infoIcon} ${styles.infoIconBlue}`}>
            <SettingsIcon width={18} height={18} />
          </div>
          <div>
            <h3 className={styles.infoTitle}>О настройках ученика</h3>
            <p className={styles.infoSubtitle}>Важная информация</p>
          </div>
        </div>

        <div className={styles.infoStack}>
          <div className={`${styles.noteCard} ${styles.noteCardBlue}`}>
            <ContentCopyOutlinedIcon width={18} height={18} />
            <div>
              <div className={styles.noteTitle}>Отдельный поток настроек</div>
              <div className={styles.noteText}>Настройки ученика не пересекаются с настройками преподавателя.</div>
            </div>
          </div>

          <div className={`${styles.noteCard} ${styles.noteCardPurple}`}>
            <CheckCircleOutlineIcon width={18} height={18} />
            <div>
              <div className={styles.noteTitle}>Ограниченный доступ</div>
              <div className={styles.noteText}>Ученики видят только те параметры, которые относятся к их профилю.</div>
            </div>
          </div>

          <div className={`${styles.noteCard} ${styles.noteCardGreen}`}>
            <PersonOutlineIcon width={18} height={18} />
            <div>
              <div className={styles.noteTitle}>Мгновенное применение</div>
              <div className={styles.noteText}>После сохранения изменения сразу применяются к текущему профилю.</div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
};
