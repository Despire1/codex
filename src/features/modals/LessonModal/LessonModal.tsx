import { type FC, useEffect, useMemo, useRef } from 'react';
import { type Lesson, type LinkedStudent, LessonColor } from '../../../entities/types';
import type { LessonModalFocus } from '../../lessons/model/types';
import {
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
import { StudentSelect } from '../../../shared/ui/StudentSelect';
import { DEFAULT_LESSON_COLOR, LESSON_COLOR_OPTIONS } from '../../../shared/lib/lessonColors';
import {
  resolveLessonDeleteDisabledReason,
  resolveLessonLimitedEditNotice,
} from '../../../entities/lesson/lib/lessonMutationGuards';
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
import {
  getFirstAvailableWeekday,
  hasWeekdayOverlap,
  isDateInWeekdayList,
  normalizeWeekdayList,
} from '../../../shared/lib/weekdays';
import { WeekdayToggleGroup } from '../../../shared/ui/WeekdayToggleGroup';

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
  editingLesson?: Lesson | null;
  defaultDuration: number;
  linkedStudents: LinkedStudent[];
  weekendWeekdays: number[];
  draft: LessonDraft;
  isSubmitting?: boolean;
  recurrenceLocked?: boolean;
  onDraftChange: (draft: LessonDraft) => void;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: () => void;
  onToggleCompleted?: () => void;
  onTogglePaid?: () => void;
  onCancelLesson?: () => void;
  variant?: 'modal' | 'sheet';
  focusTarget?: LessonModalFocus;
}

export const LessonModal: FC<LessonModalProps> = ({
  open,
  editingLessonId,
  editingLesson = null,
  defaultDuration,
  linkedStudents,
  weekendWeekdays,
  draft,
  isSubmitting = false,
  recurrenceLocked = false,
  onDraftChange,
  onClose,
  onDelete,
  onSubmit,
  onToggleCompleted,
  onTogglePaid,
  onCancelLesson,
  variant = 'modal',
  focusTarget = 'full',
}) => {
  const timeZone = useTimeZone();
  const isSheet = variant === 'sheet';
  const isEditing = Boolean(editingLessonId);
  const limitedEditNotice = editingLesson ? resolveLessonLimitedEditNotice(editingLesson) : null;
  const deleteDisabledReason = editingLesson ? resolveLessonDeleteDisabledReason(editingLesson) : null;
  const recurrenceToggleDisabled = recurrenceLocked;
  const recurrenceControlsDisabled = false;
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
  const normalizedWeekendWeekdays = useMemo(() => normalizeWeekdayList(weekendWeekdays), [weekendWeekdays]);
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
  const dateSelectionError = useMemo(() => {
    if (!draft.date) return null;
    const selectedDate = toZonedDate(toUtcDateFromTimeZone(draft.date, '00:00', timeZone), timeZone);
    return isDateInWeekdayList(selectedDate, normalizedWeekendWeekdays)
      ? 'Это выходной день. На него нельзя поставить занятие.'
      : null;
  }, [draft.date, normalizedWeekendWeekdays, timeZone]);
  const recurringWeekendError = useMemo(
    () =>
      draft.isRecurring && hasWeekdayOverlap(draft.repeatWeekdays, normalizedWeekendWeekdays)
        ? 'Серия занятий не может проходить в выходные дни.'
        : null,
    [draft.isRecurring, draft.repeatWeekdays, normalizedWeekendWeekdays],
  );

  const handleRecurringToggle = (checked: boolean) => {
    if (recurrenceControlsDisabled) return;
    const currentDay = Number.isNaN(startAt.getTime()) ? undefined : startAt.getDay();
    const nextDefaultDay = getFirstAvailableWeekday(normalizedWeekendWeekdays, currentDay);
    onDraftChange({
      ...draft,
      isRecurring: checked,
      repeatWeekdays:
        checked && draft.repeatWeekdays.length === 0 && nextDefaultDay !== null
          ? [nextDefaultDay]
          : checked
            ? normalizeWeekdayList(draft.repeatWeekdays)
            : [],
      repeatUntil: checked ? draft.repeatUntil : undefined,
    });
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
  const studentSelectOptions = useMemo(
    () =>
      linkedStudents.map((student) => ({
        id: student.id,
        name: student.link.customName,
      })),
    [linkedStudents],
  );

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
      className={`${modalStyles.modal} ${isSheet ? sheetStyles.sheetModal : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`${modalStyles.modalHeader} ${isSheet ? sheetStyles.sheetHeader : ''} ${sheetStyles.headerTopAligned}`}
      >
        <div className={sheetStyles.headerContent}>
          <div className={modalStyles.modalTitle}>{editingLessonId ? 'Редактирование урока' : 'Новый урок'}</div>
          <div className={modalStyles.modalSubtitle}>
            {editingLessonId ? 'Обновите данные о занятии' : 'Заполните данные о занятии'}
          </div>
          {limitedEditNotice && <div className={sheetStyles.lockNotice}>{limitedEditNotice}</div>}
          {isEditing && editingLesson && (onToggleCompleted || onTogglePaid || onCancelLesson) ? (
            <div className={sheetStyles.quickActionsRow}>
              {onToggleCompleted ? (
                <button
                  type="button"
                  className={`${sheetStyles.quickAction} ${
                    editingLesson.status === 'COMPLETED' ? sheetStyles.quickActionActive : ''
                  }`}
                  onClick={onToggleCompleted}
                  disabled={isSubmitting || editingLesson.status === 'CANCELED'}
                >
                  {editingLesson.status === 'COMPLETED' ? '✓ Проведён' : 'Отметить проведённым'}
                </button>
              ) : null}
              {onTogglePaid ? (
                <button
                  type="button"
                  className={`${sheetStyles.quickAction} ${
                    editingLesson.isPaid ? sheetStyles.quickActionActive : ''
                  }`}
                  onClick={onTogglePaid}
                  disabled={isSubmitting || editingLesson.status === 'CANCELED'}
                >
                  {editingLesson.isPaid ? '✓ Оплачен' : 'Отметить оплату'}
                </button>
              ) : null}
              {onCancelLesson ? (
                <button
                  type="button"
                  className={`${sheetStyles.quickAction} ${sheetStyles.quickActionDanger}`}
                  onClick={onCancelLesson}
                  disabled={isSubmitting || editingLesson.status === 'CANCELED'}
                >
                  Отменить урок
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          className={`${modalStyles.closeButton} ${sheetStyles.closeButtonTop}`}
          onClick={onClose}
          aria-label="Закрыть модалку"
          disabled={isSubmitting}
        >
          ×
        </button>
      </div>
      <div className={`${modalStyles.modalBody} ${isSheet ? sheetStyles.sheetBody : ''}`}>
          <div className={controls.formRow} style={{ gridTemplateColumns: '1fr' }}>
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Ученики</span>
              <StudentSelect
                mode="multiple"
                options={studentSelectOptions}
                value={draft.studentIds}
                onChange={(nextStudentIds) =>
                  onDraftChange({
                    ...draft,
                    studentIds: nextStudentIds,
                    studentId: nextStudentIds[0],
                  })
                }
                placeholder="Выберите учеников"
              />
            </div>
          </div>
          <div className={`${modalStyles.timeRow} ${isSheet ? sheetStyles.sheetTimeRow : ''}`}>
            <DatePickerField
              label="Дата"
              value={draft.date}
              onChange={(nextDate) => onDraftChange({ ...draft, date: nextDate ?? '' })}
              className={modalStyles.field}
              buttonRef={dateButtonRef}
              disabledDateReason={(date) =>
                isDateInWeekdayList(date, normalizedWeekendWeekdays) ? 'Выходной день' : undefined
              }
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
            <span className={`${modalStyles.timeDivider} ${isSheet ? sheetStyles.sheetTimeDivider : ''}`}>—</span>
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
                disabled={recurrenceToggleDisabled}
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
                <WeekdayToggleGroup
                  value={draft.repeatWeekdays}
                  onChange={(nextRepeatWeekdays) => onDraftChange({ ...draft, repeatWeekdays: nextRepeatWeekdays })}
                  blockedDays={normalizedWeekendWeekdays}
                  blockedDayTooltip="Выходной день"
                  disabled={recurrenceControlsDisabled}
                  ariaLabel="Выберите дни недели"
                />
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
                  disabled={recurrenceControlsDisabled}
                />
              </Box>
              {draft.repeatWeekdays.length === 0 && (
                <Typography variant="caption" className={controls.error}>
                  Отметьте хотя бы один день недели
                </Typography>
              )}
              {recurringWeekendError && (
                <Typography variant="caption" className={controls.error}>
                  {recurringWeekendError}
                </Typography>
              )}
            </Box>
          )}
          {dateSelectionError && (
            <Typography variant="caption" className={controls.error}>
              {dateSelectionError}
            </Typography>
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
        <div className={`${modalStyles.modalActions} ${isSheet ? sheetStyles.sheetActions : ''}`}>
          {isEditing && onDelete && !deleteDisabledReason && (
            <button className={controls.dangerButton} onClick={onDelete} disabled={isSubmitting}>
              Удалить урок
            </button>
          )}
          <button className={controls.secondaryButton} onClick={onClose} disabled={isSubmitting}>
            Отмена
          </button>
          <button className={controls.primaryButton} onClick={onSubmit} disabled={isSubmitDisabled || isSubmitting}>
            <span className={sheetStyles.submitButtonContent}>
              {isSubmitting ? <span className={sheetStyles.submitSpinner} aria-hidden /> : null}
              <span>{isSubmitting ? 'Сохраняем...' : 'Сохранить урок'}</span>
            </span>
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

  if (!open) return null;

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      {modalContent}
    </div>
  );
};
