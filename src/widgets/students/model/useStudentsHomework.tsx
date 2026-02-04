import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../../../shared/api/client';
import { normalizeHomework } from '../../../shared/lib/normalizers';
import { toUtcDateFromDate } from '../../../shared/lib/timezoneDates';
import { Homework } from '../../../entities/types';
import { NewHomeworkDraft } from '../types';

type OpenConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export type StudentsHomeworkConfig = {
  timeZone: string;
  selectedStudentId: number | null;
  loadStudentHomeworks: () => Promise<void>;
  showInfoDialog: (title: string, message: string, confirmText?: string) => void;
  openConfirmDialog: (options: OpenConfirmDialogOptions) => void;
  triggerStudentsListReload: () => void;
};

export type StudentsHomeworkContextValue = {
  homeworks: Homework[];
  replaceHomeworks: (items: Homework[]) => void;
  newHomeworkDraft: NewHomeworkDraft;
  setHomeworkDraft: (draft: NewHomeworkDraft) => void;
  addHomework: () => Promise<void>;
  sendHomeworkToStudent: (homeworkId: number) => Promise<void>;
  duplicateHomework: (homeworkId: number) => Promise<void>;
  toggleHomeworkDone: (homeworkId: number) => Promise<void>;
  updateHomework: (homeworkId: number, payload: Partial<Homework>) => Promise<void>;
  deleteHomework: (homeworkId: number) => Promise<void>;
  remindHomework: (studentId: number) => Promise<void>;
  remindHomeworkById: (homeworkId: number) => Promise<void>;
};

const StudentsHomeworkContext = createContext<StudentsHomeworkContextValue | null>(null);

export const StudentsHomeworkProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: StudentsHomeworkContextValue }>) => {
  return <StudentsHomeworkContext.Provider value={value}>{children}</StudentsHomeworkContext.Provider>;
};

export const useStudentsHomework = () => {
  const context = useContext(StudentsHomeworkContext);
  if (!context) {
    throw new Error('useStudentsHomework must be used within StudentsHomeworkProvider');
  }
  return context;
};

const createEmptyDraft = (): NewHomeworkDraft => ({
  text: '',
  deadline: '',
  status: 'DRAFT',
  baseStatus: 'DRAFT',
  sendNow: false,
  remindBefore: true,
  timeSpentMinutes: '',
});

const parseTimeSpentMinutes = (value: string): number | null => {
  if (!value.trim()) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return Math.round(numericValue);
};

const resolveDeadlinePayload = (deadline: string | null | undefined, timeZone: string) => {
  if (!deadline) return undefined;
  const resolved = toUtcDateFromDate(deadline, timeZone);
  if (Number.isNaN(resolved.getTime())) return undefined;
  return resolved.toISOString();
};

export const useStudentsHomeworkInternal = ({
  timeZone,
  selectedStudentId,
  loadStudentHomeworks,
  showInfoDialog,
  openConfirmDialog,
  triggerStudentsListReload,
}: StudentsHomeworkConfig): StudentsHomeworkContextValue => {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [newHomeworkDraft, setNewHomeworkDraft] = useState<NewHomeworkDraft>(() => createEmptyDraft());

  useEffect(() => {
    setHomeworks((prev) =>
      prev.map((homework) =>
        normalizeHomework({ ...homework, deadline: homework.deadlineAt ?? homework.deadline }, timeZone),
      ),
    );
  }, [timeZone]);

  const replaceHomeworks = useCallback(
    (items: Homework[]) => {
      setHomeworks(items.map((homework) => normalizeHomework(homework, timeZone)));
    },
    [timeZone],
  );

  const setHomeworkDraft = useCallback((draft: NewHomeworkDraft) => {
    setNewHomeworkDraft({
      ...draft,
      baseStatus: draft.baseStatus ?? draft.status ?? 'DRAFT',
    });
  }, []);

  const sendHomeworkToStudent = useCallback(
    async (homeworkId: number) => {
      try {
        const result = await api.sendHomework(homeworkId);
        setHomeworks((prev) =>
          prev.map((hw) => (hw.id === homeworkId ? normalizeHomework(result.homework, timeZone) : hw)),
        );
        void loadStudentHomeworks();
        triggerStudentsListReload();
        showInfoDialog('Отправлено ученику', 'Задание опубликовано и отправлено ученику.');
      } catch (error) {
        openConfirmDialog({
          title: 'Не удалось отправить. Задание опубликовано.',
          message: 'Повторить отправку?',
          confirmText: 'Повторить',
          cancelText: 'Отмена',
          onConfirm: () => {
            void sendHomeworkToStudent(homeworkId);
          },
        });
        // eslint-disable-next-line no-console
        console.error('Failed to send homework to student', error);
      }
    },
    [loadStudentHomeworks, openConfirmDialog, showInfoDialog, timeZone, triggerStudentsListReload],
  );

  const addHomework = useCallback(async () => {
    if (!selectedStudentId || !newHomeworkDraft.text.trim()) return;

    const targetStatus = newHomeworkDraft.sendNow ? 'ASSIGNED' : newHomeworkDraft.status;
    const parsedTimeSpent = parseTimeSpentMinutes(newHomeworkDraft.timeSpentMinutes);

    try {
      const data = await api.createHomework({
        studentId: selectedStudentId,
        text: newHomeworkDraft.text,
        deadline: resolveDeadlinePayload(newHomeworkDraft.deadline, timeZone),
        status: targetStatus,
        timeSpentMinutes: parsedTimeSpent,
      });

      const normalized = normalizeHomework(data.homework, timeZone);
      setHomeworks((prev) => [...prev, normalized]);
      void loadStudentHomeworks();
      triggerStudentsListReload();

      if (newHomeworkDraft.sendNow) {
        await sendHomeworkToStudent(normalized.id);
      } else {
        showInfoDialog('Домашнее задание создано', 'Черновик сохранён.');
      }
      setNewHomeworkDraft(createEmptyDraft());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add homework', error);
    }
  }, [
    loadStudentHomeworks,
    newHomeworkDraft.deadline,
    newHomeworkDraft.sendNow,
    newHomeworkDraft.status,
    newHomeworkDraft.text,
    newHomeworkDraft.timeSpentMinutes,
    selectedStudentId,
    sendHomeworkToStudent,
    showInfoDialog,
    timeZone,
    triggerStudentsListReload,
  ]);

  const duplicateHomework = useCallback(
    async (homeworkId: number) => {
      const original = homeworks.find((hw) => hw.id === homeworkId);
      if (!original) return;
      try {
        const data = await api.createHomework({
          studentId: original.studentId,
          text: original.text,
          deadline: resolveDeadlinePayload(original.deadlineAt ?? original.deadline, timeZone),
          status: 'DRAFT',
          attachments: original.attachments ?? [],
        });
        const normalized = normalizeHomework(data.homework, timeZone);
        setHomeworks((prev) => [...prev, normalized]);
        void loadStudentHomeworks();
        triggerStudentsListReload();
        showInfoDialog('Черновик создан', 'Копия задания сохранена в черновики.');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to duplicate homework', error);
      }
    },
    [homeworks, loadStudentHomeworks, showInfoDialog, timeZone, triggerStudentsListReload],
  );

  const toggleHomeworkDone = useCallback(
    async (homeworkId: number) => {
      try {
        const data = await api.toggleHomework(homeworkId);
        setHomeworks((prev) =>
          prev.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework, timeZone) : hw)),
        );
        void loadStudentHomeworks();
        triggerStudentsListReload();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to toggle homework', error);
      }
    },
    [loadStudentHomeworks, timeZone, triggerStudentsListReload],
  );

  const updateHomework = useCallback(
    async (homeworkId: number, payload: Partial<Homework>) => {
      try {
        const resolvedPayload = { ...payload };
        if ('deadline' in payload) {
          resolvedPayload.deadline = payload.deadline
            ? resolveDeadlinePayload(payload.deadline, timeZone)
            : null;
        }
        const data = await api.updateHomework(homeworkId, resolvedPayload);
        setHomeworks((prev) =>
          prev.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework, timeZone) : hw)),
        );
        void loadStudentHomeworks();
        triggerStudentsListReload();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update homework', error);
      }
    },
    [loadStudentHomeworks, timeZone, triggerStudentsListReload],
  );

  const deleteHomework = useCallback(
    async (homeworkId: number) => {
      try {
        await api.deleteHomework(homeworkId);
        setHomeworks((prev) => prev.filter((hw) => hw.id !== homeworkId));
        void loadStudentHomeworks();
        triggerStudentsListReload();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete homework', error);
      }
    },
    [loadStudentHomeworks, triggerStudentsListReload],
  );

  const remindHomework = useCallback(
    async (studentId: number) => {
      try {
        await api.remindHomework(studentId);
        showInfoDialog('Напоминание отправлено', `Напоминание отправлено ученику #${studentId}`);
      } catch (error) {
        showInfoDialog('Не удалось отправить напоминание', 'Попробуйте ещё раз чуть позже.');
        // eslint-disable-next-line no-console
        console.error('Failed to send reminder', error);
      }
    },
    [showInfoDialog],
  );

  const remindHomeworkById = useCallback(
    async (homeworkId: number) => {
      try {
        const result = await api.remindHomeworkById(homeworkId);
        setHomeworks((prev) =>
          prev.map((hw) => (hw.id === homeworkId ? normalizeHomework(result.homework, timeZone) : hw)),
        );
        showInfoDialog('Напоминание отправлено', 'Мы отправим ученику напоминание.');
      } catch (error) {
        showInfoDialog('Не удалось отправить напоминание', 'Попробуйте ещё раз чуть позже.');
        // eslint-disable-next-line no-console
        console.error('Failed to send homework reminder', error);
      }
    },
    [showInfoDialog, timeZone],
  );

  return useMemo(
    () => ({
      homeworks,
      replaceHomeworks,
      newHomeworkDraft,
      setHomeworkDraft,
      addHomework,
      sendHomeworkToStudent,
      duplicateHomework,
      toggleHomeworkDone,
      updateHomework,
      deleteHomework,
      remindHomework,
      remindHomeworkById,
    }),
    [
      addHomework,
      deleteHomework,
      duplicateHomework,
      homeworks,
      newHomeworkDraft,
      remindHomework,
      remindHomeworkById,
      replaceHomeworks,
      sendHomeworkToStudent,
      setHomeworkDraft,
      toggleHomeworkDone,
      updateHomework,
    ],
  );
};
