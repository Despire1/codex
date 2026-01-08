import { type FC, useMemo } from 'react';
import { LinkedStudent } from '../../../entities/types';
import {
  Autocomplete,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { DEFAULT_LESSON_COLOR, LESSON_COLOR_OPTIONS } from '../../../shared/lib/lessonColors';
import { LessonColor } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';

interface LessonDraft {
  studentId: number | undefined;
  studentIds: number[];
  date: string;
  time: string;
  durationMinutes: number;
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
}) => {
  if (!open) return null;

  const timeZone = useTimeZone();
  const isEditing = Boolean(editingLessonId);
  const selectedColor = draft.color ?? DEFAULT_LESSON_COLOR;
  const startAt = useMemo(
    () => toZonedDate(toUtcDateFromTimeZone(draft.date || '', draft.time || '00:00', timeZone), timeZone),
    [draft.date, draft.time, timeZone],
  );

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
    borderRadius: '12px',
    border: '1px solid var(--border)',
    boxShadow: 'none',
    '&::before': {
      display: 'none',
    },
  } as const;

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalHeader}>
          <div>
            <div className={modalStyles.modalLabel}>{editingLessonId ? 'Редактирование урока' : 'Новый урок'}</div>
            <div className={modalStyles.modalTitle}>По умолчанию {defaultDuration} мин</div>
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
          <div className={controls.formRow} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <DatePickerField
              label="Дата"
              value={draft.date}
              onChange={(nextDate) => onDraftChange({ ...draft, date: nextDate ?? '' })}
              className={modalStyles.field}
            />
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Время</span>
              <TextField
                type="time"
                value={draft.time}
                onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
                fullWidth
                sx={textFieldSx}
              />
            </div>
            <div className={modalStyles.field}>
              <span className={modalStyles.fieldLabel}>Длительность (мин)</span>
              <TextField
                type="number"
                value={draft.durationMinutes}
                onChange={(e) => onDraftChange({ ...draft, durationMinutes: Number(e.target.value) })}
                placeholder={`${defaultDuration}`}
                fullWidth
                sx={textFieldSx}
              />
            </div>
          </div>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.isRecurring}
                disabled={recurrenceLocked && draft.isRecurring}
                onChange={(e) => handleRecurringToggle(e.target.checked)}
              />
            }
            label={'Сделать урок повторяющимся'}
          />
          {draft.isRecurring && (
            <Box>
              <div className={modalStyles.field}>
                <span className={modalStyles.fieldLabel}>Выберите дни недели для повтора</span>
                <ToggleButtonGroup
                  value={draft.repeatWeekdays}
                  onChange={(_, nextValue) => onDraftChange({ ...draft, repeatWeekdays: nextValue ?? [] })}
                  className={modalStyles.weekdayGroup}
                  sx={{
                    gap: '8px',
                    flexWrap: 'wrap',
                    '& .MuiToggleButton-root': {
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      padding: '10px 12px',
                      textTransform: 'none',
                      color: 'var(--text)',
                      minWidth: '44px',
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                      background: 'var(--color-blue-600)',
                      color: 'var(--color-white)',
                      borderColor: 'var(--color-blue-600)',
                    },
                    '& .MuiToggleButton-root.Mui-selected:hover': {
                      background: 'var(--color-blue-700)',
                      borderColor: 'var(--color-blue-700)',
                    },
                  }}
                >
                  {weekdayOptions.map((day) => (
                    <ToggleButton
                      key={day.value}
                      value={day.value}
                      aria-label={`repeat-${day.label}`}
                      className={modalStyles.weekdayToggle}
                    >
                      {day.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              <Box
                style={{
                  marginTop: '16px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
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
          <button className={controls.primaryButton} onClick={onSubmit}>
            Сохранить урок
          </button>
        </div>
      </div>
    </div>
  );
};
