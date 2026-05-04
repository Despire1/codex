import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, format } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Lesson, LessonMutationPreview, LessonSeriesScope, LinkedStudent } from '../../entities/types';
import { useTimeZone } from '../../shared/lib/timezoneContext';
import { toUtcDateFromTimeZone, toZonedDate } from '../../shared/lib/timezoneDates';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { isLessonInSeries } from '../../entities/lesson/lib/lessonDetails';
import { resolveLessonCancelActionCopy } from '../../entities/lesson/lib/lessonStatusPresentation';
import type { LessonCancelRefundMode } from '../../features/lessons/model/types';
import { isDateInWeekdayList, normalizeWeekdayList } from '../../shared/lib/weekdays';
import { LessonCancelDialog } from '../../features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonRestoreDialog } from '../../features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '../../features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { api } from '../../shared/api/client';
import { Toolbar, type ScheduleV2View } from './components/Toolbar';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { LessonDrawer } from './components/LessonDrawer/LessonDrawer';
import { formatPeriodDay, formatPeriodMonth, formatPeriodWeek } from './lib/formatHelpers';
import styles from './ScheduleSectionV2.module.css';

interface ScheduleSectionV2Props {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  autoConfirmLessons: boolean;
  weekendWeekdays: number[];
}

export const ScheduleSectionV2: FC<ScheduleSectionV2Props> = ({
  lessons,
  linkedStudents,
  autoConfirmLessons: _autoConfirmLessons,
  weekendWeekdays,
}) => {
  const timeZone = useTimeZone();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    openLessonModal,
    openRescheduleModal,
    cancelLesson,
    restoreLesson,
    rescheduleLessonByDrag,
    markLessonCompleted,
    updateLessonStatus,
    requestDeleteLessonFromList,
    openConfirmDialog,
  } = useLessonActions();

  const [view, setView] = useState<ScheduleV2View>('month');
  const [anchor, setAnchor] = useState<Date>(() => toZonedDate(new Date(), timeZone));
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  // Локальные patch'и поверх props.lessons — чтобы изменения в drawer
  // мгновенно отражались в Month/Week/Day без ожидания глобального refetch.
  const [localPatches, setLocalPatches] = useState<Record<number, Partial<Lesson>>>({});

  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);

  const effectiveLessons = useMemo(() => {
    if (Object.keys(localPatches).length === 0) return lessons;
    return lessons.map((l) => (localPatches[l.id] ? { ...l, ...localPatches[l.id] } : l));
  }, [lessons, localPatches]);

  const handleLocalLessonPatch = useCallback((lessonId: number, patch: Partial<Lesson>) => {
    setLocalPatches((prev) => ({
      ...prev,
      [lessonId]: { ...(prev[lessonId] ?? {}), ...patch },
    }));
  }, []);

  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const now = toZonedDate(new Date(), timeZone);
    return now.getHours() * 60 + now.getMinutes();
  });
  useEffect(() => {
    const tick = () => {
      const n = toZonedDate(new Date(), timeZone);
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timeZone]);

  const linkedStudentsById = useMemo(() => {
    const map = new Map<number, LinkedStudent>();
    linkedStudents.forEach((ls) => map.set(ls.id, ls));
    return map;
  }, [linkedStudents]);

  const periodLabel = useMemo(() => {
    if (view === 'month') return formatPeriodMonth(anchor);
    if (view === 'week') return formatPeriodWeek(anchor);
    return formatPeriodDay(anchor);
  }, [anchor, view]);

  const handlePrev = useCallback(() => {
    setAnchor((prev) => {
      if (view === 'month') return addMonths(prev, -1);
      if (view === 'week') return addDays(prev, -7);
      return addDays(prev, -1);
    });
  }, [view]);
  const handleNext = useCallback(() => {
    setAnchor((prev) => {
      if (view === 'month') return addMonths(prev, 1);
      if (view === 'week') return addDays(prev, 7);
      return addDays(prev, 1);
    });
  }, [view]);
  const handleToday = useCallback(() => {
    setAnchor(toZonedDate(new Date(), timeZone));
  }, [timeZone]);

  // Hotkeys: ← → перемещают период, M/W/D переключают view, T → сегодня.
  // Игнорируем когда фокус в инпуте/textarea/contenteditable, и когда есть мод-клавиши.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case 't':
        case 'T':
        case 'е':
        case 'Е':
          handleToday();
          break;
        case 'm':
        case 'M':
        case 'ь':
        case 'Ь':
          setView('month');
          break;
        case 'w':
        case 'W':
        case 'ц':
        case 'Ц':
          setView('week');
          break;
        case 'd':
        case 'D':
        case 'в':
        case 'В':
          setView('day');
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePrev, handleNext, handleToday]);

  const selectedLesson = useMemo(
    () => (selectedLessonId == null ? null : (effectiveLessons.find((l) => l.id === selectedLessonId) ?? null)),
    [effectiveLessons, selectedLessonId],
  );

  const handleLessonClick = useCallback((lesson: Lesson) => {
    setSelectedLessonId(lesson.id);
  }, []);

  const normalizedWeekendWeekdays = useMemo(() => normalizeWeekdayList(weekendWeekdays), [weekendWeekdays]);

  const handleEmptyDayClick = useCallback(
    (dayIso: string) => {
      // dayIso = "yyyy-MM-dd" в TZ преподавателя; собираем дату через UTC от полуночи,
      // чтобы день недели не «плыл» из-за конверсий часовых поясов.
      const dayDate = toZonedDate(toUtcDateFromTimeZone(dayIso, '00:00', timeZone), timeZone);
      const isWeekend = isDateInWeekdayList(dayDate, normalizedWeekendWeekdays);

      if (isWeekend) {
        openConfirmDialog({
          title: 'Создать урок на выходной?',
          message: 'Этот день настроен как выходной. Точно поставить на него занятие?',
          confirmText: 'Создать',
          cancelText: 'Отмена',
          onConfirm: () => {
            openLessonModal(dayIso, '12:00', undefined, { allowWeekend: true });
          },
        });
        return;
      }

      openLessonModal(dayIso, '12:00');
    },
    [normalizedWeekendWeekdays, openConfirmDialog, openLessonModal, timeZone],
  );

  const handleCloseDrawer = useCallback(() => setSelectedLessonId(null), []);

  const handleRescheduleLesson = useCallback(() => {
    if (!selectedLesson) return;
    openRescheduleModal(selectedLesson);
    setSelectedLessonId(null);
  }, [openRescheduleModal, selectedLesson]);

  // === Cancel/Restore диалоги (тот же flow, что и в v1 ScheduleSection) ===
  const [cancelDialogLesson, setCancelDialogLesson] = useState<Lesson | null>(null);
  const [restoreDialogLesson, setRestoreDialogLesson] = useState<Lesson | null>(null);
  type PendingScopeAction =
    | {
        type: 'cancel';
        lesson: Lesson;
        refundMode?: LessonCancelRefundMode;
        previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
      }
    | {
        type: 'restore';
        lesson: Lesson;
        previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
      };
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);

  const handleRequestCancelLesson = useCallback(() => {
    if (!selectedLesson) return;
    setCancelDialogLesson(selectedLesson);
  }, [selectedLesson]);

  const handleRequestRestoreLesson = useCallback(() => {
    if (!selectedLesson) return;
    setRestoreDialogLesson(selectedLesson);
  }, [selectedLesson]);

  const handleRequestDeleteLesson = useCallback(() => {
    if (!selectedLesson) return;
    // requestDeleteLessonFromList сам поднимает recurring-delete-dialog (с series-scope для серий)
    // и подтверждение для одиночных уроков. Закрываем drawer, чтобы он не перекрывал dialog.
    setSelectedLessonId(null);
    requestDeleteLessonFromList(selectedLesson);
  }, [requestDeleteLessonFromList, selectedLesson]);

  const handleConfirmCancel = useCallback(
    (refundMode?: LessonCancelRefundMode) => {
      if (!cancelDialogLesson) return;
      const target = cancelDialogLesson;
      setCancelDialogLesson(null);
      setSelectedLessonId(null);

      if (isLessonInSeries(target)) {
        void Promise.all(
          (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
            const data = await api.previewLessonMutation(target.id, { action: 'CANCEL', scope });
            return [scope, data.preview] as const;
          }),
        )
          .then((entries) => {
            setScopeDialog({
              type: 'cancel',
              lesson: target,
              refundMode,
              previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
            });
          })
          .catch(() => {
            setScopeDialog({ type: 'cancel', lesson: target, refundMode });
          });
        return;
      }

      void cancelLesson(target, 'SINGLE', refundMode);
    },
    [cancelDialogLesson, cancelLesson],
  );

  const handleConfirmRestore = useCallback(() => {
    if (!restoreDialogLesson) return;
    const target = restoreDialogLesson;
    setRestoreDialogLesson(null);
    setSelectedLessonId(null);

    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'RESTORE', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'restore',
            lesson: target,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'restore', lesson: target });
        });
      return;
    }

    void restoreLesson(target, 'SINGLE');
  }, [restoreDialogLesson, restoreLesson]);

  const handleScopeConfirm = useCallback(
    (scope: LessonSeriesScope) => {
      if (!scopeDialog) return;
      const action = scopeDialog;
      setScopeDialog(null);
      if (action.type === 'cancel') {
        void cancelLesson(action.lesson, scope, action.refundMode);
      } else {
        void restoreLesson(action.lesson, scope);
      }
    },
    [cancelLesson, restoreLesson, scopeDialog],
  );

  const handleMarkCompleted = useCallback(async () => {
    if (!selectedLesson) return;
    await markLessonCompleted(selectedLesson.id);
  }, [markLessonCompleted, selectedLesson]);

  const handleMarkScheduled = useCallback(async () => {
    if (!selectedLesson) return;
    await updateLessonStatus(selectedLesson.id, 'SCHEDULED');
  }, [selectedLesson, updateLessonStatus]);

  /**
   * DnD: перенос урока в другой день месяца. Время суток у урока сохраняется.
   * Пользователь увидит series-scope dialog для серийных уроков (внутри rescheduleLessonByDrag).
   */
  const handleLessonDropOnDay = useCallback(
    (lesson: Lesson, targetDayIso: string) => {
      const originalZ = toZonedDate(lesson.startAt, timeZone);
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const time = `${pad(originalZ.getHours())}:${pad(originalZ.getMinutes())}`;
      const newStartAt = toUtcDateFromTimeZone(targetDayIso, time, timeZone).toISOString();
      if (newStartAt === lesson.startAt) return;
      void rescheduleLessonByDrag(lesson, newStartAt);
    },
    [rescheduleLessonByDrag, timeZone],
  );

  /**
   * DnD в WeekView: drop на конкретный временной слот другого дня.
   * Минуты округляются до 15 (как в v1).
   */
  const handleLessonDropOnSlot = useCallback(
    (lesson: Lesson, targetDayIso: string, minutesFromDayStart: number) => {
      const clamped = Math.max(0, Math.min(24 * 60 - 1, minutesFromDayStart));
      const snapped = Math.round(clamped / 15) * 15;
      const hh = Math.floor(snapped / 60);
      const mm = snapped % 60;
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const newStartAt = toUtcDateFromTimeZone(targetDayIso, `${pad(hh)}:${pad(mm)}`, timeZone).toISOString();
      if (newStartAt === lesson.startAt) return;
      void rescheduleLessonByDrag(lesson, newStartAt);
    },
    [rescheduleLessonByDrag, timeZone],
  );

  // Глубокая ссылка ?lessonId=… открывает drawer на этом уроке.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idStr = params.get('lessonId');
    if (!idStr) return;
    const id = Number(idStr);
    if (Number.isFinite(id) && lessons.some((l) => l.id === id)) {
      setSelectedLessonId(id);
      navigate('/schedule', { replace: true });
    }
  }, [location.search, lessons, navigate]);

  return (
    <section className={styles.shell}>
      <Toolbar
        view={view}
        onChangeView={setView}
        periodLabel={periodLabel}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />
      {view === 'month' ? (
        <MonthView
          anchor={anchor}
          lessons={effectiveLessons}
          linkedStudentsById={linkedStudentsById}
          timeZone={timeZone}
          todayZoned={todayZoned}
          weekendWeekdays={normalizedWeekendWeekdays}
          onLessonClick={handleLessonClick}
          onEmptyDayClick={handleEmptyDayClick}
          onLessonDropOnDay={handleLessonDropOnDay}
        />
      ) : null}
      {view === 'week' ? (
        <WeekView
          anchor={anchor}
          lessons={effectiveLessons}
          linkedStudentsById={linkedStudentsById}
          timeZone={timeZone}
          todayZoned={todayZoned}
          nowMinutes={nowMinutes}
          weekendWeekdays={normalizedWeekendWeekdays}
          onLessonClick={handleLessonClick}
          onLessonDropOnSlot={handleLessonDropOnSlot}
        />
      ) : null}
      {view === 'day' ? (
        <DayView
          anchor={anchor}
          lessons={effectiveLessons}
          linkedStudentsById={linkedStudentsById}
          timeZone={timeZone}
          todayZoned={todayZoned}
          nowMinutes={nowMinutes}
          weekendWeekdays={normalizedWeekendWeekdays}
          onLessonClick={handleLessonClick}
          onLessonDropOnSlot={handleLessonDropOnSlot}
        />
      ) : null}

      <LessonDrawer
        open={selectedLesson != null}
        lesson={selectedLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={handleCloseDrawer}
        onReschedule={handleRescheduleLesson}
        onRequestCancel={handleRequestCancelLesson}
        onRequestRestore={handleRequestRestoreLesson}
        onRequestDelete={handleRequestDeleteLesson}
        onMarkCompleted={handleMarkCompleted}
        onMarkScheduled={handleMarkScheduled}
        onLocalLessonPatch={handleLocalLessonPatch}
      />

      <LessonCancelDialog
        open={Boolean(cancelDialogLesson)}
        lesson={cancelDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setCancelDialogLesson(null)}
        onConfirm={handleConfirmCancel}
      />
      <LessonRestoreDialog
        open={Boolean(restoreDialogLesson)}
        lesson={restoreDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setRestoreDialogLesson(null)}
        onConfirm={handleConfirmRestore}
      />
      <SeriesScopeDialog
        open={Boolean(scopeDialog)}
        title={
          scopeDialog?.type === 'cancel'
            ? resolveLessonCancelActionCopy(scopeDialog.lesson).title.replace('?', '')
            : scopeDialog?.type === 'restore'
              ? 'Восстановить урок'
              : undefined
        }
        confirmText={
          scopeDialog?.type === 'cancel'
            ? resolveLessonCancelActionCopy(scopeDialog.lesson).confirmText
            : scopeDialog?.type === 'restore'
              ? 'Восстановить'
              : undefined
        }
        previews={scopeDialog?.previews}
        onClose={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />
    </section>
  );
};
