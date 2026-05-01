import ru, { addMinutes, format } from 'date-fns';
import { type FC, useRef } from 'react';
import { TextField } from '@mui/material';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { LessonDayTimeline } from '../LessonModal/LessonDayTimeline';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import { isDateInWeekdayList, normalizeWeekdayList } from '../../../shared/lib/weekdays';
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
  weekendWeekdays: number[];
  linkedStudents: LinkedStudent[];
  draft: RescheduleDraft;
  onDraftChange: (draft: RescheduleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export const RescheduleLessonModal: FC<RescheduleLessonModalProps> = ({
  open,
  lesson,
  weekendWeekdays,
  linkedStudents,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
  isSubmitting = false,
}) => {
  const timeZone = useTimeZone();
  const startTimeRef = useRef<HTMLInputElement>(null);
  const normalizedWeekendWeekdays = normalizeWeekdayList(weekendWeekdays);
  const startDate = lesson ? toZonedDate(lesson.startAt, timeZone) : null;
  const endDate = startDate && lesson ? addMinutes(startDate, lesson.durationMinutes) : null;
  const subtitle =
    startDate && endDate
      ? `${format(startDate, 'd MMMM', { locale: ru })} • ${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`
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
      parseTimeToMinutes(nextValue) !== null ? addMinutesToTime(nextValue, durationMinutes) : draft.endTime;
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
    if (isSubmitting) return;
    if (!draft.date || !draft.time) {
      startTimeRef.current?.focus();
      return;
    }
    onSubmit();
  };

  const startAt = toZonedDate(toUtcDateFromTimeZone(draft.date || '', draft.time || '00:00', timeZone), timeZone);
  const durationMinutes = diffTimeMinutes(draft.time, draft.endTime) ?? lesson.durationMinutes;
  const dateSelectionError = draft.date
    ? isDateInWeekdayList(
        toZonedDate(toUtcDateFromTimeZone(draft.date, '00:00', timeZone), timeZone),
        normalizedWeekendWeekdays,
      )
      ? 'Это выходной день. На него нельзя перенести занятие.'
      : null
    : null;

  return (
    <Modal open={open} title="Перенести урок" onClose={isSubmitting ? () => undefined : onClose}>
      <div className={styles.subtitle}>{subtitle}</div>
      <div className={styles.formGrid}>
        <DatePickerField
          label="Дата"
          value={draft.date}
          onChange={(nextDate) => onDraftChange({ ...draft, date: nextDate ?? '' })}
          disabled={isSubmitting}
          disabledDateReason={(date) =>
            isDateInWeekdayList(date, normalizedWeekendWeekdays) ? 'Выходной день' : undefined
          }
        />
        <div className={styles.field}>
          <span className={styles.label}>Начало</span>
          <TextField
            type="text"
            value={draft.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            onBlur={handleStartTimeBlur}
            fullWidth
            sx={textFieldSx}
            placeholder="ЧЧ:ММ"
            inputProps={{ inputMode: 'numeric', maxLength: 5, autoComplete: 'off' }}
            inputRef={startTimeRef}
            disabled={isSubmitting}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Конец</span>
          <TextField
            type="text"
            value={draft.endTime}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            onBlur={handleEndTimeBlur}
            fullWidth
            sx={textFieldSx}
            placeholder="ЧЧ:ММ"
            inputProps={{ inputMode: 'numeric', maxLength: 5, autoComplete: 'off' }}
            disabled={isSubmitting}
          />
        </div>
      </div>
      {dateSelectionError && <div className={controls.error}>{dateSelectionError}</div>}
      <LessonDayTimeline
        date={draft.date}
        startTime={draft.time}
        endTime={draft.endTime}
        timeZone={timeZone}
        excludeLessonId={lesson.id}
        linkedStudents={linkedStudents}
      />
      <div className={styles.preview}>
        {format(startAt, 'd MMMM', { locale: ru })} • {format(startAt, 'HH:mm')} -{' '}
        {format(addMinutes(startAt, durationMinutes), 'HH:mm')}
        <span className={styles.duration}> · {durationMinutes} мин</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={controls.secondaryButton} onClick={onClose} disabled={isSubmitting}>
          Отмена
        </button>
        <button type="button" className={controls.primaryButton} onClick={handleSubmit} disabled={isSubmitting}>
          <span className={styles.submitButtonContent}>
            {isSubmitting ? <span className={styles.submitSpinner} aria-hidden /> : null}
            <span>{isSubmitting ? 'Переносим...' : 'Перенести'}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
};
