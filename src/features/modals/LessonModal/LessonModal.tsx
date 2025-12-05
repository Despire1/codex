import { addDays, addYears } from 'date-fns';
import { type FC, useMemo } from 'react';
import { LinkedStudent } from '../../../entities/types';
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';

interface LessonDraft {
  studentId: number | undefined;
  date: string;
  time: string;
  durationMinutes: number;
  isRecurring: boolean;
  repeatWeekdays: number[];
}

interface LessonModalProps {
  open: boolean;
  editingLessonId: number | null;
  defaultDuration: number;
  linkedStudents: LinkedStudent[];
  draft: LessonDraft;
  onDraftChange: (draft: LessonDraft) => void;
  onClose: () => void;
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

const countOccurrences = (startAt: Date, weekdays: number[]) => {
  if (Number.isNaN(startAt.getTime()) || weekdays.length === 0) return 0;
  const endDate = addYears(startAt, 1);
  let count = 0;

  for (let cursor = new Date(startAt); cursor <= endDate; cursor = addDays(cursor, 1)) {
    if (weekdays.includes(cursor.getUTCDay())) {
      count += 1;
    }
    if (count > 500) break;
  }

  return count;
};

export const LessonModal: FC<LessonModalProps> = ({
  open,
  editingLessonId,
  defaultDuration,
  linkedStudents,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}) => {
  if (!open) return null;

  const isEditing = Boolean(editingLessonId);
  const startAt = useMemo(
    () => new Date(`${draft.date || ''}T${draft.time || '00:00'}:00.000Z`),
    [draft.date, draft.time],
  );

  const recurrencesCount = useMemo(
    () => (draft.isRecurring ? countOccurrences(startAt, draft.repeatWeekdays) : 0),
    [draft.isRecurring, startAt, draft.repeatWeekdays],
  );

  const handleRecurringToggle = (checked: boolean) => {
    const currentDay = Number.isNaN(startAt.getTime()) ? undefined : startAt.getUTCDay();
    onDraftChange({
      ...draft,
      isRecurring: checked,
      repeatWeekdays: checked && draft.repeatWeekdays.length === 0 && currentDay !== undefined
        ? [currentDay]
        : checked
          ? draft.repeatWeekdays
          : [],
    });
  };

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
          <div className={controls.formRow} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <FormControl fullWidth>
              <InputLabel htmlFor="student-select">Ученик</InputLabel>
              <Select
                id="student-select"
                value={draft.studentId ?? ''}
                onChange={(e) =>
                  onDraftChange({ ...draft, studentId: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <MenuItem value="">Выберите ученика</MenuItem>
                {linkedStudents.map((student) => (
                  <MenuItem key={student.id} value={student.id}>
                    {student.link.customName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Дата"
              type="date"
              value={draft.date}
              onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
              fullWidth
            />
            <TextField
              label="Время"
              type="time"
              value={draft.time}
              onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
              fullWidth
            />
            <TextField
              label="Длительность (мин)"
              type="number"
              value={draft.durationMinutes}
              onChange={(e) => onDraftChange({ ...draft, durationMinutes: Number(e.target.value) })}
              placeholder={`${defaultDuration}`}
              fullWidth
            />
          </div>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.isRecurring}
                onChange={(e) => handleRecurringToggle(e.target.checked)}
                disabled={isEditing}
              />
            }
            label={isEditing ? 'Повтор доступен только при создании нового урока' : 'Сделать урок повторяющимся'}
          />
          {draft.isRecurring && !isEditing && (
            <Box>
              <Typography>Выберите дни недели для повтора</Typography>
              <ToggleButtonGroup
                value={draft.repeatWeekdays}
                onChange={(_, nextValue) => onDraftChange({ ...draft, repeatWeekdays: nextValue })}
              >
                {weekdayOptions.map((day) => (
                  <ToggleButton key={day.value} value={day.value} aria-label={`repeat-${day.label}`}>
                    {day.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption">
                Занятия будут запланированы до {addYears(startAt, 1).toISOString().slice(0, 10)} включительно.
              </Typography>
              {recurrencesCount > 0 && (
                <Typography variant="caption">Будет создано {recurrencesCount} занятий</Typography>
              )}
              {draft.repeatWeekdays.length === 0 && (
                <Typography variant="caption" className={controls.error}>
                  Отметьте хотя бы один день недели
                </Typography>
              )}
            </Box>
          )}
        </div>
        <div className={modalStyles.modalActions}>
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
