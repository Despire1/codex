import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { addMinutes, addYears, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../../../shared/api/client';
import {
  isVisibleLesson,
  resolveLessonAllowsLimitedMetadataEdit,
  resolveLessonDeleteDisabledReason,
  resolveLessonEditDisabledReason,
  resolveLessonMutationDisabledReason,
} from '../../../entities/lesson/lib/lessonMutationGuards';
import { DEFAULT_LESSON_COLOR } from '../../../shared/lib/lessonColors';
import { normalizeMeetingLinkInput } from '../../../shared/lib/meetingLink';
import { normalizeLesson, todayISO } from '../../../shared/lib/normalizers';
import { addMinutesToTime, diffTimeMinutes } from '../../../shared/lib/timeFields';
import {
  formatInTimeZone,
  toUtcEndOfDay,
  toUtcDateFromDate,
  toUtcDateFromTimeZone,
  toZonedDate,
} from '../../../shared/lib/timezoneDates';
import { Lesson, PaymentCancelBehavior, StudentDebtItem, TeacherStudent } from '../../../entities/types';
import type {
  LessonCancelRefundMode,
  LessonModalFocus,
  LessonMutationPreview,
  LessonSeriesScope,
  RescheduleDraft,
} from './types';
import { type LessonDraft } from '../../modals/LessonModal/LessonModal';
import { type ToastOptions } from '../../../shared/lib/toast';

const VISIBLE_LESSON_SERIES_SCOPES: LessonSeriesScope[] = ['SINGLE', 'FOLLOWING'];

type OpenConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

type OpenRecurringDeleteDialogOptions = {
  title: string;
  message: string;
  applyToSeries?: boolean;
  onConfirm: (applyToSeries: boolean) => void;
  onCancel?: () => void;
};

export type LessonActionSource = 'default' | 'onboarding_hero' | 'onboarding_stepper' | 'onboarding_quick_action';
export type ModalVariant = 'modal' | 'sheet';
export type OpenLessonModalOptions = {
  source?: LessonActionSource;
  variant?: ModalVariant;
  skipNavigation?: boolean;
  focus?: LessonModalFocus;
  studentIds?: number[];
};

type SeriesScopeDialogState = {
  action: 'EDIT' | 'RESCHEDULE' | 'DELETE';
  title: string;
  confirmText: string;
  lesson: Lesson;
  defaultScope: LessonSeriesScope;
  reopenModal?: 'reschedule' | null;
  previews: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
  request:
    | {
        kind: 'update';
        payload: {
          studentIds?: number[];
          startAt: string;
          durationMinutes: number;
          color?: Lesson['color'];
          meetingLink?: string | null;
          repeatWeekdays?: number[];
          repeatUntil?: string | null;
        };
      }
    | {
        kind: 'delete';
      };
};

type LessonModalContext = {
  source: LessonActionSource;
  variant: ModalVariant;
  skipNavigation: boolean;
  focus: LessonModalFocus;
};

export type LessonActionsConfig = {
  timeZone: string;
  teacherDefaultLessonDuration: number;
  selectedStudentId: number | null;
  setSelectedStudentId: Dispatch<SetStateAction<number | null>>;
  lessons: Lesson[];
  links: TeacherStudent[];
  setLinks: Dispatch<SetStateAction<TeacherStudent[]>>;
  showInfoDialog: (title: string, message: string, confirmText?: string) => void;
  showToast: (options: ToastOptions) => void;
  openConfirmDialog: (options: OpenConfirmDialogOptions) => void;
  openRecurringDeleteDialog: (options: OpenRecurringDeleteDialogOptions) => void;
  openPaymentCancelDialog: (options: {
    title: string;
    message: string;
    onRefund: () => void;
    onWriteOff: () => void;
    onCancel?: () => void;
  }) => void;
  openPaymentBalanceDialog: (options: {
    title: string;
    message: string;
    onWriteOff: () => void;
    onSkip: () => void;
    onCancel?: () => void;
  }) => void;
  navigateToSchedule: () => void;
  setDayViewDate: Dispatch<SetStateAction<Date>>;
  filterLessonsForCurrentRange: (lessons: Lesson[]) => Lesson[];
  syncLessonsInRanges: (lessons: Lesson[]) => void;
  removeLessonsFromRanges: (options: {
    ids?: number[];
    recurrenceGroupId?: string | null;
    startFrom?: Date;
  }) => void;
  loadStudentLessons: () => Promise<void>;
  loadStudentLessonsSummary: () => Promise<void>;
  loadStudentUnpaidLessons: (options?: { studentIdOverride?: number | null; force?: boolean }) => Promise<void>;
  loadDashboardUnpaidLessons: () => Promise<void>;
  refreshPayments: (studentId: number) => Promise<void>;
  refreshPaymentReminders: (studentId: number) => Promise<void>;
  triggerStudentsListReload: () => void;
  studentDebtItems: StudentDebtItem[];
  onLessonCreateStarted?: (source: LessonActionSource) => void;
  onLessonCreated?: (payload: { lesson: Lesson; source: LessonActionSource }) => void;
  onLessonCreateError?: (error: unknown, source: LessonActionSource) => void;
};

export type LessonActionsContextValue = {
  lessonModalOpen: boolean;
  lessonModalVariant: ModalVariant;
  lessonModalFocus: LessonModalFocus;
  lessonDraft: LessonDraft;
  editingLessonId: number | null;
  editingLesson: Lesson | null;
  recurrenceLocked: boolean;
  defaultLessonDuration: number;
  rescheduleModalOpen: boolean;
  rescheduleDraft: RescheduleDraft;
  rescheduleLesson: Lesson | null;
  openLessonModal: (
    dateISO: string,
    time?: string,
    existing?: Lesson,
    options?: OpenLessonModalOptions,
  ) => void;
  openRescheduleModal: (lesson: Lesson, options?: { skipNavigation?: boolean }) => void;
  closeLessonModal: () => void;
  closeRescheduleModal: () => void;
  setLessonDraft: (draft: LessonDraft) => void;
  setRescheduleDraft: (draft: RescheduleDraft) => void;
  saveLesson: (options?: { applyToSeriesOverride?: boolean; detachFromSeries?: boolean }) => void;
  saveRescheduleLesson: () => void;
  requestDeleteLesson: () => void;
  startEditLesson: (lesson: Lesson) => void;
  openCreateLessonForStudent: (
    studentId?: number,
    options?: { source?: LessonActionSource; variant?: ModalVariant; skipNavigation?: boolean },
  ) => void;
  requestDeleteLessonFromList: (lesson: Lesson) => void;
  markLessonCompleted: (lessonId: number) => Promise<void>;
  updateLessonStatus: (lessonId: number, status: Lesson['status']) => Promise<void>;
  togglePaid: (lessonId: number, studentId?: number) => Promise<void>;
  remindLessonPayment: (
    lessonId: number,
    studentId?: number,
    options?: { force?: boolean },
  ) => Promise<{ status: 'sent' | 'error' }>;
  shiftLessonTime: (lesson: Lesson, minutes: number, scope: LessonSeriesScope, options?: { skipToast?: boolean }) => Promise<void>;
  cancelLesson: (
    lesson: Lesson,
    scope: LessonSeriesScope,
    refundMode?: LessonCancelRefundMode,
    options?: { skipToast?: boolean },
  ) => Promise<void>;
  restoreLesson: (lesson: Lesson, scope: LessonSeriesScope, options?: { skipToast?: boolean }) => Promise<void>;
  seriesScopeDialogState: SeriesScopeDialogState | null;
  confirmSeriesScope: (scope: LessonSeriesScope) => void;
  cancelSeriesScope: () => void;
};

const LessonActionsContext = createContext<LessonActionsContextValue | null>(null);

export const LessonActionsProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: LessonActionsContextValue }>) => {
  return <LessonActionsContext.Provider value={value}>{children}</LessonActionsContext.Provider>;
};

export const useLessonActions = () => {
  const context = useContext(LessonActionsContext);
  if (!context) {
    throw new Error('useLessonActions must be used within LessonActionsProvider');
  }
  return context;
};

const resolveLessonEndTime = (startTime: string, durationMinutes: number) =>
  addMinutesToTime(startTime, durationMinutes) || startTime;

const createLessonDraft = (timeZone: string, defaultDuration: number): LessonDraft => ({
  studentId: undefined as number | undefined,
  studentIds: [] as number[],
  date: todayISO(timeZone),
  time: '18:00',
  endTime: resolveLessonEndTime('18:00', defaultDuration),
  meetingLink: '',
  color: DEFAULT_LESSON_COLOR,
  isRecurring: false,
  repeatWeekdays: [] as number[],
  repeatUntil: undefined as string | undefined,
});

const normalizeLessonStudentIds = (studentIds?: number[]) =>
  Array.from(
    new Set((studentIds ?? []).filter((studentId) => Number.isInteger(studentId) && studentId > 0)),
  );

const createNewLessonDraft = ({
  timeZone,
  defaultDuration,
  dateISO,
  time,
  studentIds,
}: {
  timeZone: string;
  defaultDuration: number;
  dateISO?: string;
  time?: string;
  studentIds?: number[];
}): LessonDraft => {
  const baseDraft = createLessonDraft(timeZone, defaultDuration);
  const resolvedTime = time ?? baseDraft.time;
  const resolvedStudentIds = normalizeLessonStudentIds(studentIds);

  return {
    ...baseDraft,
    date: dateISO ?? baseDraft.date,
    time: resolvedTime,
    endTime: resolveLessonEndTime(resolvedTime, defaultDuration),
    studentId: resolvedStudentIds[0],
    studentIds: resolvedStudentIds,
  };
};

export const useLessonActionsInternal = ({
  timeZone,
  teacherDefaultLessonDuration,
  selectedStudentId,
  setSelectedStudentId,
  lessons,
  links,
  setLinks,
  showInfoDialog,
  showToast,
  openConfirmDialog,
  openRecurringDeleteDialog,
  openPaymentCancelDialog,
  openPaymentBalanceDialog,
  navigateToSchedule,
  setDayViewDate,
  filterLessonsForCurrentRange,
  syncLessonsInRanges,
  removeLessonsFromRanges,
  loadStudentLessons,
  loadStudentLessonsSummary,
  loadStudentUnpaidLessons,
  loadDashboardUnpaidLessons,
  refreshPayments,
  refreshPaymentReminders,
  triggerStudentsListReload,
  studentDebtItems,
  onLessonCreateStarted,
  onLessonCreated,
  onLessonCreateError,
}: LessonActionsConfig): LessonActionsContextValue => {
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft>(() =>
    createLessonDraft(timeZone, teacherDefaultLessonDuration),
  );
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editingLessonOriginal, setEditingLessonOriginal] = useState<Lesson | null>(null);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft>({
    date: '',
    time: '',
    endTime: '',
  });
  const [seriesScopeDialogState, setSeriesScopeDialogState] = useState<SeriesScopeDialogState | null>(null);
  const [lessonModalContext, setLessonModalContext] = useState<LessonModalContext>({
    source: 'default',
    variant: 'modal',
    skipNavigation: false,
    focus: 'full',
  });

  useEffect(() => {
    setLessonDraft((draft) => ({
      ...draft,
      endTime: resolveLessonEndTime(draft.time, teacherDefaultLessonDuration),
    }));
  }, [teacherDefaultLessonDuration]);

  const openLessonModal = useCallback(
    (
      dateISO: string,
      time?: string,
      existing?: Lesson,
      options?: OpenLessonModalOptions,
    ) => {
      if (existing) {
        const disabledReason = resolveLessonEditDisabledReason(existing);
        if (disabledReason) {
          showInfoDialog('Изменение недоступно', disabledReason);
          return;
        }
      }
      const nextContext: LessonModalContext = {
        source: options?.source ?? 'default',
        variant: options?.variant ?? 'modal',
        skipNavigation: options?.skipNavigation ?? false,
        focus: options?.focus ?? 'full',
      };
      setLessonModalContext(nextContext);
      const startDate = existing ? toZonedDate(existing.startAt, timeZone) : undefined;
      const derivedDay = startDate ? startDate.getDay() : undefined;
      const recurrenceWeekdays =
        existing?.recurrenceWeekdays && existing.recurrenceWeekdays.length > 0
          ? existing.recurrenceWeekdays
          : derivedDay !== undefined
            ? [derivedDay]
            : [];

      const existingStudentIds =
        existing?.participants && existing.participants.length > 0
          ? existing.participants.map((p) => p.studentId)
          : existing?.studentId
            ? [existing.studentId]
            : [];

      if (!existing) {
        setLessonDraft(
          createNewLessonDraft({
            timeZone,
            defaultDuration: teacherDefaultLessonDuration,
            dateISO,
            time,
            studentIds: options?.studentIds,
          }),
        );
      } else {
        const nextStartTime = time ?? format(startDate, 'HH:mm');
        const nextDuration = existing?.durationMinutes ?? teacherDefaultLessonDuration;

        setLessonDraft({
          studentId: existing?.studentId ?? existingStudentIds[0],
          studentIds: existingStudentIds,
          date: dateISO,
          time: nextStartTime,
          endTime: resolveLessonEndTime(nextStartTime, nextDuration),
          meetingLink: existing?.meetingLink ?? '',
          color: existing?.color ?? DEFAULT_LESSON_COLOR,
          isRecurring: Boolean(existing.isRecurring),
          repeatWeekdays: recurrenceWeekdays,
          repeatUntil: existing?.recurrenceUntil
            ? formatInTimeZone(existing.recurrenceUntil, 'yyyy-MM-dd', { timeZone })
            : undefined,
        });
      }

      setEditingLessonId(existing?.id ?? null);
      setEditingLessonOriginal(existing ?? null);
      setLessonModalOpen(true);
      if (!nextContext.skipNavigation) {
        navigateToSchedule();
      }
      setDayViewDate(toZonedDate(toUtcDateFromDate(dateISO, timeZone), timeZone));
    },
    [navigateToSchedule, setDayViewDate, showInfoDialog, teacherDefaultLessonDuration, timeZone],
  );

  const openRescheduleModal = useCallback(
    (lesson: Lesson, options?: { skipNavigation?: boolean }) => {
      const disabledReason = resolveLessonMutationDisabledReason(lesson);
      if (disabledReason) {
        showInfoDialog('Изменение недоступно', disabledReason);
        return;
      }
      const start = toZonedDate(lesson.startAt, timeZone);
      const time = format(start, 'HH:mm');
      const endTime = format(addMinutes(start, lesson.durationMinutes), 'HH:mm');
      setRescheduleLesson(lesson);
      setRescheduleDraft({
        date: format(start, 'yyyy-MM-dd'),
        time,
        endTime,
      });
      setRescheduleModalOpen(true);
      if (!options?.skipNavigation) {
        navigateToSchedule();
      }
      setDayViewDate(toZonedDate(toUtcDateFromDate(format(start, 'yyyy-MM-dd'), timeZone), timeZone));
    },
    [navigateToSchedule, setDayViewDate, showInfoDialog, timeZone],
  );

  const closeRescheduleModal = useCallback(() => {
    setRescheduleModalOpen(false);
    setRescheduleLesson(null);
    setRescheduleDraft({ date: '', time: '', endTime: '' });
    setSeriesScopeDialogState(null);
  }, []);

  const closeLessonModal = useCallback(() => {
    setLessonModalOpen(false);
    setEditingLessonId(null);
    setEditingLessonOriginal(null);
    setLessonModalContext({ source: 'default', variant: 'modal', skipNavigation: false, focus: 'full' });
    setLessonDraft(createNewLessonDraft({ timeZone, defaultDuration: teacherDefaultLessonDuration }));
  }, [teacherDefaultLessonDuration, timeZone]);

  const handleLessonDraftChange = useCallback((draft: LessonDraft) => {
    setLessonDraft(draft);
  }, []);

  const applyLessonUpdateResult = useCallback(
    (
      data: { lesson?: Lesson; lessons?: Lesson[] },
      baseLesson?: Lesson | null,
      options?: { scope?: LessonSeriesScope },
    ) => {
      if (data.lessons && data.lessons.length > 0) {
        const normalizedLessons = data.lessons.map(normalizeLesson).filter(isVisibleLesson);
        if (options?.scope && baseLesson?.recurrenceGroupId) {
          removeLessonsFromRanges({
            recurrenceGroupId: baseLesson.recurrenceGroupId,
            startFrom: new Date(baseLesson.startAt),
          });
        }
        if (normalizedLessons.length > 0) {
          syncLessonsInRanges(normalizedLessons);
        }
        return normalizedLessons;
      }

      if (data.lesson) {
        const normalizedLesson = normalizeLesson(data.lesson);
        if (!isVisibleLesson(normalizedLesson)) {
          removeLessonsFromRanges({ ids: [normalizedLesson.id] });
          return [];
        }
        const base = lessons.find((lesson) => lesson.id === normalizedLesson.id) ?? baseLesson ?? null;
        const mergedLesson = base ? { ...base, ...normalizedLesson } : normalizedLesson;
        syncLessonsInRanges([mergedLesson]);
        return [mergedLesson];
      }

      return [];
    },
    [lessons, removeLessonsFromRanges, syncLessonsInRanges],
  );

  const applyLinksUpdate = useCallback(
    (nextLinks?: TeacherStudent[] | null) => {
      if (!nextLinks || nextLinks.length === 0) return;
      setLinks((prev) => {
        const map = new Map(prev.map((link) => [`${link.teacherId}_${link.studentId}`, link]));
        nextLinks.forEach((link) => map.set(`${link.teacherId}_${link.studentId}`, link));
        return Array.from(map.values());
      });
      triggerStudentsListReload();
    },
    [setLinks, triggerStudentsListReload],
  );

  const fetchSeriesScopePreviews = useCallback(
    async (
      lesson: Lesson,
      action: 'EDIT' | 'RESCHEDULE' | 'DELETE',
      payload?: {
        startAt?: string;
        durationMinutes?: number;
        repeatWeekdays?: number[];
        repeatUntil?: string | null;
      },
    ) => {
      const results = await Promise.all(
        VISIBLE_LESSON_SERIES_SCOPES.map(async (scope) => {
          const data = await api.previewLessonMutation(lesson.id, {
            action,
            scope,
            startAt: payload?.startAt,
            durationMinutes: payload?.durationMinutes,
            repeatWeekdays: payload?.repeatWeekdays,
            repeatUntil: payload?.repeatUntil ?? null,
          });
          return [scope, data.preview] as const;
        }),
      );

      return Object.fromEntries(results) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    },
    [],
  );

  const updateLessonTiming = useCallback(
    async (lesson: Lesson, startAt: string, durationMinutes: number, scope: LessonSeriesScope) => {
      const data = await api.updateLesson(lesson.id, {
        startAt,
        durationMinutes,
        scope,
      });
      applyLessonUpdateResult(data, lesson, { scope });
      await loadStudentLessons();
      await loadStudentLessonsSummary();
      await loadDashboardUnpaidLessons();
    },
    [
      applyLessonUpdateResult,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
    ],
  );

  const performDeleteLesson = useCallback(
    async (scope: LessonSeriesScope = 'SINGLE') => {
      if (!editingLessonId) return;
      const recurrenceGroupId = editingLessonOriginal?.recurrenceGroupId;

      try {
        await api.deleteLesson(editingLessonId, { scope });
        if (scope !== 'SINGLE' && recurrenceGroupId) {
          removeLessonsFromRanges({
            recurrenceGroupId,
            startFrom: scope === 'FOLLOWING' && editingLessonOriginal ? new Date(editingLessonOriginal.startAt) : new Date(),
          });
        } else if (editingLessonId) {
          removeLessonsFromRanges({ ids: [editingLessonId] });
        }
        await loadStudentLessons();
        await loadStudentLessonsSummary();
        closeLessonModal();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось удалить урок';
        showInfoDialog('Ошибка', message);
        // eslint-disable-next-line no-console
        console.error('Failed to delete lesson', error);
      }
    },
    [
      closeLessonModal,
      editingLessonId,
      editingLessonOriginal,
      editingLessonOriginal?.recurrenceGroupId,
      loadStudentLessons,
      loadStudentLessonsSummary,
      removeLessonsFromRanges,
      showInfoDialog,
    ],
  );

  const requestDeleteLesson = useCallback(() => {
    if (!editingLessonId) return;
    const original = editingLessonOriginal;
    const disabledReason = original ? resolveLessonDeleteDisabledReason(original) : null;

    if (disabledReason) {
      showInfoDialog('Изменение недоступно', disabledReason);
      return;
    }

    if (original?.isRecurring && (original.recurrenceGroupId || original.seriesId)) {
      void fetchSeriesScopePreviews(original, 'DELETE')
        .then((previews) => {
          setSeriesScopeDialogState({
            action: 'DELETE',
            title: 'Удалить урок',
            confirmText: 'Удалить',
            lesson: original,
            defaultScope: 'SINGLE',
            previews,
            request: {
              kind: 'delete',
            },
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Не удалось подготовить удаление урока';
          showInfoDialog('Ошибка', message);
        });
      return;
    }

    openConfirmDialog({
      title: 'Удалить урок?',
      message: 'Удалённый урок нельзя будет вернуть. Продолжить?',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      onConfirm: () => {
        void performDeleteLesson('SINGLE');
      },
    });
  }, [
    editingLessonId,
    editingLessonOriginal,
    fetchSeriesScopePreviews,
    openConfirmDialog,
    performDeleteLesson,
    showInfoDialog,
  ]);

  const saveLesson = useCallback(
    async (options?: { applyToSeriesOverride?: boolean; detachFromSeries?: boolean }) => {
      if (lessonDraft.studentIds.length === 0 || !lessonDraft.date || !lessonDraft.time) {
        showInfoDialog('Заполните все поля', 'Выберите хотя бы одного ученика, дату и время');
        return;
      }
      const durationMinutes = diffTimeMinutes(lessonDraft.time, lessonDraft.endTime);
      if (!durationMinutes || durationMinutes <= 0) {
        showInfoDialog('Проверьте время', 'Время окончания должно быть позже времени начала');
        return;
      }

      if (lessonDraft.isRecurring && lessonDraft.repeatUntil && lessonDraft.repeatUntil < lessonDraft.date) {
        showInfoDialog('Проверьте даты', 'Дата окончания повторов должна быть не раньше даты начала');
        return;
      }

      const startAtDate = toUtcDateFromTimeZone(lessonDraft.date, lessonDraft.time, timeZone);
      const startAt = startAtDate.toISOString();
      const meetingLinkPayload = normalizeMeetingLinkInput(lessonDraft.meetingLink ?? '');
      const meetingLink = meetingLinkPayload ? meetingLinkPayload : null;

      const isOnboardingSource = lessonModalContext.source.startsWith('onboarding');
      if (!editingLessonId) {
        onLessonCreateStarted?.(lessonModalContext.source);
      }

      try {
        if (editingLessonId) {
          const original = editingLessonOriginal;
          const limitedMetadataEdit = original ? resolveLessonAllowsLimitedMetadataEdit(original) : false;
          const originalWeekdays = original?.recurrenceWeekdays ?? [];
          const originalUntil = original?.recurrenceUntil
            ? formatInTimeZone(original.recurrenceUntil, 'yyyy-MM-dd', { timeZone })
            : '';
          const repeatChanged =
            (lessonDraft.repeatUntil ?? '') !== originalUntil ||
            lessonDraft.repeatWeekdays.length !== originalWeekdays.length ||
            lessonDraft.repeatWeekdays.some((day) => !originalWeekdays.includes(day));

          const timeChanged = Boolean(
            original &&
              (new Date(original.startAt).getTime() !== new Date(startAt).getTime() ||
                original.durationMinutes !== durationMinutes),
          );

          const repeatUntilPayload =
            lessonDraft.isRecurring && lessonDraft.repeatUntil
              ? toUtcEndOfDay(lessonDraft.repeatUntil, timeZone).toISOString()
              : null;

          if (
            !limitedMetadataEdit &&
            original?.isRecurring &&
            (original.recurrenceGroupId || original.seriesId) &&
            options?.applyToSeriesOverride === undefined
          ) {
            const previews = await fetchSeriesScopePreviews(original, 'EDIT', {
              startAt,
              durationMinutes,
              repeatWeekdays: lessonDraft.isRecurring ? lessonDraft.repeatWeekdays : undefined,
              repeatUntil: repeatUntilPayload,
            });
            setSeriesScopeDialogState({
              action: 'EDIT',
              title: 'Применить изменения к серии',
              confirmText: 'Сохранить',
              lesson: original,
              defaultScope: repeatChanged ? 'FOLLOWING' : 'SINGLE',
              previews,
              request: {
                kind: 'update',
                payload: {
                  studentIds: lessonDraft.studentIds,
                  startAt,
                  durationMinutes,
                  color: lessonDraft.color,
                  meetingLink,
                  repeatWeekdays: lessonDraft.isRecurring ? lessonDraft.repeatWeekdays : undefined,
                  repeatUntil: repeatUntilPayload,
                },
              },
            });
            return;
          }

          const originalStudentIds =
            original?.participants && original.participants.length > 0
              ? original.participants.map((participant) => participant.studentId)
              : original?.studentId
                ? [original.studentId]
                : lessonDraft.studentIds;

          const data = await api.updateLesson(editingLessonId, {
            studentIds: limitedMetadataEdit ? originalStudentIds : lessonDraft.studentIds,
            startAt: limitedMetadataEdit && original ? original.startAt : startAt,
            durationMinutes: limitedMetadataEdit && original ? original.durationMinutes : durationMinutes,
            color: lessonDraft.color,
            meetingLink,
            scope: limitedMetadataEdit ? 'SINGLE' : options?.applyToSeriesOverride ? 'FOLLOWING' : 'SINGLE',
            repeatWeekdays:
              limitedMetadataEdit || !lessonDraft.isRecurring ? undefined : lessonDraft.repeatWeekdays,
            repeatUntil: limitedMetadataEdit ? undefined : repeatUntilPayload,
          });

          applyLessonUpdateResult(data, editingLessonOriginal, {
            scope: limitedMetadataEdit ? 'SINGLE' : options?.applyToSeriesOverride ? 'FOLLOWING' : 'SINGLE',
          });

          if (
            !limitedMetadataEdit &&
            timeChanged &&
            (lessonModalContext.focus === 'focus_date' || lessonModalContext.focus === 'focus_time') &&
            original
          ) {
            const message = lessonModalContext.focus === 'focus_date' ? 'Урок перенесён' : 'Время изменено';
            const undoScope: LessonSeriesScope = options?.applyToSeriesOverride ? 'FOLLOWING' : 'SINGLE';
            const undoStartAt = original.startAt;
            const undoDuration = original.durationMinutes;
            showToast({
              message,
              variant: 'success',
              actionLabel: 'Отменить',
              onAction: () => {
                void updateLessonTiming(original, undoStartAt, undoDuration, undoScope).catch(() => {
                  showToast({ message: 'Не удалось отменить изменения', variant: 'error' });
                });
              },
            });
          }
        } else if (lessonDraft.isRecurring) {
          if (lessonDraft.repeatWeekdays.length === 0) {
            showInfoDialog('Нужно выбрать дни недели', 'Выберите хотя бы один день недели для повтора');
            return;
          }
          const resolvedRepeatUntil = lessonDraft.repeatUntil
            ? toUtcEndOfDay(lessonDraft.repeatUntil, timeZone).toISOString()
            : toUtcEndOfDay(
                formatInTimeZone(addYears(new Date(startAt), 1), 'yyyy-MM-dd', { timeZone }),
                timeZone,
              ).toISOString();

          const data = await api.createRecurringLessons({
            studentIds: lessonDraft.studentIds,
            startAt,
            durationMinutes,
            color: lessonDraft.color,
            meetingLink,
            repeatWeekdays: lessonDraft.repeatWeekdays,
            repeatUntil: resolvedRepeatUntil,
          });

          const normalizedLessons = data.lessons.map(normalizeLesson).filter(isVisibleLesson);
          syncLessonsInRanges(normalizedLessons);
          const lessonsInRange = filterLessonsForCurrentRange(normalizedLessons);
          if (!editingLessonId && lessonsInRange.length > 0) {
            onLessonCreated?.({ lesson: lessonsInRange[0], source: lessonModalContext.source });
            if (isOnboardingSource) {
              showToast({ message: 'Занятие создано. Теперь напоминание 🔔', variant: 'success' });
            }
          }
        } else {
          const data = await api.createLesson({
            studentIds: lessonDraft.studentIds,
            startAt,
            durationMinutes,
            color: lessonDraft.color,
            meetingLink,
          });

          const normalizedLesson = normalizeLesson(data.lesson);
          if (isVisibleLesson(normalizedLesson)) {
            syncLessonsInRanges([normalizedLesson]);
          }
          if (!editingLessonId) {
            onLessonCreated?.({ lesson: normalizedLesson, source: lessonModalContext.source });
            if (isOnboardingSource) {
              showToast({ message: 'Занятие создано. Теперь напоминание 🔔', variant: 'success' });
            }
          }
        }

        const shouldNavigate = !lessonModalContext.skipNavigation;

        await loadStudentLessons();
        await loadStudentLessonsSummary();
        closeLessonModal();
        if (shouldNavigate) {
          navigateToSchedule();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать урок';
        showInfoDialog('Ошибка', message);
        // eslint-disable-next-line no-console
        console.error('Failed to create lesson', error);
        if (!editingLessonId) {
          onLessonCreateError?.(error, lessonModalContext.source);
        }
      }
    },
    [
      closeLessonModal,
      editingLessonId,
      editingLessonOriginal,
      applyLessonUpdateResult,
      filterLessonsForCurrentRange,
      lessonDraft,
      lessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      navigateToSchedule,
      onLessonCreateError,
      onLessonCreateStarted,
      onLessonCreated,
      openConfirmDialog,
      showInfoDialog,
      showToast,
      syncLessonsInRanges,
      updateLessonTiming,
      lessonModalContext,
      timeZone,
      removeLessonsFromRanges,
    ],
  );

  const saveRescheduleLesson = useCallback(async () => {
    if (!rescheduleLesson) return;
    if (!rescheduleDraft.date || !rescheduleDraft.time) {
      showInfoDialog('Проверьте дату и время', 'Укажите дату и время урока');
      return;
    }
    const durationMinutes = diffTimeMinutes(rescheduleDraft.time, rescheduleDraft.endTime);
    if (!durationMinutes || durationMinutes <= 0) {
      showInfoDialog('Проверьте время', 'Время окончания должно быть позже времени начала');
      return;
    }

    const startAtDate = toUtcDateFromTimeZone(rescheduleDraft.date, rescheduleDraft.time, timeZone);
    const startAt = startAtDate.toISOString();
    const timeChanged =
      startAt !== rescheduleLesson.startAt || durationMinutes !== rescheduleLesson.durationMinutes;

    if (!timeChanged) {
      closeRescheduleModal();
      return;
    }

    if (rescheduleLesson.isRecurring && (rescheduleLesson.recurrenceGroupId || rescheduleLesson.seriesId)) {
      try {
        const previews = await fetchSeriesScopePreviews(rescheduleLesson, 'RESCHEDULE', {
          startAt,
          durationMinutes,
        });
        setSeriesScopeDialogState({
          action: 'RESCHEDULE',
          title: 'Перенести урок',
          confirmText: 'Перенести',
          lesson: rescheduleLesson,
          defaultScope: 'SINGLE',
          reopenModal: 'reschedule',
          previews,
          request: {
            kind: 'update',
            payload: {
              startAt,
              durationMinutes,
            },
          },
        });
        setRescheduleModalOpen(false);
      } catch (error) {
        showToast({ message: 'Не удалось подготовить перенос урока', variant: 'error' });
      }
      return;
    }

    try {
      await updateLessonTiming(rescheduleLesson, startAt, durationMinutes, 'SINGLE');
      showToast({
        message: 'Урок перенесён',
        variant: 'success',
        actionLabel: 'Отменить',
        onAction: () => {
          void updateLessonTiming(
            rescheduleLesson,
            rescheduleLesson.startAt,
            rescheduleLesson.durationMinutes,
            'SINGLE',
          ).catch(() => {
            showToast({ message: 'Не удалось отменить изменения', variant: 'error' });
          });
        },
      });
      closeRescheduleModal();
    } catch (error) {
      showToast({ message: 'Не удалось перенести урок', variant: 'error' });
      // eslint-disable-next-line no-console
      console.error('Failed to reschedule lesson', error);
    }
  }, [
    closeRescheduleModal,
    rescheduleDraft.date,
    rescheduleDraft.endTime,
    rescheduleDraft.time,
    rescheduleLesson,
    showInfoDialog,
    showToast,
    timeZone,
    updateLessonTiming,
    fetchSeriesScopePreviews,
  ]);

  const startEditLesson = useCallback(
    (lesson: Lesson) => {
      const start = toZonedDate(lesson.startAt, timeZone);
      const time = format(start, 'HH:mm');
      openLessonModal(format(start, 'yyyy-MM-dd'), time, lesson);
    },
    [openLessonModal, timeZone],
  );

  const openCreateLessonForStudent = useCallback(
    (studentId?: number, options?: { source?: LessonActionSource; variant?: ModalVariant; skipNavigation?: boolean }) => {
      if (studentId) {
        setSelectedStudentId((prev) => prev ?? studentId);
      }
      openLessonModal(todayISO(timeZone), undefined, undefined, {
        ...options,
        studentIds: studentId ? [studentId] : undefined,
      });
    },
    [openLessonModal, setSelectedStudentId, timeZone],
  );

  const deleteLessonWithOptions = useCallback(
    async (lesson: Lesson, scope: LessonSeriesScope) => {
      try {
        await api.deleteLesson(lesson.id, { scope });
        if (scope !== 'SINGLE' && lesson.recurrenceGroupId) {
          removeLessonsFromRanges({
            recurrenceGroupId: lesson.recurrenceGroupId,
            startFrom: scope === 'FOLLOWING' ? new Date(lesson.startAt) : new Date(),
          });
        } else {
          removeLessonsFromRanges({ ids: [lesson.id] });
        }
        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete lesson', error);
      }
    },
    [loadDashboardUnpaidLessons, loadStudentLessons, loadStudentLessonsSummary, removeLessonsFromRanges],
  );

  const requestDeleteLessonFromList = useCallback(
    (lesson: Lesson) => {
      const disabledReason = resolveLessonDeleteDisabledReason(lesson);
      if (disabledReason) {
        showInfoDialog('Изменение недоступно', disabledReason);
        return;
      }

      if (lesson.isRecurring && (lesson.recurrenceGroupId || lesson.seriesId)) {
        void fetchSeriesScopePreviews(lesson, 'DELETE')
          .then((previews) => {
            setSeriesScopeDialogState({
              action: 'DELETE',
              title: 'Удалить урок',
              confirmText: 'Удалить',
              lesson,
              defaultScope: 'SINGLE',
              previews,
              request: {
                kind: 'delete',
              },
            });
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Не удалось подготовить удаление урока';
            showInfoDialog('Ошибка', message);
          });
        return;
      }

      openConfirmDialog({
        title: 'Удалить урок?',
        message: 'Удалённый урок нельзя будет вернуть. Продолжить?',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          void deleteLessonWithOptions(lesson, 'SINGLE');
        },
      });
    },
    [deleteLessonWithOptions, fetchSeriesScopePreviews, openConfirmDialog, showInfoDialog],
  );

  const markLessonCompleted = useCallback(
    async (lessonId: number) => {
      try {
        const data = await api.markLessonCompleted(lessonId);
        const baseLesson = lessons.find((lesson) => lesson.id === lessonId);
        const mergedLesson = baseLesson ? { ...baseLesson, ...data.lesson } : data.lesson;
        syncLessonsInRanges([mergedLesson]);

        if (data.link) {
          const previousLink = links.find(
            (link) => link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId,
          );
          const balanceDelta = previousLink ? data.link.balanceLessons - previousLink.balanceLessons : 0;
          const studentName = data.link.customName || previousLink?.customName || 'ученика';

          setLinks((prev) =>
            prev.map((link) =>
              link.studentId === data.link.studentId && link.teacherId === data.link.teacherId ? data.link : link,
            ),
          );
          triggerStudentsListReload();

          if (balanceDelta < 0) {
            showToast({
              message: `С баланса ${studentName} списано занятие`,
              variant: 'success',
            });
          }
        }

        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();
      } catch (error) {
        showToast({
          message: 'Не удалось отметить занятие проведённым',
          variant: 'error',
        });
        // eslint-disable-next-line no-console
        console.error('Failed to complete lesson', error);
      }
    },
    [
      links,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      setLinks,
      showToast,
      triggerStudentsListReload,
      syncLessonsInRanges,
      lessons,
    ],
  );

  const updateLessonStatus = useCallback(
    async (lessonId: number, status: Lesson['status']) => {
      try {
        const data = await api.updateLessonStatus(lessonId, status);
        const baseLesson = lessons.find((lesson) => lesson.id === lessonId);
        const mergedLesson = baseLesson ? { ...baseLesson, ...data.lesson } : data.lesson;
        syncLessonsInRanges([mergedLesson]);

        if (data.links && data.links.length > 0) {
          const previousLinks = new Map(
            links.map((link) => [`${link.teacherId}_${link.studentId}`, link]),
          );
          const chargedLinks = data.links.filter((link) => {
            const previous = previousLinks.get(`${link.teacherId}_${link.studentId}`);
            return previous ? link.balanceLessons < previous.balanceLessons : false;
          });

          setLinks((prev) => {
            const map = new Map(prev.map((link) => [`${link.teacherId}_${link.studentId}`, link]));
            data.links!.forEach((link) => map.set(`${link.teacherId}_${link.studentId}`, link));
            return Array.from(map.values());
          });
          triggerStudentsListReload();

          chargedLinks.forEach((link) => {
            showToast({
              message: `С баланса ${link.customName} списано занятие`,
              variant: 'success',
            });
          });
        }

        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update lesson status', error);
      }
    },
    [
      links,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      setLinks,
      showToast,
      triggerStudentsListReload,
      syncLessonsInRanges,
      lessons,
    ],
  );

  const shiftLessonTime = useCallback(
    async (lesson: Lesson, minutes: number, scope: LessonSeriesScope, options?: { skipToast?: boolean }) => {
      const previousStartAt = lesson.startAt;
      const nextStartAt = addMinutes(new Date(lesson.startAt), minutes).toISOString();
      try {
        await updateLessonTiming(lesson, nextStartAt, lesson.durationMinutes, scope);

        if (!options?.skipToast) {
          showToast({
            message: 'Время изменено',
            variant: 'success',
            actionLabel: 'Отменить',
            onAction: () => {
              void updateLessonTiming(lesson, previousStartAt, lesson.durationMinutes, scope).catch(() => {
                showToast({ message: 'Не удалось отменить изменения', variant: 'error' });
              });
            },
          });
        }
      } catch (error) {
        showToast({ message: 'Не удалось изменить время', variant: 'error' });
        // eslint-disable-next-line no-console
        console.error('Failed to shift lesson time', error);
      }
    },
    [showToast, updateLessonTiming],
  );

  const updateLessonStatusScoped = useCallback(
    async (lesson: Lesson, scope: LessonSeriesScope, status: Lesson['status']) => {
      const targets =
        scope !== 'SINGLE' && lesson.recurrenceGroupId
          ? lessons.filter(
              (item) =>
                item.recurrenceGroupId === lesson.recurrenceGroupId &&
                new Date(item.startAt).getTime() >= new Date(lesson.startAt).getTime(),
            )
          : [lesson];

      const results = await Promise.all(
        targets.map(async (target) => {
          const data = await api.updateLessonStatus(target.id, status);
          return { data, target };
        }),
      );

      results.forEach(({ data, target }) => {
        applyLessonUpdateResult({ lesson: data.lesson }, target);
        applyLinksUpdate(data.links);
      });

      await loadStudentLessons();
      await loadStudentLessonsSummary();
      await loadDashboardUnpaidLessons();
    },
    [
      applyLessonUpdateResult,
      applyLinksUpdate,
      lessons,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
    ],
  );

  const restoreLesson = useCallback(
    async (lesson: Lesson, scope: LessonSeriesScope, options?: { skipToast?: boolean }) => {
      try {
        const data = await api.restoreLesson(lesson.id, { scope });
        applyLessonUpdateResult(data, lesson);
        applyLinksUpdate(data.links);
        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();

        if (!options?.skipToast) {
          showToast({ message: 'Урок восстановлен', variant: 'success' });
        }
      } catch (error) {
        showToast({ message: 'Не удалось восстановить урок', variant: 'error' });
        // eslint-disable-next-line no-console
        console.error('Failed to restore lesson', error);
      }
    },
    [
      applyLessonUpdateResult,
      applyLinksUpdate,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      showToast,
    ],
  );

  const cancelLesson = useCallback(
    async (
      lesson: Lesson,
      scope: LessonSeriesScope,
      refundMode?: LessonCancelRefundMode,
      options?: { skipToast?: boolean },
    ) => {
      try {
        const data = await api.cancelLesson(lesson.id, { scope, refundMode });
        applyLessonUpdateResult(data, lesson);
        applyLinksUpdate(data.links);
        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();

        if (!options?.skipToast) {
          showToast({
            message: 'Урок отменён',
            variant: 'success',
            actionLabel: 'Вернуть',
            onAction: () => {
              void restoreLesson(lesson, scope, { skipToast: true }).catch(() => {
                showToast({ message: 'Не удалось вернуть урок', variant: 'error' });
              });
            },
          });
        }
      } catch (error) {
        showToast({ message: 'Не удалось отменить урок', variant: 'error' });
        // eslint-disable-next-line no-console
        console.error('Failed to cancel lesson', error);
      }
    },
    [
      applyLessonUpdateResult,
      applyLinksUpdate,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      restoreLesson,
      showToast,
    ],
  );

  const confirmSeriesScope = useCallback(
    (scope: LessonSeriesScope) => {
      if (!seriesScopeDialogState) return;
      const state = seriesScopeDialogState;
      setSeriesScopeDialogState(null);

      const runRequest =
        state.request.kind === 'delete'
          ? api.deleteLesson(state.lesson.id, { scope })
          : api.updateLesson(state.lesson.id, {
              ...state.request.payload,
              scope,
            });

      void runRequest
        .then(async (data) => {
          if (state.request.kind === 'delete') {
            if (scope !== 'SINGLE' && state.lesson.recurrenceGroupId) {
              removeLessonsFromRanges({
                recurrenceGroupId: state.lesson.recurrenceGroupId,
                startFrom: scope === 'FOLLOWING' ? new Date(state.lesson.startAt) : new Date(),
              });
            } else {
              removeLessonsFromRanges({ ids: [state.lesson.id] });
            }
            await loadStudentLessons();
            await loadStudentLessonsSummary();
            await loadDashboardUnpaidLessons();
            closeLessonModal();
            showToast({ message: 'Урок удалён', variant: 'success' });
            return;
          }

          applyLessonUpdateResult(data as { lesson?: Lesson; lessons?: Lesson[] }, state.lesson, { scope });
          await loadStudentLessons();
          await loadStudentLessonsSummary();
          await loadDashboardUnpaidLessons();

          const successMessage =
            state.action === 'RESCHEDULE' ? 'Урок перенесён' : 'Изменения сохранены';
          showToast({ message: successMessage, variant: 'success' });

          if (state.action === 'RESCHEDULE') {
            closeRescheduleModal();
          } else if (state.action === 'EDIT') {
            closeLessonModal();
          }
        })
        .catch((error) => {
          const message =
            state.action === 'DELETE'
              ? 'Не удалось удалить урок'
              : state.action === 'RESCHEDULE'
                ? 'Не удалось перенести урок'
                : 'Не удалось сохранить изменения';
          showToast({ message, variant: 'error' });
          // eslint-disable-next-line no-console
          console.error('Failed to confirm lesson series scope', error);
          if (state.reopenModal === 'reschedule') {
            setRescheduleModalOpen(true);
          }
        });
    },
    [
      applyLessonUpdateResult,
      closeLessonModal,
      closeRescheduleModal,
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      removeLessonsFromRanges,
      seriesScopeDialogState,
      showToast,
    ],
  );

  const cancelSeriesScope = useCallback(() => {
    if (!seriesScopeDialogState) return;
    const reopenModal = seriesScopeDialogState.reopenModal;
    setSeriesScopeDialogState(null);
    if (reopenModal === 'reschedule') {
      setRescheduleModalOpen(true);
    }
  }, [seriesScopeDialogState]);

  const applyTogglePaid = useCallback(
    async (
      lessonId: number,
      studentId?: number,
      cancelBehavior?: PaymentCancelBehavior,
      writeOffBalance?: boolean,
    ) => {
      try {
        const payload = cancelBehavior || writeOffBalance ? { cancelBehavior, writeOffBalance } : undefined;
        if (studentId !== undefined) {
          const data = await api.toggleParticipantPaid(lessonId, studentId, payload);
          const baseLesson = lessons.find((lesson) => lesson.id === lessonId);
          const mergedLesson = baseLesson ? { ...baseLesson, ...data.lesson } : data.lesson;
          syncLessonsInRanges([mergedLesson]);

          if (data.link) {
            setLinks((prev) => {
              const exists = prev.some(
                (link) => link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId,
              );
              if (!exists) return [...prev, data.link!];
              return prev.map((link) =>
                link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId ? data.link! : link,
              );
            });
            triggerStudentsListReload();
          }

          await refreshPayments(studentId);
          await loadStudentUnpaidLessons({ studentIdOverride: studentId, force: true });
          showToast({
            message: cancelBehavior ? 'Оплата отменена' : 'Оплата отмечена',
            variant: 'success',
          });
        } else {
          const data = await api.togglePaid(lessonId, payload);
          const baseLesson = lessons.find((lesson) => lesson.id === lessonId);
          const mergedLesson = baseLesson ? { ...baseLesson, ...data.lesson } : data.lesson;
          syncLessonsInRanges([mergedLesson]);

          if (data.link) {
            setLinks((prev) => {
              const exists = prev.some(
                (link) => link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId,
              );
              if (!exists) return [...prev, data.link!];
              return prev.map((link) =>
                link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId ? data.link! : link,
              );
            });
            triggerStudentsListReload();
          }

          const targetStudent = data.lesson.studentId;
          await refreshPayments(targetStudent);
          if (targetStudent) {
            await loadStudentUnpaidLessons({ studentIdOverride: targetStudent, force: true });
          }
          showToast({
            message: cancelBehavior ? 'Оплата отменена' : 'Оплата отмечена',
            variant: 'success',
          });
        }

        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();
      } catch (error) {
        showToast({
          message: 'Не удалось обновить оплату',
          variant: 'error',
        });
      }
    },
    [
      loadDashboardUnpaidLessons,
      loadStudentLessons,
      loadStudentLessonsSummary,
      loadStudentUnpaidLessons,
      refreshPayments,
      setLinks,
      showToast,
      syncLessonsInRanges,
      triggerStudentsListReload,
      lessons,
    ],
  );

  const resolvePaymentTarget = useCallback(
    (lessonId: number, studentId?: number) => {
      const targetLesson = lessons.find((lesson) => lesson.id === lessonId);
      const resolvedStudentId = studentId ?? targetLesson?.studentId;
      const link = resolvedStudentId ? links.find((item) => item.studentId === resolvedStudentId) : undefined;
      return { studentId: resolvedStudentId, link };
    },
    [lessons, links],
  );

  const markPaidWithBalance = useCallback(
    async (lessonId: number, studentId: number | undefined, writeOffBalance: boolean) => {
      await applyTogglePaid(lessonId, studentId, undefined, writeOffBalance);
    },
    [applyTogglePaid],
  );

  const togglePaid = useCallback(
    async (lessonId: number, studentId?: number) => {
      const targetLesson = lessons.find((lesson) => lesson.id === lessonId);
      const isCurrentlyPaid =
        studentId !== undefined
          ? targetLesson?.participants?.find((participant) => participant.studentId === studentId)?.isPaid ?? false
          : targetLesson?.isPaid ?? false;

      if (isCurrentlyPaid) {
        openPaymentCancelDialog({
          title: 'Отмена оплаты',
          message: 'Вернуть оплаченный урок на баланс ученика?',
          onRefund: () => {
            void applyTogglePaid(lessonId, studentId, 'refund');
          },
          onWriteOff: () => {
            void applyTogglePaid(lessonId, studentId, 'writeoff');
          },
        });
        return;
      }

      const { link } = resolvePaymentTarget(lessonId, studentId);
      const hasBalance = (link?.balanceLessons ?? 0) > 0;

      if (hasBalance) {
        openPaymentBalanceDialog({
          title: 'Отметить оплату',
          message: 'У ученика есть занятия на балансе. Списать 1 занятие с баланса?',
          onWriteOff: () => {
            void markPaidWithBalance(lessonId, studentId, true);
          },
          onSkip: () => {
            void markPaidWithBalance(lessonId, studentId, false);
          },
        });
        return;
      }

      await markPaidWithBalance(lessonId, studentId, false);
    },
    [applyTogglePaid, lessons, markPaidWithBalance, openPaymentBalanceDialog, openPaymentCancelDialog, resolvePaymentTarget],
  );

  const remindLessonPayment = useCallback(
    async (lessonId: number, studentId?: number, options?: { force?: boolean }) => {
      try {
        await api.remindLessonPayment(lessonId, studentId, Boolean(options?.force));
        showToast({ message: 'Отправлено ✅', variant: 'success' });
        if (studentId) {
          await loadStudentUnpaidLessons({ studentIdOverride: studentId, force: true });
        }
        if (selectedStudentId) {
          refreshPaymentReminders(selectedStudentId);
        }
        return { status: 'sent' as const };
      } catch (error) {
        let code = 'error';
        if (error instanceof Error) {
          try {
            const parsed = JSON.parse(error.message) as { message?: string };
            code = parsed?.message ?? error.message;
          } catch {
            code = error.message;
          }
        }
        if (code === 'recently_sent' && !options?.force) {
          return await new Promise<{ status: 'sent' | 'error' }>((resolve) => {
            const reminderItem = studentDebtItems.find((item) => item.id === lessonId);
            const lastReminderLabel = reminderItem?.lastPaymentReminderAt
              ? formatInTimeZone(reminderItem.lastPaymentReminderAt, 'd MMM yyyy, HH:mm', {
                  locale: ru,
                  timeZone,
                })
              : null;
            const message = lastReminderLabel
              ? `Последнее напоминание: ${lastReminderLabel}. Отправить ещё раз?`
              : 'Напоминание уже отправлялось недавно. Отправить ещё раз?';
            openConfirmDialog({
              title: 'Напоминание уже отправлялось недавно',
              message,
              confirmText: 'Отправить',
              cancelText: 'Отмена',
              onConfirm: async () => {
                const result = await remindLessonPayment(lessonId, studentId, { force: true });
                resolve(result);
              },
              onCancel: () => {
                resolve({ status: 'error' as const });
              },
            });
          });
        }
        const message =
          code === 'student_not_activated'
            ? 'Ученик не активировал бота — отправка напоминаний невозможна'
            : 'Не удалось отправить напоминание';
        showToast({ message, variant: 'error' });
        // eslint-disable-next-line no-console
        console.error('Failed to send payment reminder', error);
        return { status: 'error' as const };
      }
    },
    [
      loadStudentUnpaidLessons,
      openConfirmDialog,
      refreshPaymentReminders,
      selectedStudentId,
      showToast,
      studentDebtItems,
      timeZone,
    ],
  );

  return useMemo(
    () => ({
      lessonModalOpen,
      lessonModalVariant: lessonModalContext.variant,
      lessonModalFocus: lessonModalContext.focus,
      lessonDraft,
      editingLessonId,
      editingLesson: editingLessonOriginal,
      recurrenceLocked: Boolean(editingLessonOriginal?.isRecurring),
      defaultLessonDuration: teacherDefaultLessonDuration,
      rescheduleModalOpen,
      rescheduleDraft,
      rescheduleLesson,
      openLessonModal,
      openRescheduleModal,
      closeLessonModal,
      closeRescheduleModal,
      setLessonDraft: handleLessonDraftChange,
      setRescheduleDraft,
      saveLesson,
      saveRescheduleLesson,
      requestDeleteLesson,
      startEditLesson,
      openCreateLessonForStudent,
      requestDeleteLessonFromList,
      markLessonCompleted,
      updateLessonStatus,
      togglePaid,
      remindLessonPayment,
      shiftLessonTime,
      cancelLesson,
      restoreLesson,
      seriesScopeDialogState,
      confirmSeriesScope,
      cancelSeriesScope,
    }),
    [
      closeLessonModal,
      closeRescheduleModal,
      editingLessonId,
      editingLessonOriginal,
      editingLessonOriginal?.isRecurring,
      handleLessonDraftChange,
      lessonDraft,
      lessonModalContext.focus,
      lessonModalContext.variant,
      lessonModalOpen,
      openRescheduleModal,
      openCreateLessonForStudent,
      openLessonModal,
      requestDeleteLesson,
      requestDeleteLessonFromList,
      saveLesson,
      saveRescheduleLesson,
      startEditLesson,
      teacherDefaultLessonDuration,
      rescheduleDraft,
      rescheduleLesson,
      rescheduleModalOpen,
      markLessonCompleted,
      remindLessonPayment,
      togglePaid,
      updateLessonStatus,
      shiftLessonTime,
      cancelLesson,
      restoreLesson,
      seriesScopeDialogState,
      confirmSeriesScope,
      cancelSeriesScope,
    ],
  );
};
