import { type FC, useEffect, useMemo, useRef } from 'react';
import { LinkedStudent } from '../../../entities/types';
import type { LessonModalFocus } from '../../lessons/model/types';
import {
  Autocomplete,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';
import sheetStyles from './LessonModal.module.css';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { DEFAULT_LESSON_COLOR, LESSON_COLOR_OPTIONS } from '../../../shared/lib/lessonColors';
import { LessonColor } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import { ClearIcon, MeetingLinkIcon } from '../../../icons/MaterialIcons';
import {
  isValidMeetingLink,
  MEETING_LINK_MAX_LENGTH,
  normalizeMeetingLinkInput,
} from '../../../shared/lib/meetingLink';
import {
  addMinutesToTime,
  diffTimeMinutes,
  normalizeTimeInput,
  parseTimeToMinutes,
} from '../../../shared/lib/timeFields';

export interface LessonDraft {
  studentId: number | undefined;
  studentIds: number[];
  date: string;
  time: string;
  endTime: string;
  meetingLink: string;
  color: LessonColor;
  isRecurring: boolean;
  repeatWeekdays: number[];
  repeatUntil: string | undefined;
}

interface LessonModalProps {
  open: boolean;
  editingLessonId: number | null;
  defaultDuration: number;
  linkedStudents: LinkedStudent[];
  draft: LessonDraft;
  recurrenceLocked?: boolean;
  onDraftChange: (draft: LessonDraft) => void;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: () => void;
  variant?: 'modal' | 'sheet';
  focusTarget?: LessonModalFocus;
}

const weekdayOptions: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' },
];

export const LessonModal: FC<LessonModalProps> = ({
  open,
  editingLessonId,
  defaultDuration,
  linkedStudents,
  draft,
  recurrenceLocked = false,
  onDraftChange,
  onClose,
  onDelete,
  onSubmit,
  variant = 'modal',
  focusTarget = 'full',
}) => {
  if (!open) return null;

  const timeZone = useTimeZone();
  const isEditing = Boolean(editingLessonId);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const startTimeRef = useRef<HTMLInputElement>(null);
  const selectedColor = draft.color ?? DEFAULT_LESSON_COLOR;
  const startAt = useMemo(
    () => toZonedDate(toUtcDateFromTimeZone(draft.date || '', draft.time || '00:00', timeZone), timeZone),
    [draft.date, draft.time, timeZone],
  );
  const normalizedMeetingLink = useMemo(
    () => normalizeMeetingLinkInput(draft.meetingLink ?? ''),
    [draft.meetingLink],
  );
  const meetingLinkError = useMemo(() => {
    const trimmed = draft.meetingLink?.trim() ?? '';
    if (!trimmed) return null;
    if (normalizedMeetingLink.length > MEETING_LINK_MAX_LENGTH) {
      return 'Ссылка слишком длинная';
    }
    if (!isValidMeetingLink(normalizedMeetingLink)) {
      return 'Похоже, это не ссылка';
    }
    return null;
  }, [draft.meetingLink, normalizedMeetingLink]);

  const handleRecurringToggle = (checked: boolean) => {
    if (recurrenceLocked && !checked) return;
    const currentDay = Number.isNaN(startAt.getTime()) ? undefined : startAt.getDay();
    onDraftChange({
      ...draft,
      isRecurring: checked,
      repeatWeekdays: checked && draft.repeatWeekdays.length === 0 && currentDay !== undefined
        ? [currentDay]
        : checked
          ? draft.repeatWeekdays
          : [],
      repeatUntil: checked ? draft.repeatUntil : undefined,
    });
  };

  const handleWeekdayToggle = (day: number) => {
    const nextWeekdays = draft.repeatWeekdays.includes(day)
      ? draft.repeatWeekdays.filter((item) => item !== day)
      : [...draft.repeatWeekdays, day];
    onDraftChange({ ...draft, repeatWeekdays: nextWeekdays });
  };

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

  const accordionSx = {
    borderRadius: '12px !important',
    border: '1px solid var(--border)',
    boxShadow: 'none',
    '&::before': {
      display: 'none',
    },
  } as const;
  const isSubmitDisabled = Boolean(meetingLinkError);

  useEffect(() => {
    if (!open) return;
    if (focusTarget === 'focus_date') {
      dateButtonRef.current?.focus();
      return;
    }
    if (focusTarget === 'focus_time') {
      startTimeRef.current?.focus();
    }
  }, [focusTarget, open]);

  const handleOpenMeetingLink = () => {
    if (!normalizedMeetingLink || meetingLinkError) return;
    window.open(normalizedMeetingLink, '_blank', 'noopener,noreferrer');
  };

  const resolveEndTime = (startTime: string, endTime: string) => {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) return endTime;
    if (endMinutes < startMinutes) {
      return addMinutesToTime(startTime, defaultDuration) || startTime;
    }
    return endTime;
  };

  const handleStartTimeChange = (nextValue: string) => {
    const previousDuration = diffTimeMinutes(draft.time, draft.endTime);
    const durationMinutes =
      previousDuration && previousDuration > 0 ? previousDuration : defaultDuration;
    const nextEndTime =
      parseTimeToMinutes(nextValue) !== null
        ? addMinutesToTime(nextValue, durationMinutes)
        : draft.endTime;
    onDraftChange({ ...draft, time: nextValue, endTime: nextEndTime });
  };

  const handleStartTimeBlur = () => {
    const normalizedStart = normalizeTimeInput(draft.time);
    const normalizedEnd = normalizeTimeInput(draft.endTime);
    onDraftChange({
      ...draft,
      time: normalizedStart,
      endTime: resolveEndTime(normalizedStart, normalizedEnd),
    });
  };

  const handleEndTimeChange = (nextValue: string) => {
    const nextEndTime = resolveEndTime(draft.time, nextValue);
    onDraftChange({ ...draft, endTime: nextEndTime });
  };

  const handleEndTimeBlur = () => {
    const normalizedEnd = normalizeTimeInput(draft.endTime);
    onDraftChange({
      ...draft,
      endTime: resolveEndTime(draft.time, normalizedEnd),
    });
  };

  const handleMeetingLinkBlur = () => {
    const normalized = normalizeMeetingLinkInput(draft.meetingLink ?? '');
    if (normalized === draft.meetingLink) return;
    onDraftChange({ ...draft, meetingLink: normalized });
  };

  const modalContent = (
    <div
      className={`${modalStyles.modal} ${variant === 'sheet' ? sheetStyles.sheetModal : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={modalStyles.modalHeader}>
        <div>
          <div className={modalStyles.modalTitle}>{editingLessonId ? 'Редактирование урока' : 'Новый урок'}</div>
          <div className={modalStyles.modalSubtitle}>
            {editingLessonId ? 'Обновите данные о занятии' : 'Заполните данные о занятии'}
          </div>
        </div>
        <button className={modalStyles.closeButton} onClick={onClose} aria-label="Закрыть модалку">
          ×
        </button>
      </div>
      <div className={modalStyles.modalBody}>
          <div className={controls.formRow} style={{ gridTemplateColumns: '1fr' }}>
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Ученики</span>
              <Autocomplete
                multiple
                id="students-autocomplete"
                options={linkedStudents}
                getOptionLabel={(option) => option.link.customName}
                value={linkedStudents.filter((s) => draft.studentIds.includes(s.id))}
                onChange={(_, newValue) => {
                  const ids = (Array.isArray(newValue) ? newValue : []).map((student) => student.id);
                  onDraftChange({ ...draft, studentIds: ids, studentId: ids[0] });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Выберите учеников"
                    variant="outlined"
                    sx={textFieldSx}
                  />
                )}
                disableCloseOnSelect
              />
            </div>
          </div>
          <div className={modalStyles.timeRow}>
            <DatePickerField
              label="Дата"
              value={draft.date}
              onChange={(nextDate) => onDraftChange({ ...draft, date: nextDate ?? '' })}
              className={modalStyles.field}
              buttonRef={dateButtonRef}
            />
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Начало</span>
              <TextField
                type="time"
                value={draft.time}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                onBlur={handleStartTimeBlur}
                fullWidth
                sx={textFieldSx}
                inputRef={startTimeRef}
                inputProps={{ step: 60 }}
              />
            </div>
            <span className={modalStyles.timeDivider}>—</span>
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Конец</span>
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
          <div className={controls.formRow} style={{ gridTemplateColumns: '1fr' }}>
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Ссылка на занятие (необязательно)</span>
              <TextField
                type="text"
                value={draft.meetingLink}
                onChange={(event) => onDraftChange({ ...draft, meetingLink: event.target.value })}
                onBlur={handleMeetingLinkBlur}
                placeholder="Вставьте ссылку (Zoom / Google Meet / Telegram / Teams…)"
                fullWidth
                sx={textFieldSx}
                error={Boolean(meetingLinkError)}
                inputProps={{ 'data-testid': 'lesson-modal-meeting-link-input' }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <div className={modalStyles.inputAdornment}>
                        {draft.meetingLink && (
                          <button
                            type="button"
                            className={modalStyles.inputIconButton}
                            onClick={() => onDraftChange({ ...draft, meetingLink: '' })}
                            aria-label="Очистить ссылку"
                            data-testid="lesson-modal-meeting-link-clear"
                          >
                            <ClearIcon width={16} height={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={modalStyles.inputIconButton}
                          onClick={handleOpenMeetingLink}
                          aria-label="Открыть ссылку"
                          disabled={!normalizedMeetingLink || Boolean(meetingLinkError)}
                          data-testid="lesson-modal-meeting-link-open"
                        >
                          <MeetingLinkIcon width={16} height={16} />
                        </button>
                      </div>
                    </InputAdornment>
                  ),
                }}
              />
              {meetingLinkError && (
                <Typography variant="caption" className={controls.error}>
                  {meetingLinkError}
                </Typography>
              )}
            </div>
          </div>
          <div className={modalStyles.switchRow}>
            <label className={controls.switch}>
              <input
                type="checkbox"
                checked={draft.isRecurring}
                disabled={recurrenceLocked && draft.isRecurring}
                onChange={(e) => handleRecurringToggle(e.target.checked)}
              />
              <span className={controls.slider} />
            </label>
            <span className={modalStyles.switchLabel}>Сделать урок повторяющимся</span>
          </div>
          {draft.isRecurring && (
            <Box>
              <div className={`${modalStyles.field} ${modalStyles.weekdaysRow}`}>
                <span className={modalStyles.fieldLabel}>Выберите дни недели</span>
                <div className={modalStyles.weekdayGrid} role="group" aria-label="Дни недели">
                  {weekdayOptions.map((day) => {
                    const isActive = draft.repeatWeekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        className={`${modalStyles.weekdayButton} ${
                          isActive ? modalStyles.weekdayButtonActive : ''
                        }`}
                        onClick={() => handleWeekdayToggle(day.value)}
                        aria-pressed={isActive}
                      >
                        <span>{day.label}</span>
                        <span
                          className={`${modalStyles.weekdayDot} ${
                            isActive ? modalStyles.weekdayDotActive : ''
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <Box
                style={{
                  marginTop: '12px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px',
                }}
              >
                <DatePickerField
                  label="Повторять до"
                  value={draft.repeatUntil ?? ''}
                  min={draft.date}
                  onChange={(nextDate) => onDraftChange({ ...draft, repeatUntil: nextDate || undefined })}
                  allowClear
                />
              </Box>
              {draft.repeatWeekdays.length === 0 && (
                <Typography variant="caption" className={controls.error}>
                  Отметьте хотя бы один день недели
                </Typography>
              )}
            </Box>
          )}
          <Accordion sx={accordionSx} className={modalStyles.settingsAccordion}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} className={modalStyles.settingsSummary}>
              <span className={modalStyles.settingsTitle}>Дополнительные настройки</span>
            </AccordionSummary>
            <AccordionDetails className={modalStyles.settingsDetails}>
              <div className={modalStyles.field}>
                <span className={modalStyles.fieldLabel}>Цвет занятия</span>
                <div className={modalStyles.colorPicker} role="radiogroup" aria-label="Цвет занятия">
                  {LESSON_COLOR_OPTIONS.map((option) => {
                    const isActive = option.id === selectedColor;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`${modalStyles.colorOption} ${isActive ? modalStyles.colorOptionActive : ''}`}
                        onClick={() => onDraftChange({ ...draft, color: option.id })}
                      >
                        <span
                          className={modalStyles.colorSwatch}
                          style={{ background: option.background, borderColor: option.border }}
                        >
                          <span
                            className={modalStyles.colorSwatchDot}
                            style={{ background: option.hoverBackground }}
                          />
                        </span>
                        <span className={modalStyles.colorLabel}>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </AccordionDetails>
          </Accordion>
        </div>
        <div className={modalStyles.modalActions}>
          {isEditing && onDelete && (
            <button className={controls.dangerButton} onClick={onDelete}>
              Удалить урок
            </button>
          )}
          <button className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button className={controls.primaryButton} onClick={onSubmit} disabled={isSubmitDisabled}>
            Сохранить урок
          </button>
        </div>
      </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={onClose}>
        {modalContent}
      </BottomSheet>
    );
  }

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      {modalContent}
    </div>
  );
};
