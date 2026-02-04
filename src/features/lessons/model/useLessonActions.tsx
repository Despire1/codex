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
import { addYears, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { api } from '../../../shared/api/client';
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
import { type LessonDraft } from '../../modals/LessonModal/LessonModal';
import { type ToastOptions } from '../../../shared/lib/toast';

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
  updateLessonsForCurrentRange: (updater: (prev: Lesson[]) => Lesson[]) => void;
  isLessonInCurrentRange: (lesson: Lesson) => boolean;
  loadStudentLessons: () => Promise<void>;
  loadStudentLessonsSummary: () => Promise<void>;
  loadStudentUnpaidLessons: (options?: { studentIdOverride?: number | null; force?: boolean }) => Promise<void>;
  loadDashboardUnpaidLessons: () => Promise<void>;
  refreshPayments: (studentId: number) => Promise<void>;
  refreshPaymentReminders: (studentId: number) => Promise<void>;
  triggerStudentsListReload: () => void;
  studentDebtItems: StudentDebtItem[];
};

export type LessonActionsContextValue = {
  lessonModalOpen: boolean;
  lessonDraft: LessonDraft;
  editingLessonId: number | null;
  recurrenceLocked: boolean;
  defaultLessonDuration: number;
  openLessonModal: (dateISO: string, time?: string, existing?: Lesson) => void;
  closeLessonModal: () => void;
  setLessonDraft: (draft: LessonDraft) => void;
  saveLesson: (options?: { applyToSeriesOverride?: boolean; detachFromSeries?: boolean }) => void;
  requestDeleteLesson: () => void;
  startEditLesson: (lesson: Lesson) => void;
  openCreateLessonForStudent: (studentId?: number) => void;
  requestDeleteLessonFromList: (lesson: Lesson) => void;
  markLessonCompleted: (lessonId: number) => Promise<void>;
  updateLessonStatus: (lessonId: number, status: Lesson['status']) => Promise<void>;
  togglePaid: (lessonId: number, studentId?: number) => Promise<void>;
  remindLessonPayment: (
    lessonId: number,
    studentId?: number,
    options?: { force?: boolean },
  ) => Promise<{ status: 'sent' | 'error' }>;
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
  updateLessonsForCurrentRange,
  isLessonInCurrentRange,
  loadStudentLessons,
  loadStudentLessonsSummary,
  loadStudentUnpaidLessons,
  loadDashboardUnpaidLessons,
  refreshPayments,
  refreshPaymentReminders,
  triggerStudentsListReload,
  studentDebtItems,
}: LessonActionsConfig): LessonActionsContextValue => {
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft>(() =>
    createLessonDraft(timeZone, teacherDefaultLessonDuration),
  );
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editingLessonOriginal, setEditingLessonOriginal] = useState<Lesson | null>(null);

  useEffect(() => {
    setLessonDraft((draft) => ({
      ...draft,
      endTime: resolveLessonEndTime(draft.time, teacherDefaultLessonDuration),
    }));
  }, [teacherDefaultLessonDuration]);

  useEffect(() => {
    if (selectedStudentId) {
      setLessonDraft((draft) => ({ ...draft, studentId: selectedStudentId }));
    }
  }, [selectedStudentId]);

  const openLessonModal = useCallback(
    (dateISO: string, time?: string, existing?: Lesson) => {
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

      setLessonDraft((draft) => {
        const nextStartTime = time ?? (startDate ? format(startDate, 'HH:mm') : draft.time);
        const nextDuration = existing?.durationMinutes ?? teacherDefaultLessonDuration;

        return {
          ...draft,
          date: dateISO,
          time: nextStartTime,
          studentId: existing?.studentId ?? draft.studentId ?? selectedStudentId ?? undefined,
          studentIds:
            existingStudentIds.length > 0
              ? existingStudentIds
              : draft.studentIds.length > 0
                ? draft.studentIds
                : selectedStudentId
                  ? [selectedStudentId]
                  : [],
          endTime: resolveLessonEndTime(nextStartTime, nextDuration),
          meetingLink: existing?.meetingLink ?? '',
          color: existing?.color ?? DEFAULT_LESSON_COLOR,
          isRecurring: existing ? Boolean(existing.isRecurring) : draft.isRecurring,
          repeatWeekdays: existing ? recurrenceWeekdays : draft.repeatWeekdays,
          repeatUntil: existing?.recurrenceUntil
            ? formatInTimeZone(existing.recurrenceUntil, 'yyyy-MM-dd', { timeZone })
            : draft.repeatUntil,
        };
      });

      setEditingLessonId(existing?.id ?? null);
      setEditingLessonOriginal(existing ?? null);
      setLessonModalOpen(true);
      navigateToSchedule();
      setDayViewDate(toZonedDate(toUtcDateFromDate(dateISO, timeZone), timeZone));
    },
    [navigateToSchedule, selectedStudentId, setDayViewDate, teacherDefaultLessonDuration, timeZone],
  );

  const closeLessonModal = useCallback(() => {
    setLessonModalOpen(false);
    setEditingLessonId(null);
    setEditingLessonOriginal(null);
    setLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
  }, []);

  const handleLessonDraftChange = useCallback((draft: LessonDraft) => {
    setLessonDraft(draft);
  }, []);

  const performDeleteLesson = useCallback(
    async (applyToSeries: boolean) => {
      if (!editingLessonId) return;
      const recurrenceGroupId = editingLessonOriginal?.recurrenceGroupId;

      try {
        await api.deleteLesson(editingLessonId, { applyToSeries });
        updateLessonsForCurrentRange((prev) => {
          if (applyToSeries && recurrenceGroupId) {
            return prev.filter((lesson) => lesson.recurrenceGroupId !== recurrenceGroupId);
          }
          return prev.filter((lesson) => lesson.id !== editingLessonId);
        });
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
      editingLessonOriginal?.recurrenceGroupId,
      loadStudentLessons,
      loadStudentLessonsSummary,
      showInfoDialog,
      updateLessonsForCurrentRange,
    ],
  );

  const requestDeleteLesson = useCallback(() => {
    if (!editingLessonId) return;
    const original = editingLessonOriginal;

    if (original?.isRecurring && original.recurrenceGroupId) {
      openRecurringDeleteDialog({
        title: 'Удалить урок?',
        message: 'Это повторяющийся урок. Выберите, удалить только выбранное занятие или всю серию.',
        applyToSeries: false,
        onConfirm: (applyToSeries) => {
          void performDeleteLesson(applyToSeries);
        },
      });
      return;
    }

    openConfirmDialog({
      title: 'Удалить урок?',
      message: 'Удалённый урок нельзя будет вернуть. Продолжить?',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      onConfirm: () => {
        void performDeleteLesson(false);
      },
    });
  }, [editingLessonId, editingLessonOriginal, openConfirmDialog, openRecurringDeleteDialog, performDeleteLesson]);

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

      try {
        if (editingLessonId) {
          const original = editingLessonOriginal;
          const originalWeekdays = original?.recurrenceWeekdays ?? [];
          const originalUntil = original?.recurrenceUntil
            ? formatInTimeZone(original.recurrenceUntil, 'yyyy-MM-dd', { timeZone })
            : '';
          const repeatChanged =
            (lessonDraft.repeatUntil ?? '') !== originalUntil ||
            lessonDraft.repeatWeekdays.length !== originalWeekdays.length ||
            lessonDraft.repeatWeekdays.some((day) => !originalWeekdays.includes(day));

          if (original?.isRecurring && !repeatChanged && options?.applyToSeriesOverride === undefined) {
            openConfirmDialog({
              title: 'Изменить только этот урок или всю серию?',
              message:
                'Это повторяющийся урок. Вы можете отредактировать только выбранное занятие или сразу всю серию.',
              confirmText: 'Изменить серию',
              cancelText: 'Только этот урок',
              onConfirm: () => {
                saveLesson({ applyToSeriesOverride: true });
              },
              onCancel: () => {
                saveLesson({ applyToSeriesOverride: false, detachFromSeries: true });
              },
            });
            return;
          }

          const applyToSeries =
            options?.applyToSeriesOverride ?? Boolean(original?.isRecurring && (repeatChanged || lessonDraft.isRecurring));
          const shouldDetach = options?.detachFromSeries ?? (!applyToSeries && Boolean(original?.isRecurring));

          const data = await api.updateLesson(editingLessonId, {
            studentIds: lessonDraft.studentIds,
            startAt,
            durationMinutes,
            color: lessonDraft.color,
            meetingLink,
            applyToSeries,
            detachFromSeries: shouldDetach,
            repeatWeekdays: lessonDraft.isRecurring ? lessonDraft.repeatWeekdays : undefined,
            repeatUntil:
              lessonDraft.isRecurring && lessonDraft.repeatUntil
                ? toUtcEndOfDay(lessonDraft.repeatUntil, timeZone).toISOString()
                : undefined,
          });

          if (shouldDetach) {
            setLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
          }

          if (data.lessons && data.lessons.length > 0) {
            const normalized = filterLessonsForCurrentRange(data.lessons.map(normalizeLesson));
            updateLessonsForCurrentRange((prev) => {
              const groupId = data.lessons?.[0]?.recurrenceGroupId;
              const filtered = groupId
                ? prev.filter((lesson) => lesson.recurrenceGroupId !== groupId && lesson.id !== editingLessonId)
                : prev.filter((lesson) => lesson.id !== editingLessonId);
              return [...filtered, ...normalized];
            });
          } else if (data.lesson) {
            const normalizedLesson = normalizeLesson(data.lesson);
            updateLessonsForCurrentRange((prevLessons) => {
              if (!isLessonInCurrentRange(normalizedLesson)) {
                return prevLessons.filter((lesson) => lesson.id !== editingLessonId);
              }
              const exists = prevLessons.some((lesson) => lesson.id === editingLessonId);
              if (exists) {
                return prevLessons.map((lesson) => (lesson.id === editingLessonId ? normalizedLesson : lesson));
              }
              return [...prevLessons, normalizedLesson];
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

          const normalized = filterLessonsForCurrentRange(data.lessons.map(normalizeLesson));
          updateLessonsForCurrentRange((prev) => {
            const existingKeys = new Set(prev.map((lesson) => `${lesson.id}`));
            const next = [...prev];
            normalized.forEach((lesson) => {
              if (!existingKeys.has(`${lesson.id}`)) {
                next.push(lesson);
                existingKeys.add(`${lesson.id}`);
              }
            });
            return next;
          });
        } else {
          const data = await api.createLesson({
            studentIds: lessonDraft.studentIds,
            startAt,
            durationMinutes,
            color: lessonDraft.color,
            meetingLink,
          });

          const normalizedLesson = normalizeLesson(data.lesson);
          updateLessonsForCurrentRange((prev) => {
            if (!isLessonInCurrentRange(normalizedLesson)) {
              return prev;
            }
            return [...prev, normalizedLesson];
          });
        }

        await loadStudentLessons();
        await loadStudentLessonsSummary();
        setLessonModalOpen(false);
        setEditingLessonId(null);
        navigateToSchedule();
        setLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать урок';
        showInfoDialog('Ошибка', message);
        // eslint-disable-next-line no-console
        console.error('Failed to create lesson', error);
      }
    },
    [
      editingLessonId,
      editingLessonOriginal,
      filterLessonsForCurrentRange,
      isLessonInCurrentRange,
      lessonDraft,
      loadStudentLessons,
      loadStudentLessonsSummary,
      navigateToSchedule,
      openConfirmDialog,
      showInfoDialog,
      timeZone,
      updateLessonsForCurrentRange,
    ],
  );

  const startEditLesson = useCallback(
    (lesson: Lesson) => {
      const start = toZonedDate(lesson.startAt, timeZone);
      const time = format(start, 'HH:mm');
      openLessonModal(format(start, 'yyyy-MM-dd'), time, lesson);
    },
    [openLessonModal, timeZone],
  );

  const openCreateLessonForStudent = useCallback(
    (studentId?: number) => {
      const targetDate = lessonDraft.date || todayISO(timeZone);
      if (studentId) {
        setSelectedStudentId((prev) => prev ?? studentId);
        setLessonDraft((draft) => ({
          ...draft,
          studentId,
          studentIds: [studentId],
        }));
      }
      openLessonModal(targetDate, lessonDraft.time);
    },
    [lessonDraft.date, lessonDraft.time, openLessonModal, setSelectedStudentId, timeZone],
  );

  const deleteLessonWithOptions = useCallback(
    async (lesson: Lesson, applyToSeries: boolean) => {
      try {
        await api.deleteLesson(lesson.id, applyToSeries ? { applyToSeries } : undefined);
        updateLessonsForCurrentRange((prev) => {
          if (applyToSeries && lesson.recurrenceGroupId) {
            return prev.filter((item) => item.recurrenceGroupId !== lesson.recurrenceGroupId);
          }
          return prev.filter((item) => item.id !== lesson.id);
        });
        await loadStudentLessons();
        await loadStudentLessonsSummary();
        await loadDashboardUnpaidLessons();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete lesson', error);
      }
    },
    [loadDashboardUnpaidLessons, loadStudentLessons, loadStudentLessonsSummary, updateLessonsForCurrentRange],
  );

  const requestDeleteLessonFromList = useCallback(
    (lesson: Lesson) => {
      if (lesson.isRecurring && lesson.recurrenceGroupId) {
        openRecurringDeleteDialog({
          title: 'Удалить урок?',
          message: 'Это повторяющийся урок. Выберите, удалить только выбранное занятие или всю серию.',
          applyToSeries: false,
          onConfirm: (applyToSeries) => {
            void deleteLessonWithOptions(lesson, applyToSeries);
          },
        });
        return;
      }

      openConfirmDialog({
        title: 'Удалить урок?',
        message: 'Удалённый урок нельзя будет вернуть. Продолжить?',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          void deleteLessonWithOptions(lesson, false);
        },
      });
    },
    [deleteLessonWithOptions, openConfirmDialog, openRecurringDeleteDialog],
  );

  const markLessonCompleted = useCallback(
    async (lessonId: number) => {
      try {
        const data = await api.markLessonCompleted(lessonId);
        updateLessonsForCurrentRange((prev) =>
          prev.map((lesson) => (lesson.id === lessonId ? normalizeLesson({ ...lesson, ...data.lesson }) : lesson)),
        );

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
      updateLessonsForCurrentRange,
    ],
  );

  const updateLessonStatus = useCallback(
    async (lessonId: number, status: Lesson['status']) => {
      try {
        const data = await api.updateLessonStatus(lessonId, status);
        updateLessonsForCurrentRange((prev) =>
          prev.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)),
        );

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
      updateLessonsForCurrentRange,
    ],
  );

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
          const normalizedLesson = normalizeLesson(data.lesson);
          updateLessonsForCurrentRange((prev) =>
            prev.map((lesson) => (lesson.id === lessonId ? normalizedLesson : lesson)),
          );

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
          const normalizedLesson = normalizeLesson(data.lesson);
          updateLessonsForCurrentRange((prev) =>
            prev.map((lesson) => (lesson.id === lessonId ? normalizedLesson : lesson)),
          );

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
      triggerStudentsListReload,
      updateLessonsForCurrentRange,
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
      lessonDraft,
      editingLessonId,
      recurrenceLocked: Boolean(editingLessonOriginal?.isRecurring),
      defaultLessonDuration: teacherDefaultLessonDuration,
      openLessonModal,
      closeLessonModal,
      setLessonDraft: handleLessonDraftChange,
      saveLesson,
      requestDeleteLesson,
      startEditLesson,
      openCreateLessonForStudent,
      requestDeleteLessonFromList,
      markLessonCompleted,
      updateLessonStatus,
      togglePaid,
      remindLessonPayment,
    }),
    [
      closeLessonModal,
      editingLessonId,
      editingLessonOriginal?.isRecurring,
      handleLessonDraftChange,
      lessonDraft,
      lessonModalOpen,
      openCreateLessonForStudent,
      openLessonModal,
      requestDeleteLesson,
      requestDeleteLessonFromList,
      saveLesson,
      startEditLesson,
      teacherDefaultLessonDuration,
      markLessonCompleted,
      remindLessonPayment,
      togglePaid,
      updateLessonStatus,
    ],
  );
};
