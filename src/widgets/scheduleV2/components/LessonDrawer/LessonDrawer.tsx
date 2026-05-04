import { type ChangeEvent, type FC, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addMinutes, format as formatDate } from 'date-fns';
import type { Attachment, Lesson, LessonFormat, LessonPlanItem, LinkedStudent } from '../../../../entities/types';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../../shared/lib/timezoneDates';
import {
  api,
  isApiRequestError,
  type ScheduleV2LessonDetail,
  type ScheduleV2LessonUpdatePayload,
} from '../../../../shared/api/client';
import { useToast } from '../../../../shared/lib/toast';
import {
  resolveHomeworkStorageUrl,
  uploadFileToHomeworkStorage,
} from '../../../../features/homework-submit/model/upload';
import {
  AddOutlinedIcon,
  CancelCircleOutlinedIcon,
  DeleteOutlineIcon,
  EditOutlinedIcon,
  ReplayOutlinedIcon,
  RotateIcon,
} from '../../../../icons/MaterialIcons';
import { HomeworkDownloadIcon } from '../../../../shared/ui/icons/HomeworkFaIcons';
import { Tooltip } from '../../../../shared/ui/Tooltip/Tooltip';
import { resolveLessonDeleteDisabledReason } from '../../../../entities/lesson/lib/lessonMutationGuards';
import { resolveLessonCancelActionCopy } from '../../../../entities/lesson/lib/lessonStatusPresentation';
import { useLessonActions } from '../../../../features/lessons/model/useLessonActions';
import {
  FORMAT_OPTIONS,
  formatDayLabel,
  formatLessonFormat,
  formatPriceRub,
  formatTime,
} from '../../lib/formatHelpers';
import { getLessonColorTheme } from '../../../../shared/lib/lessonColors';
import { LESSON_THEME_ACCENT, resolveLessonThemeKey } from '../../lib/lessonThemes';
import { resolveLessonNamesText } from '../../lib/lessonParticipants';
import { SeriesCallout } from './SeriesCallout';
import { AutoResizeTextarea } from './AutoResizeTextarea';
import styles from '../../ScheduleSectionV2.module.css';

type LocalLessonPatch = Partial<
  Pick<Lesson, 'topic' | 'format' | 'notes' | 'price' | 'planItems' | 'planItemsOverride' | 'attachments'>
>;

interface LessonDrawerProps {
  open: boolean;
  lesson: Lesson | null;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClose: () => void;
  onReschedule?: () => void;
  /** Запросить отмену — родитель показывает LessonCancelDialog с подтверждением. */
  onRequestCancel?: () => void;
  /** Запросить восстановление отменённого урока (для статуса CANCELED). */
  onRequestRestore?: () => void;
  /** Запросить удаление — родитель показывает диалог подтверждения. */
  onRequestDelete?: () => void;
  /** Отметить урок проведённым (status SCHEDULED → COMPLETED). */
  onMarkCompleted?: () => Promise<void> | void;
  /** Снять отметку «проведён» (COMPLETED → SCHEDULED). */
  onMarkScheduled?: () => Promise<void> | void;
  /** Optimistic update в родителе, чтобы view-cards мгновенно отразили изменения. */
  onLocalLessonPatch?: (lessonId: number, patch: LocalLessonPatch) => void;
}

interface DraftState {
  topic: string;
  format: LessonFormat | '';
  notes: string;
  price: number;
  planItemsOverride: LessonPlanItem[] | null; // null = inherit from series
  /** YYYY-MM-DD в TZ преподавателя. Меняется только для уроков без серии. */
  date: string;
  /** HH:mm в TZ преподавателя. */
  timeStart: string;
  /** HH:mm в TZ преподавателя. */
  timeEnd: string;
}

const computeDurationMinutes = (timeStart: string, timeEnd: string): number => {
  const [sh, sm] = timeStart.split(':').map((x) => Number(x));
  const [eh, em] = timeEnd.split(':').map((x) => Number(x));
  if (![sh, sm, eh, em].every((v) => Number.isFinite(v))) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff;
};

const addMinutesToTime = (timeStart: string, durationMinutes: number) => {
  const [h, m] = timeStart.split(':').map((x) => Number(x));
  if (![h, m].every((v) => Number.isFinite(v))) return timeStart;
  const total = h * 60 + m + durationMinutes;
  const hh = Math.floor((((total % (24 * 60)) + 24 * 60) % (24 * 60)) / 60);
  const mm = Math.floor(((total % 60) + 60) % 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(hh)}:${pad(mm)}`;
};

const resolveDisplayName = (lesson: Lesson, linkedStudentsById: Map<number, LinkedStudent>) =>
  resolveLessonNamesText(lesson, linkedStudentsById, 3);
const resolveAvatar = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

const resolveFileKindClass = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return styles.fileIconAudio;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return styles.fileIconImage;
  if (['doc', 'docx'].includes(ext)) return styles.fileIconDoc;
  return '';
};
const resolveFileBadge = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toUpperCase() ?? 'FILE';
  return ext.length > 4 ? ext.slice(0, 4) : ext;
};

const generateLocalId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const LessonDrawer: FC<LessonDrawerProps> = ({
  open,
  lesson,
  linkedStudentsById,
  timeZone,
  onClose,
  onReschedule,
  onRequestCancel,
  onRequestRestore,
  onRequestDelete,
  onMarkCompleted,
  onMarkScheduled,
  onLocalLessonPatch,
}) => {
  const { showToast } = useToast();
  const { openConfirmDialog, togglePaid } = useLessonActions();
  const [paidToggling, setPaidToggling] = useState(false);

  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<ScheduleV2LessonDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const datalistId = useRef(`v2-topics-${Math.random().toString(36).slice(2)}`);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; fileName: string }[]>([]);
  const [removingAttachmentIds, setRemovingAttachmentIds] = useState<Record<string, boolean>>({});

  /**
   * Точечные quick-edit стейты для секций «Заметки» и «План урока» — нужны,
   * чтобы можно было править отдельный блок без открытия общего edit-mode (по клику на «+» / карандаш).
   * notes: null = не активен, string = текст черновика.
   * plan: undefined = не активен, остальное — то же что в основном draft.planItemsOverride
   *       (null = inherit от серии, [] = осознанно пустой, [...] = override).
   */
  const [quickNotes, setQuickNotes] = useState<string | null>(null);
  const [quickPlan, setQuickPlan] = useState<LessonPlanItem[] | null | undefined>(undefined);
  const [quickSaving, setQuickSaving] = useState<'notes' | 'plan' | null>(null);
  const [pendingFocusPlanId, setPendingFocusPlanId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!pendingFocusPlanId) return;
    const el = document.querySelector<HTMLInputElement>(`[data-plan-item-input="${pendingFocusPlanId}"]`);
    if (el) el.focus();
    setPendingFocusPlanId(null);
    // seriesPlanDraft included so autofocus triggers when series-plan editor adds an item.
  }, [pendingFocusPlanId, quickPlan, draft?.planItemsOverride]);

  // Сбрасываем editor state при смене урока или закрытии.
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setDetails(null);
    setQuickNotes(null);
    setQuickPlan(undefined);
  }, [lesson?.id, open]);

  // Подгружаем v2-детали (план/материалы/topic/notes/format) при открытии drawer.
  useEffect(() => {
    if (!open || !lesson) return;
    let cancelled = false;
    setDetailsLoading(true);
    api
      .getLessonV2(lesson.id)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiRequestError(err)) showToast({ message: err.message, variant: 'error' });
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lesson?.id, showToast]);

  // История тем для autocomplete.
  useEffect(() => {
    if (!open || !lesson) return;
    let cancelled = false;
    api
      .listStudentTopicsV2(lesson.studentId)
      .then((res) => {
        if (cancelled) return;
        setTopicSuggestions(res.topics.map((t) => t.topic));
      })
      .catch(() => {
        // не критично
      });
    return () => {
      cancelled = true;
    };
  }, [open, lesson?.studentId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // ESC внутри edit-mode = откат правок (без guard — это и есть «не сохранять»).
      if (editing) {
        setDraft(null);
        setEditing(false);
        return;
      }
      if (quickNotes !== null) {
        setQuickNotes(null);
        return;
      }
      if (quickPlan !== undefined) {
        setQuickPlan(undefined);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing, quickNotes, quickPlan, onClose]);

  // ВАЖНО: все хуки выше любого early return, иначе React падает
  // с "Rendered more hooks than during the previous render".
  const planForView = details?.planItems ?? lesson?.planItems ?? [];
  const seriesPlan = details?.seriesPlanItems ?? null;
  const planForEdit = useMemo(() => {
    if (!draft) return planForView;
    if (draft.planItemsOverride !== null) return draft.planItemsOverride;
    return seriesPlan ?? [];
  }, [draft, planForView, seriesPlan]);

  // План серии: state до early-return, иначе нарушаем порядок хуков.
  const [seriesPlanDraft, setSeriesPlanDraft] = useState<LessonPlanItem[] | null>(null);
  const [seriesPlanSaving, setSeriesPlanSaving] = useState(false);

  if (!lesson) return <aside className={styles.drawer} aria-hidden="true" />;

  const z = toZonedDate(lesson.startAt, timeZone);
  const end = addMinutes(z, lesson.durationMinutes);
  const dayText = formatDayLabel(z);
  const timeText = `${formatTime(z)} – ${formatTime(end)} (${lesson.durationMinutes} мин)`;
  const formatViewText = formatLessonFormat(details?.format ?? lesson.format ?? null, lesson.meetingLink);
  const priceText = formatPriceRub(lesson.price ?? 0);
  const isPaid = lesson.isPaid || lesson.paymentStatus === 'PAID';
  const displayName = resolveDisplayName(lesson, linkedStudentsById);

  const planSource = details?.planSource ?? null;
  const attachments = details?.attachments ?? lesson.attachments ?? [];

  const studentLink = linkedStudentsById.get(lesson.studentId);
  const uiColor =
    studentLink?.link.uiColor ||
    (lesson.color ? getLessonColorTheme(lesson.color).hoverBackground : null) ||
    LESSON_THEME_ACCENT[resolveLessonThemeKey(lesson)];

  /**
   * Form-guard: считаем что несохранённые изменения есть, если активен любой из режимов:
   *   • глобальный editing с draft (любые поля могли быть изменены — без честного diff
   *     рассматриваем сам факт открытия draft как «потенциально dirty»);
   *   • quick-edit для notes (quickNotes !== null);
   *   • quick-edit для plan (quickPlan !== undefined).
   * Materials мы сразу сохраняем в БД (real-time), они в guard не участвуют.
   */
  const quickNotesDirty = (() => {
    if (quickNotes === null) return false;
    const initial = details?.notes ?? lesson?.notes ?? '';
    return quickNotes !== initial;
  })();
  const quickPlanDirty = (() => {
    if (quickPlan === undefined) return false;
    const initial = details?.planItemsOverride ?? null;
    if (quickPlan === null && initial === null) return false;
    if (quickPlan === null || initial === null) return true;
    if (quickPlan.length !== initial.length) return true;
    return quickPlan.some((it, i) => {
      const j = initial[i];
      return !j || j.id !== it.id || j.text !== it.text || j.completed !== it.completed;
    });
  })();
  const hasUnsavedChanges = editing || quickNotesDirty || quickPlanDirty;

  const saveAllPending = async () => {
    // Сохраняем последовательно, чтобы избежать гонок и видеть человекочитаемую ошибку.
    try {
      if (editing) await saveEdit();
      if (quickNotes !== null) await saveQuickNotes();
      if (quickPlan !== undefined) await saveQuickPlan();
      return true;
    } catch {
      return false;
    }
  };

  const requestClose = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    openConfirmDialog({
      title: 'Сохранить изменения?',
      message: 'У урока есть несохранённые правки. Сохранить перед закрытием?',
      confirmText: 'Сохранить',
      cancelText: 'Не сохранять',
      onConfirm: async () => {
        const ok = await saveAllPending();
        if (ok) onClose();
      },
      onCancel: () => onClose(),
    });
  };

  const startEdit = () => {
    if (!lesson) return;
    const zStart = toZonedDate(lesson.startAt, timeZone);
    const zEnd = addMinutes(zStart, lesson.durationMinutes);
    setDraft({
      topic: details?.topic ?? lesson.topic ?? '',
      format: (details?.format ?? lesson.format ?? '') as LessonFormat | '',
      notes: details?.notes ?? lesson.notes ?? '',
      price: lesson.price ?? 0,
      planItemsOverride: details?.planItemsOverride ?? null,
      date: formatDate(zStart, 'yyyy-MM-dd'),
      timeStart: formatDate(zStart, 'HH:mm'),
      timeEnd: formatDate(zEnd, 'HH:mm'),
    });
    setQuickNotes(null);
    setQuickPlan(undefined);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setQuickNotes(null);
    setQuickPlan(undefined);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!draft || !lesson) return;
    setSaving(true);
    const payload: ScheduleV2LessonUpdatePayload = {
      topic: draft.topic.trim() === '' ? null : draft.topic.trim(),
      format: draft.format === '' ? null : draft.format,
      notes: draft.notes === '' ? null : draft.notes,
      price: Math.max(0, Math.trunc(Number(draft.price) || 0)),
      planItemsOverride: draft.planItemsOverride,
    };

    // Date/Time правки разрешены только для уроков без серии (см. backend).
    const canEditDateTime = !lesson.seriesId;
    if (canEditDateTime) {
      const originalZ = toZonedDate(lesson.startAt, timeZone);
      const originalDate = formatDate(originalZ, 'yyyy-MM-dd');
      const originalTime = formatDate(originalZ, 'HH:mm');
      const newDuration = computeDurationMinutes(draft.timeStart, draft.timeEnd);
      const dateTimeChanged = draft.date !== originalDate || draft.timeStart !== originalTime;
      const durationChanged = newDuration > 0 && newDuration !== lesson.durationMinutes;
      if (dateTimeChanged) {
        try {
          const newStart = toUtcDateFromTimeZone(draft.date, draft.timeStart, timeZone);
          payload.startAt = newStart.toISOString();
        } catch {
          showToast({ message: 'Некорректные дата или время', variant: 'error' });
          setSaving(false);
          return;
        }
      }
      if (durationChanged) {
        if (newDuration < 5 || newDuration > 24 * 60) {
          showToast({ message: 'Длительность должна быть от 5 минут до 24 часов', variant: 'error' });
          setSaving(false);
          return;
        }
        payload.durationMinutes = newDuration;
      }
    }

    try {
      const updated = await api.updateLessonV2(lesson.id, payload);
      setDetails(updated);
      // Прокидываем optimistic patch родителю.
      const localPatch: Parameters<NonNullable<typeof onLocalLessonPatch>>[1] = {
        topic: updated.topic,
        format: updated.format,
        notes: updated.notes,
        price: payload.price,
        planItems: updated.planItems,
        planItemsOverride: updated.planItemsOverride,
      };
      if (payload.startAt) (localPatch as Record<string, unknown>).startAt = payload.startAt;
      if (payload.durationMinutes) (localPatch as Record<string, unknown>).durationMinutes = payload.durationMinutes;
      onLocalLessonPatch?.(lesson.id, localPatch);
      setDraft(null);
      setEditing(false);
      showToast({ message: 'Изменения сохранены', variant: 'success' });
    } catch (err) {
      const message = isApiRequestError(err) ? err.message : 'Не удалось сохранить';
      showToast({ message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Plan items helpers — работают над draft.
  const ensureOverrideMode = (mutate: (items: LessonPlanItem[]) => LessonPlanItem[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const base = prev.planItemsOverride ?? seriesPlan ?? [];
      return { ...prev, planItemsOverride: mutate(base) };
    });
  };
  const togglePlanItem = (id: string) =>
    ensureOverrideMode((items) => items.map((it) => (it.id === id ? { ...it, completed: !it.completed } : it)));
  const editPlanItem = (id: string, text: string) =>
    ensureOverrideMode((items) => items.map((it) => (it.id === id ? { ...it, text } : it)));
  const removePlanItem = (id: string) => ensureOverrideMode((items) => items.filter((it) => it.id !== id));
  const addPlanItem = () => {
    const newId = generateLocalId();
    ensureOverrideMode((items) => [...items, { id: newId, text: '', completed: false }]);
    setPendingFocusPlanId(newId);
  };
  const restoreSeriesPlan = () => setDraft((prev) => (prev ? { ...prev, planItemsOverride: null } : prev));

  // Переключить чекбокс пункта плана прямо из view-state, без открытия редактора.
  // Сохраняем сразу в БД через PATCH planItemsOverride. Если override === null,
  // сначала клонируем план серии, чтобы локальный toggle не затрагивал общий план.
  const togglePlanItemFromView = async (itemId: string) => {
    if (!lesson) return;
    const baseItems = details?.planItemsOverride ?? details?.seriesPlanItems ?? lesson.planItems ?? [];
    const next = baseItems.map((it) => (it.id === itemId ? { ...it, completed: !it.completed } : it));
    // Optimistic update в details.
    setDetails((prev) => (prev ? { ...prev, planItems: next, planItemsOverride: next } : prev));
    try {
      const updated = await api.updateLessonV2(lesson.id, { planItemsOverride: next });
      setDetails(updated);
      onLocalLessonPatch?.(lesson.id, {
        planItems: updated.planItems,
        planItemsOverride: updated.planItemsOverride,
      });
    } catch (err) {
      // Откатываем состояние при ошибке.
      setDetails((prev) =>
        prev ? { ...prev, planItems: baseItems, planItemsOverride: details?.planItemsOverride ?? null } : prev,
      );
      const message = isApiRequestError(err) ? err.message : 'Не удалось сохранить';
      showToast({ message, variant: 'error' });
    }
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!lesson) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // позволить выбрать тот же файл повторно
    if (files.length === 0) return;
    for (const file of files) {
      const tempId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setUploadingFiles((prev) => [...prev, { id: tempId, fileName: file.name }]);
      try {
        const uploaded = await uploadFileToHomeworkStorage(file, 'homework-student-attachment', {
          kind: 'lesson',
          lessonId: lesson.id,
        });
        const persisted = await api.addLessonAttachmentV2(lesson.id, {
          fileName: uploaded.fileName,
          size: uploaded.size,
          url: uploaded.url,
          fileObjectId: uploaded.fileObjectId,
        });
        setDetails((prev) => {
          if (!prev) return prev;
          const next: Attachment = {
            id: persisted.id,
            fileName: persisted.fileName,
            url: persisted.url,
            size: persisted.size,
            fileObjectId: persisted.fileObjectId ?? undefined,
          };
          return { ...prev, attachments: [...prev.attachments, next] };
        });
      } catch (err) {
        const message = isApiRequestError(err) ? err.message : err instanceof Error ? err.message : 'upload_failed';
        showToast({ message: `Не удалось загрузить «${file.name}»: ${message}`, variant: 'error' });
      } finally {
        setUploadingFiles((prev) => prev.filter((u) => u.id !== tempId));
      }
    }
  };

  // === Quick-edit handlers для секций ===
  const openQuickNotes = () => {
    if (editing) return;
    setQuickNotes(details?.notes ?? lesson?.notes ?? '');
  };
  const cancelQuickNotes = () => setQuickNotes(null);
  const saveQuickNotes = async () => {
    if (!lesson || quickNotes === null) return;
    setQuickSaving('notes');
    try {
      const updated = await api.updateLessonV2(lesson.id, {
        notes: quickNotes.trim() === '' ? null : quickNotes,
      });
      setDetails(updated);
      onLocalLessonPatch?.(lesson.id, { notes: updated.notes });
      setQuickNotes(null);
      showToast({ message: 'Заметки сохранены', variant: 'success' });
    } catch (err) {
      const message = isApiRequestError(err) ? err.message : 'Не удалось сохранить';
      showToast({ message, variant: 'error' });
    } finally {
      setQuickSaving(null);
    }
  };

  const openQuickPlan = () => {
    if (editing) return;
    // null = inherit, [] = пустой override, [...] = override
    setQuickPlan(details?.planItemsOverride ?? null);
  };
  const cancelQuickPlan = () => setQuickPlan(undefined);
  const saveQuickPlan = async () => {
    if (!lesson || quickPlan === undefined) return;
    setQuickSaving('plan');
    try {
      const updated = await api.updateLessonV2(lesson.id, { planItemsOverride: quickPlan });
      setDetails(updated);
      onLocalLessonPatch?.(lesson.id, {
        planItems: updated.planItems,
        planItemsOverride: updated.planItemsOverride,
      });
      setQuickPlan(undefined);
      showToast({ message: 'План урока сохранён', variant: 'success' });
    } catch (err) {
      const message = isApiRequestError(err) ? err.message : 'Не удалось сохранить';
      showToast({ message, variant: 'error' });
    } finally {
      setQuickSaving(null);
    }
  };

  // План серии: state объявлен выше (до early-return). Здесь — handlers.
  const isSeriesPlanEditing = seriesPlanDraft !== null;
  const openSeriesPlanEdit = () => {
    if (editing || quickPlan !== undefined) return;
    setSeriesPlanDraft(details?.seriesPlanItems ?? []);
  };
  const cancelSeriesPlanEdit = () => setSeriesPlanDraft(null);
  const saveSeriesPlan = async () => {
    if (!lesson?.seriesId || seriesPlanDraft === null) return;
    setSeriesPlanSaving(true);
    try {
      const result = await api.updateSeriesPlanV2(lesson.seriesId, seriesPlanDraft);
      setDetails((prev) => (prev ? { ...prev, seriesPlanItems: result.planItems } : prev));
      setSeriesPlanDraft(null);
      showToast({ message: 'План серии сохранён', variant: 'success' });
    } catch (err) {
      const message = isApiRequestError(err) ? err.message : 'Не удалось сохранить';
      showToast({ message, variant: 'error' });
    } finally {
      setSeriesPlanSaving(false);
    }
  };
  const editSeriesPlanItem = (id: string, text: string) =>
    setSeriesPlanDraft((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, text } : it)) : prev));
  const removeSeriesPlanItem = (id: string) =>
    setSeriesPlanDraft((prev) => (prev ? prev.filter((it) => it.id !== id) : prev));
  const toggleSeriesPlanItem = (id: string) =>
    setSeriesPlanDraft((prev) =>
      prev ? prev.map((it) => (it.id === id ? { ...it, completed: !it.completed } : it)) : prev,
    );
  const addSeriesPlanItem = () => {
    const newId = generateLocalId();
    setSeriesPlanDraft((prev) => [...(prev ?? []), { id: newId, text: '', completed: false }]);
    setPendingFocusPlanId(newId);
  };

  // Inline-операции над quickPlan (override-режимом). Если quickPlan === null —
  // берём план серии как базу и копируем его в override при первой правке.
  const ensureQuickPlanOverride = (mutate: (items: LessonPlanItem[]) => LessonPlanItem[]) => {
    setQuickPlan((prev) => {
      const base = prev === null || prev === undefined ? (details?.seriesPlanItems ?? []) : prev;
      return mutate(base);
    });
  };
  const toggleQuickPlanItem = (id: string) =>
    ensureQuickPlanOverride((items) => items.map((it) => (it.id === id ? { ...it, completed: !it.completed } : it)));
  const editQuickPlanItem = (id: string, text: string) =>
    ensureQuickPlanOverride((items) => items.map((it) => (it.id === id ? { ...it, text } : it)));
  const removeQuickPlanItem = (id: string) => ensureQuickPlanOverride((items) => items.filter((it) => it.id !== id));
  const addQuickPlanItem = () => {
    const newId = generateLocalId();
    ensureQuickPlanOverride((items) => [...items, { id: newId, text: '', completed: false }]);
    setPendingFocusPlanId(newId);
  };
  const restoreQuickPlanSeries = () => setQuickPlan(null);

  const downloadAttachment = (attachment: { url: string; fileName: string }) => {
    if (typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = resolveHomeworkStorageUrl(attachment.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = attachment.fileName || 'file';
    document.body.append(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!lesson) return;
    setRemovingAttachmentIds((prev) => ({ ...prev, [attachmentId]: true }));
    try {
      await api.removeLessonAttachmentV2(lesson.id, attachmentId);
      setDetails((prev) =>
        prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev,
      );
    } catch (err) {
      const message = isApiRequestError(err) ? err.message : 'Не удалось удалить файл';
      showToast({ message, variant: 'error' });
    } finally {
      setRemovingAttachmentIds((prev) => {
        const next = { ...prev };
        delete next[attachmentId];
        return next;
      });
    }
  };

  return (
    <aside
      className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
      aria-hidden={!open}
      data-state={editing ? 'edit' : 'view'}
    >
      <div className={styles.drawerOverlay} onClick={requestClose} />
      <div className={styles.drawerPanel} role="dialog" aria-modal="true">
        <header className={styles.drawerHead}>
          <div className={styles.drawerHeadLeft}>
            <span className={styles.drawerAvatar} style={{ background: uiColor, color: '#fff' }}>
              {resolveAvatar(displayName)}
            </span>
            <div className={styles.drawerHeadText}>
              <h3 className={styles.drawerName}>{displayName}</h3>
              <p className={styles.drawerSubj}>
                {(editing ? draft?.topic : (details?.topic ?? lesson.topic)) || 'Без темы'}
              </p>
            </div>
          </div>
          <div className={styles.drawerHeadActions}>
            {!editing && lesson.status === 'SCHEDULED' && onMarkCompleted ? (
              <Tooltip content="Отметить проведённым">
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  aria-label="Отметить проведённым"
                  onClick={() => void onMarkCompleted()}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                </button>
              </Tooltip>
            ) : null}
            {!editing && lesson.status === 'COMPLETED' && onMarkScheduled ? (
              <Tooltip content="Снять отметку «проведён»">
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  aria-label="Снять отметку «проведён»"
                  onClick={() => void onMarkScheduled()}
                >
                  {/* Material Undo: дугообразная стрелка возврата — ясно читается как «отменить» */}
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
                  </svg>
                </button>
              </Tooltip>
            ) : null}
            <button type="button" className={styles.drawerIconBtn} aria-label="Закрыть" onClick={requestClose}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </header>

        <div
          className={styles.drawerBody}
          aria-busy={detailsLoading && details === null}
          style={detailsLoading && details === null ? { opacity: 0.55 } : undefined}
        >
          {editing && lesson.seriesId ? <SeriesCallout onReschedule={onReschedule} /> : null}
          <div className={styles.row}>
            <span className={styles.rowLabel}>Дата</span>
            {editing && draft && !lesson.seriesId ? (
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                style={{
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--sv2-border-default)',
                  background: 'var(--sv2-surface-card)',
                  width: 160,
                }}
              />
            ) : (
              <span className={styles.rowValue}>{dayText}</span>
            )}
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Время</span>
            {editing && draft && !lesson.seriesId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="time"
                  value={draft.timeStart}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setDraft((prev) => {
                      if (!prev) return prev;
                      // Сохраняем длительность при изменении старта.
                      const dur = computeDurationMinutes(prev.timeStart, prev.timeEnd);
                      return {
                        ...prev,
                        timeStart: newStart,
                        timeEnd: dur > 0 ? addMinutesToTime(newStart, dur) : prev.timeEnd,
                      };
                    });
                  }}
                  style={{
                    fontSize: 13,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--sv2-border-default)',
                    width: 100,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span style={{ color: 'var(--sv2-text-muted)' }}>–</span>
                <input
                  type="time"
                  value={draft.timeEnd}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, timeEnd: e.target.value } : prev))}
                  style={{
                    fontSize: 13,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--sv2-border-default)',
                    width: 100,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </span>
            ) : (
              <span className={styles.rowValue}>{timeText}</span>
            )}
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Формат</span>
            {editing && draft ? (
              <select
                value={draft.format}
                onChange={(e) =>
                  setDraft((prev) => (prev ? { ...prev, format: e.target.value as LessonFormat | '' } : prev))
                }
                style={{
                  fontSize: 13,
                  padding: '6px 28px 6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--sv2-border-default)',
                  background:
                    "var(--sv2-surface-card) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23667085' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\") no-repeat right 10px center",
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  fontFamily: 'inherit',
                  color: 'var(--sv2-text-primary)',
                  cursor: 'pointer',
                  minWidth: 180,
                }}
              >
                <option value="">Без формата</option>
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.rowValue}>{formatViewText}</span>
            )}
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Стоимость</span>
            {editing && draft ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={draft.price}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, price: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : prev,
                    )
                  }
                  style={{
                    width: 110,
                    fontSize: 13,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--sv2-border-default)',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span style={{ color: 'var(--sv2-text-muted)' }}>₽</span>
              </span>
            ) : (
              <span className={styles.rowValue}>
                {priceText}
                <button
                  type="button"
                  className={`${styles.pill} ${isPaid ? styles.pillOk : styles.pillWarn}`}
                  onClick={async () => {
                    if (paidToggling) return;
                    setPaidToggling(true);
                    try {
                      await togglePaid(lesson.id, lesson.studentId, { currentIsPaid: isPaid });
                    } finally {
                      setPaidToggling(false);
                    }
                  }}
                  disabled={paidToggling}
                  aria-label={isPaid ? 'Снять отметку оплаты' : 'Отметить как оплачен'}
                  style={{
                    cursor: paidToggling ? 'wait' : 'pointer',
                    opacity: paidToggling ? 0.6 : 1,
                    border: 0,
                    font: 'inherit',
                  }}
                >
                  {isPaid ? 'Оплачен' : 'Не оплачен'}
                </button>
              </span>
            )}
          </div>

          {/* Тема (с автокомплитом) — только в edit-state */}
          {editing && draft ? (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Тема</span>
              <input
                type="text"
                list={datalistId.current}
                value={draft.topic}
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, topic: e.target.value } : prev))}
                placeholder="Например, Past Simple"
                style={{
                  width: 220,
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--sv2-border-default)',
                }}
              />
              <datalist id={datalistId.current}>
                {topicSuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          ) : null}

          {/* План урока */}
          {(() => {
            const isPlanQuickEdit = !editing && quickPlan !== undefined;
            const isPlanInteractive = editing || isPlanQuickEdit || isSeriesPlanEditing;
            // Источник элементов плана для разных режимов:
            //   • series-plan editing → seriesPlanDraft (общий план серии)
            //   • global edit → planForEdit (учитывает draft)
            //   • quick-edit → quickPlan (override) либо seriesPlanItems если quickPlan === null
            //   • view → planForView
            const planActiveItems = isSeriesPlanEditing
              ? (seriesPlanDraft ?? [])
              : editing
                ? planForEdit
                : isPlanQuickEdit
                  ? (quickPlan ?? details?.seriesPlanItems ?? [])
                  : planForView;
            const planOverrideActive = editing
              ? draft?.planItemsOverride !== null
              : isPlanQuickEdit
                ? quickPlan !== null
                : false;
            const planToggle = isSeriesPlanEditing
              ? toggleSeriesPlanItem
              : isPlanQuickEdit
                ? toggleQuickPlanItem
                : togglePlanItem;
            const planEditItem = isSeriesPlanEditing
              ? editSeriesPlanItem
              : isPlanQuickEdit
                ? editQuickPlanItem
                : editPlanItem;
            const planRemoveItem = isSeriesPlanEditing
              ? removeSeriesPlanItem
              : isPlanQuickEdit
                ? removeQuickPlanItem
                : removePlanItem;
            const planAddItem = isSeriesPlanEditing
              ? addSeriesPlanItem
              : isPlanQuickEdit
                ? addQuickPlanItem
                : addPlanItem;
            const planRestoreSeries = isPlanQuickEdit ? restoreQuickPlanSeries : restoreSeriesPlan;
            const planSavingNow = isSeriesPlanEditing ? seriesPlanSaving : quickSaving === 'plan';

            return (
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h4 className={styles.sectionTitle}>
                    {isSeriesPlanEditing ? 'План серии' : 'План урока'}
                    {planSource === 'series' && !isPlanInteractive ? (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--sv2-text-muted)', fontWeight: 500 }}>
                        из серии
                      </span>
                    ) : null}
                    {!isSeriesPlanEditing && isPlanInteractive && planOverrideActive && lesson.seriesId ? (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#be123c', fontWeight: 500 }}>свой план</span>
                    ) : null}
                  </h4>
                  <div className={styles.sectionActions}>
                    {!isSeriesPlanEditing && isPlanInteractive && planOverrideActive && lesson.seriesId ? (
                      <Tooltip content="Вернуться к плану серии">
                        <button
                          type="button"
                          className={styles.sectionAction}
                          onClick={planRestoreSeries}
                          aria-label="Вернуть план серии"
                        >
                          <ReplayOutlinedIcon width={14} height={14} />
                        </button>
                      </Tooltip>
                    ) : null}
                    {!editing && !isPlanQuickEdit && !isSeriesPlanEditing ? (
                      <Tooltip content="Редактировать план урока">
                        <button
                          type="button"
                          className={styles.sectionAction}
                          onClick={openQuickPlan}
                          aria-label="Редактировать план"
                        >
                          <EditOutlinedIcon width={14} height={14} />
                        </button>
                      </Tooltip>
                    ) : null}
                    {!editing && !isPlanQuickEdit && !isSeriesPlanEditing && lesson.seriesId ? (
                      <Tooltip content="Редактировать план серии">
                        <button
                          type="button"
                          className={styles.sectionAction}
                          onClick={openSeriesPlanEdit}
                          aria-label="Редактировать план серии"
                        >
                          <RotateIcon width={14} height={14} />
                        </button>
                      </Tooltip>
                    ) : null}
                    {isPlanQuickEdit ? (
                      <>
                        <Tooltip content="Сохранить">
                          <button
                            type="button"
                            className={`${styles.sectionAction} ${styles.sectionActionPrimary}`}
                            onClick={() => void saveQuickPlan()}
                            disabled={planSavingNow}
                            aria-label="Сохранить план"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                            </svg>
                          </button>
                        </Tooltip>
                        <Tooltip content="Отмена">
                          <button
                            type="button"
                            className={styles.sectionAction}
                            onClick={cancelQuickPlan}
                            disabled={planSavingNow}
                            aria-label="Отменить правку плана"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                          </button>
                        </Tooltip>
                      </>
                    ) : null}
                    {isSeriesPlanEditing ? (
                      <>
                        <Tooltip content="Сохранить план серии">
                          <button
                            type="button"
                            className={`${styles.sectionAction} ${styles.sectionActionPrimary}`}
                            onClick={() => void saveSeriesPlan()}
                            disabled={planSavingNow}
                            aria-label="Сохранить план серии"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                            </svg>
                          </button>
                        </Tooltip>
                        <Tooltip content="Отмена">
                          <button
                            type="button"
                            className={styles.sectionAction}
                            onClick={cancelSeriesPlanEdit}
                            disabled={planSavingNow}
                            aria-label="Отменить правку плана серии"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                          </button>
                        </Tooltip>
                      </>
                    ) : null}
                  </div>
                </div>

                {isPlanInteractive ? (
                  planActiveItems.length === 0 ? (
                    <p className={`${styles.notesView} ${styles.notesEmpty}`}>Пока нет пунктов</p>
                  ) : (
                    <ul className={styles.checklist}>
                      {planActiveItems.map((item) => (
                        <li
                          key={item.id}
                          className={`${styles.checkItem} ${item.completed ? styles.checkItemDone : ''}`}
                        >
                          <button
                            type="button"
                            className={`${styles.check} ${item.completed ? styles.checkChecked : ''}`}
                            aria-label={item.completed ? 'Отметить невыполненным' : 'Отметить выполненным'}
                            onClick={() => planToggle(item.id)}
                          />
                          <input
                            type="text"
                            data-plan-item-input={item.id}
                            value={item.text}
                            onChange={(e) => planEditItem(item.id, e.target.value)}
                            placeholder="Введите пункт плана"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              padding: '4px 8px',
                              border: '1px solid transparent',
                              borderRadius: 6,
                              background: 'transparent',
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = 'var(--sv2-border-default)';
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = 'transparent';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => planRemoveItem(item.id)}
                            aria-label="Удалить"
                            title="Удалить"
                            style={{
                              width: 22,
                              height: 22,
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--sv2-text-muted)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : planForView.length === 0 ? (
                  <p className={`${styles.notesView} ${styles.notesEmpty}`}>План пока не задан</p>
                ) : (
                  <ul className={styles.checklist}>
                    {planForView.map((item) => (
                      <li key={item.id} className={`${styles.checkItem} ${item.completed ? styles.checkItemDone : ''}`}>
                        <button
                          type="button"
                          className={`${styles.check} ${item.completed ? styles.checkChecked : ''}`}
                          aria-label={item.completed ? 'Отметить невыполненным' : 'Отметить выполненным'}
                          onClick={() => void togglePlanItemFromView(item.id)}
                        />
                        <span className={styles.checkText}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {isPlanInteractive ? (
                  <button
                    type="button"
                    onClick={planAddItem}
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      border: '1px dashed var(--sv2-border-strong)',
                      background: 'transparent',
                      color: 'var(--sv2-text-secondary)',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Добавить пункт
                  </button>
                ) : null}
              </div>
            );
          })()}

          {/* Материалы — upload работает в реал-тайме (без save), '+' доступен и в view-state. */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h4 className={styles.sectionTitle}>Материалы</h4>
              <div className={styles.sectionActions}>
                <Tooltip content="Прикрепить файл">
                  <button
                    type="button"
                    className={styles.sectionAction}
                    onClick={handlePickFile}
                    aria-label="Прикрепить файл"
                  >
                    <AddOutlinedIcon width={14} height={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFilesSelected} />
            {attachments.length === 0 && uploadingFiles.length === 0 ? (
              <p className={`${styles.notesView} ${styles.notesEmpty}`}>
                {detailsLoading ? 'Загрузка…' : 'Материалы не прикреплены'}
              </p>
            ) : (
              <div className={styles.files}>
                {attachments.map((file) => {
                  const isRemoving = !!removingAttachmentIds[file.id];
                  return (
                    <div key={file.id} className={styles.file} style={{ opacity: isRemoving ? 0.5 : 1 }}>
                      <a
                        href={resolveHomeworkStorageUrl(file.url)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 10,
                          flex: 1,
                          minWidth: 0,
                          textDecoration: 'none',
                          color: 'inherit',
                        }}
                      >
                        <span className={`${styles.fileIcon} ${resolveFileKindClass(file.fileName)}`}>
                          {resolveFileBadge(file.fileName)}
                        </span>
                        <span className={styles.fileName}>{file.fileName}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => downloadAttachment(file)}
                        disabled={isRemoving}
                        aria-label={`Скачать файл ${file.fileName}`}
                        title="Скачать"
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--sv2-text-muted)',
                          borderRadius: 6,
                          cursor: isRemoving ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <HomeworkDownloadIcon size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(file.id)}
                        disabled={isRemoving}
                        aria-label="Удалить файл"
                        title="Удалить файл"
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--sv2-text-muted)',
                          borderRadius: 6,
                          cursor: isRemoving ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {uploadingFiles.map((u) => (
                  <div key={u.id} className={styles.file} style={{ opacity: 0.65 }}>
                    <span className={styles.fileIcon}>···</span>
                    <span className={styles.fileName}>{u.fileName}</span>
                    <span style={{ fontSize: 11, color: 'var(--sv2-text-muted)' }}>загрузка…</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Заметки */}
          {(() => {
            const isNotesQuickEdit = !editing && quickNotes !== null;
            const notesSavingNow = quickSaving === 'notes';
            const currentNotes = details?.notes ?? lesson.notes ?? '';
            const hasNotes = Boolean(currentNotes);
            return (
              <div className={styles.section}>
                <div className={styles.sectionHead}>
                  <h4 className={styles.sectionTitle}>Заметки</h4>
                  <div className={styles.sectionActions}>
                    {!editing && !isNotesQuickEdit ? (
                      <Tooltip content={hasNotes ? 'Редактировать заметку' : 'Добавить заметку'}>
                        <button
                          type="button"
                          className={styles.sectionAction}
                          onClick={openQuickNotes}
                          aria-label={hasNotes ? 'Редактировать заметку' : 'Добавить заметку'}
                        >
                          {hasNotes ? (
                            <EditOutlinedIcon width={14} height={14} />
                          ) : (
                            <AddOutlinedIcon width={14} height={14} />
                          )}
                        </button>
                      </Tooltip>
                    ) : null}
                    {isNotesQuickEdit ? (
                      <>
                        <Tooltip content="Сохранить">
                          <button
                            type="button"
                            className={`${styles.sectionAction} ${styles.sectionActionPrimary}`}
                            onClick={() => void saveQuickNotes()}
                            disabled={notesSavingNow}
                            aria-label="Сохранить заметку"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                            </svg>
                          </button>
                        </Tooltip>
                        <Tooltip content="Отмена">
                          <button
                            type="button"
                            className={styles.sectionAction}
                            onClick={cancelQuickNotes}
                            disabled={notesSavingNow}
                            aria-label="Отменить правку заметки"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                          </button>
                        </Tooltip>
                      </>
                    ) : null}
                  </div>
                </div>
                {editing && draft ? (
                  <AutoResizeTextarea
                    value={draft.notes}
                    onChange={(v) => setDraft((prev) => (prev ? { ...prev, notes: v } : prev))}
                    placeholder="Личные заметки об уроке…"
                  />
                ) : isNotesQuickEdit ? (
                  <AutoResizeTextarea
                    autoFocus
                    value={quickNotes ?? ''}
                    onChange={(v) => setQuickNotes(v)}
                    placeholder="Личные заметки об уроке…"
                    disabled={notesSavingNow}
                  />
                ) : hasNotes ? (
                  <p className={styles.notesView}>{currentNotes}</p>
                ) : (
                  <p className={`${styles.notesView} ${styles.notesEmpty}`}>Нет заметок</p>
                )}
              </div>
            );
          })()}
        </div>

        {!editing ? (
          (() => {
            const cancelCopy = resolveLessonCancelActionCopy(lesson);
            const isCanceled = lesson.status === 'CANCELED';
            const deleteDisabledReason = resolveLessonDeleteDisabledReason(lesson);
            const cancelLabel = isCanceled ? 'Восстановить урок' : cancelCopy.actionLabel;
            return (
              <footer className={styles.drawerFoot}>
                {onReschedule ? (
                  <Tooltip content="Перенести">
                    <button type="button" className={styles.footIconBtn} aria-label="Перенести" onClick={onReschedule}>
                      <RotateIcon width={14} height={14} />
                    </button>
                  </Tooltip>
                ) : null}
                {isCanceled && onRequestRestore ? (
                  <Tooltip content="Восстановить">
                    <button
                      type="button"
                      className={styles.footIconBtn}
                      aria-label={cancelLabel}
                      onClick={onRequestRestore}
                    >
                      <ReplayOutlinedIcon width={16} height={16} />
                    </button>
                  </Tooltip>
                ) : null}
                {!isCanceled && onRequestCancel ? (
                  <Tooltip content={cancelLabel}>
                    <button
                      type="button"
                      className={`${styles.footIconBtn} ${styles.footIconBtnDanger}`}
                      aria-label={cancelLabel}
                      onClick={onRequestCancel}
                    >
                      <CancelCircleOutlinedIcon width={16} height={16} />
                    </button>
                  </Tooltip>
                ) : null}
                {onRequestDelete ? (
                  <Tooltip content={deleteDisabledReason ?? 'Удалить'}>
                    <button
                      type="button"
                      className={`${styles.footIconBtn} ${styles.footIconBtnDanger}`}
                      aria-label="Удалить"
                      disabled={Boolean(deleteDisabledReason)}
                      onClick={onRequestDelete}
                    >
                      <DeleteOutlineIcon width={16} height={16} />
                    </button>
                  </Tooltip>
                ) : null}
                <span className={styles.footSpacer} />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnPrimaryWide}`}
                  onClick={startEdit}
                >
                  Редактировать
                </button>
              </footer>
            );
          })()
        ) : (
          <footer className={styles.drawerFoot}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={cancelEdit} disabled={saving}>
              Отмена
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveEdit} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </footer>
        )}
      </div>
    </aside>
  );
};
