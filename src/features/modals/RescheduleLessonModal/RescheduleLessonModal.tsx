import { addMinutes, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type FC, useRef } from 'react';
import { TextField } from '@mui/material';
import type { Lesson } from '../../../entities/types';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import {
  addMinutesToTime,
  diffTimeMinutes,
  normalizeTimeInput,
  parseTimeToMinutes,
} from '../../../shared/lib/timeFields';
import controls from '../../../shared/styles/controls.module.css';
import { Modal } from '../../../shared/ui/Modal/Modal';
import styles from './RescheduleLessonModal.module.css';
import type { RescheduleDraft } from '../../lessons/model/types';

interface RescheduleLessonModalProps {
  open: boolean;
  lesson: Lesson | null;
  draft: RescheduleDraft;
  onDraftChange: (draft: RescheduleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const RescheduleLessonModal: FC<RescheduleLessonModalProps> = ({
  open,
  lesson,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}) => {
  const timeZone = useTimeZone();
  const startTimeRef = useRef<HTMLInputElement>(null);
  const startDate = lesson ? toZonedDate(lesson.startAt, timeZone) : null;
  const endDate = startDate && lesson ? addMinutes(startDate, lesson.durationMinutes) : null;
  const subtitle =
    startDate && endDate
      ? `${format(startDate, 'd MMMM', { locale: ru })} • ${format(startDate, 'HH:mm')} - ${format(
          endDate,
          'HH:mm',
        )}`
      : '';

  const textFieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      backgroundColor: 'var(--color-white)',
      '& fieldset': {
        borderColor: 'var(--border)',
      },
      '&:hover fieldset': {
        borderColor: 'var(--border)',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'var(--primary)',
        boxShadow: '0 0 0 2px var(--primary-weak)',
      },
      '& .MuiOutlinedInput-input': {
        padding: '10px 12px',
      },
    },
    '& .MuiInputBase-input': {
      fontSize: '14px',
      color: 'var(--text)',
    },
    '& .MuiInputLabel-root': {
      fontSize: '12px',
      fontWeight: 600,
      color: 'var(--muted)',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: 'var(--muted)',
    },
  } as const;

  if (!open || !lesson || !startDate || !endDate) return null;

  const handleStartTimeChange = (nextValue: string) => {
    const previousDuration = diffTimeMinutes(draft.time, draft.endTime) ?? lesson.durationMinutes;
    const durationMinutes = previousDuration > 0 ? previousDuration : lesson.durationMinutes;
    const nextEndTime =
      parseTimeToMinutes(nextValue) !== null
        ? addMinutesToTime(nextValue, durationMinutes)
        : draft.endTime;
    onDraftChange({ ...draft, time: nextValue, endTime: nextEndTime });
  };

  const handleEndTimeChange = (nextValue: string) => {
    onDraftChange({ ...draft, endTime: nextValue });
  };

  const handleStartTimeBlur = () => {
    const normalized = normalizeTimeInput(draft.time);
    if (!normalized) return;
    const minutes = diffTimeMinutes(draft.time, draft.endTime) ?? lesson.durationMinutes;
    const nextEndTime = addMinutesToTime(normalized, minutes) ?? draft.endTime;
    onDraftChange({ ...draft, time: normalized, endTime: nextEndTime });
  };

  const handleEndTimeBlur = () => {
    const normalized = normalizeTimeInput(draft.endTime);
    if (!normalized) return;
    const startMinutes = parseTimeToMinutes(draft.time);
    const endMinutes = parseTimeToMinutes(normalized);
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      const fallback = addMinutesToTime(draft.time, lesson.durationMinutes) ?? draft.endTime;
      onDraftChange({ ...draft, endTime: fallback });
      return;
    }
    onDraftChange({ ...draft, endTime: normalized });
  };

  const handleSubmit = () => {
    if (!draft.date || !draft.time) {
      startTimeRef.current?.focus();
      return;
    }
    onSubmit();
  };

  const startAt = toZonedDate(toUtcDateFromTimeZone(draft.date || '', draft.time || '00:00', timeZone), timeZone);
  const durationMinutes = diffTimeMinutes(draft.time, draft.endTime) ?? lesson.durationMinutes;

  return (
    <Modal open={open} title="Перенести урок" onClose={onClose}>
      <div className={styles.subtitle}>{subtitle}</div>
      <div className={styles.formGrid}>
        <DatePickerField
          label="Дата"
          value={draft.date}
          onChange={(nextDate) => onDraftChange({ ...draft, date: nextDate ?? '' })}
        />
        <div className={styles.field}>
          <span className={styles.label}>Начало</span>
          <TextField
            type="time"
            value={draft.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            onBlur={handleStartTimeBlur}
            fullWidth
            sx={textFieldSx}
            inputProps={{ step: 60 }}
            inputRef={startTimeRef}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Конец</span>
          <TextField
            type="time"
            value={draft.endTime}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            onBlur={handleEndTimeBlur}
            fullWidth
            sx={textFieldSx}
            inputProps={{
              step: 60,
              min: parseTimeToMinutes(draft.time) !== null ? normalizeTimeInput(draft.time) : '00:00',
            }}
          />
        </div>
      </div>
      <div className={styles.preview}>
        {format(startAt, 'd MMMM', { locale: ru })} • {format(startAt, 'HH:mm')} -{' '}
        {format(addMinutes(startAt, durationMinutes), 'HH:mm')}
        <span className={styles.duration}> · {durationMinutes} мин</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={controls.secondaryButton} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={controls.primaryButton} onClick={handleSubmit}>
          Перенести
        </button>
      </div>
    </Modal>
  );
};
