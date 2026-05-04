import { useCallback, useState, type FC } from 'react';
import { api } from '../../shared/api/client';
import styles from './DevRoleSwitcher.module.css';

interface DevRoleSwitcherProps {
  currentRole: 'TEACHER' | 'STUDENT';
  onSwitched: () => Promise<void> | void;
}

export const DevRoleSwitcher: FC<DevRoleSwitcherProps> = ({ currentRole, onSwitched }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (busy) return;
    const nextRole: 'TEACHER' | 'STUDENT' = currentRole === 'TEACHER' ? 'STUDENT' : 'TEACHER';
    setBusy(true);
    setError(null);
    try {
      const response = await api.devSwitchRole(nextRole);
      if (typeof window !== 'undefined') {
        if (response.user.role) {
          window.localStorage.setItem('userRole', response.user.role);
        }
        if (nextRole === 'STUDENT' && response.studentContext) {
          window.localStorage.setItem('student_active_teacher_id', String(response.studentContext.teacherId));
          window.localStorage.setItem('student_active_student_id', String(response.studentContext.studentId));
        }
        if (nextRole === 'TEACHER') {
          window.localStorage.removeItem('student_active_teacher_id');
          window.localStorage.removeItem('student_active_student_id');
        }
      }
      await onSwitched();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось переключить роль');
    } finally {
      setBusy(false);
    }
  }, [busy, currentRole, onSwitched]);

  const isStudent = currentRole === 'STUDENT';
  const targetLabel = isStudent ? 'учитель' : 'ученик';

  return (
    <div className={styles.root} role="region" aria-label="Dev role switcher">
      <div className={styles.label}>
        <span className={styles.labelTitle}>DEV</span>
        <span className={styles.labelHint}>переключение ролей</span>
      </div>
      <button
        type="button"
        className={`${styles.button} ${isStudent ? styles.buttonStudent : styles.buttonTeacher}`}
        onClick={handleClick}
        disabled={busy}
        title={`Переключиться на роль "${targetLabel}"`}
      >
        <span className={styles.icon} aria-hidden>
          {isStudent ? '🧑‍🎓' : '👨‍🏫'}
        </span>
        <span className={styles.buttonText}>
          <span className={styles.currentRole}>{isStudent ? 'Ученик' : 'Учитель'}</span>
          <span className={styles.switchHint}>{busy ? 'Переключаю…' : `→ ${targetLabel}`}</span>
        </span>
      </button>
      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
};
