import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { api } from '../../../shared/api/client';
import { PaymentEvent, Student, TeacherStudent } from '../../../entities/types';
import { type ToastOptions } from '../../../shared/lib/toast';

type StudentDraft = { customName: string; username: string; pricePerLesson: string };

type OpenConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export type StudentActionSource = 'default' | 'onboarding_hero' | 'onboarding_stepper' | 'onboarding_quick_action';
export type ModalVariant = 'modal' | 'sheet';

export type StudentsActionsConfig = {
  students: Student[];
  links: TeacherStudent[];
  setStudents: Dispatch<SetStateAction<Student[]>>;
  setLinks: Dispatch<SetStateAction<TeacherStudent[]>>;
  selectedStudentId: number | null;
  setSelectedStudentId: Dispatch<SetStateAction<number | null>>;
  showToast: (options: ToastOptions) => void;
  showInfoDialog: (title: string, message: string, confirmText?: string) => void;
  openConfirmDialog: (options: OpenConfirmDialogOptions) => void;
  navigateToStudents: () => void;
  triggerStudentsListReload: () => void;
  refreshPayments: (studentId: number) => Promise<void>;
  clearStudentData: (studentId: number) => void;
  onStudentCreateStarted?: (source: StudentActionSource) => void;
  onStudentCreated?: (payload: { student: Student; link: TeacherStudent; source: StudentActionSource }) => void;
  onStudentCreateError?: (error: unknown, source: StudentActionSource) => void;
};

export type StudentsActionsContextValue = {
  studentModalOpen: boolean;
  studentModalVariant: ModalVariant;
  newStudentDraft: StudentDraft;
  isEditingStudent: boolean;
  priceEditState: { id: number | null; value: string };

  openCreateStudentModal: (options?: { source?: StudentActionSource; variant?: ModalVariant }) => void;
  openEditStudentModal: () => void;
  closeStudentModal: () => void;
  setStudentDraft: (draft: StudentDraft) => void;
  submitStudent: () => void;
  requestDeleteStudent: (studentId: number) => void;

  startEditPrice: (student: Student & { link: TeacherStudent }) => void;
  setPriceValue: (value: string) => void;
  savePrice: () => Promise<void>;
  cancelPriceEdit: () => void;

  togglePaymentReminders: (studentId: number, enabled: boolean) => Promise<void>;
  adjustBalance: (studentId: number, delta: number) => Promise<void>;
  topupBalance: (
    studentId: number,
    payload: { delta: number; type: PaymentEvent['type']; comment?: string; createdAt?: string },
  ) => Promise<void>;
};

const StudentsActionsContext = createContext<StudentsActionsContextValue | null>(null);

export const StudentsActionsProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: StudentsActionsContextValue }>) => {
  return <StudentsActionsContext.Provider value={value}>{children}</StudentsActionsContext.Provider>;
};

export const useStudentsActions = () => {
  const context = useContext(StudentsActionsContext);
  if (!context) {
    throw new Error('useStudentsActions must be used within StudentsActionsProvider');
  }
  return context;
};

const createEmptyDraft = (): StudentDraft => ({
  customName: '',
  username: '',
  pricePerLesson: '',
});

const parseStudentPrice = (value: string) => {
  if (!value.trim()) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return Math.round(numericValue);
};

export const useStudentsActionsInternal = ({
  students,
  links,
  setStudents,
  setLinks,
  selectedStudentId,
  setSelectedStudentId,
  showToast,
  showInfoDialog,
  openConfirmDialog,
  navigateToStudents,
  triggerStudentsListReload,
  refreshPayments,
  clearStudentData,
  onStudentCreateStarted,
  onStudentCreated,
  onStudentCreateError,
}: StudentsActionsConfig): StudentsActionsContextValue => {
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [studentModalSource, setStudentModalSource] = useState<StudentActionSource>('default');
  const [studentModalVariant, setStudentModalVariant] = useState<ModalVariant>('modal');
  const [newStudentDraft, setNewStudentDraft] = useState<StudentDraft>(() => createEmptyDraft());
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [priceEditState, setPriceEditState] = useState<{ id: number | null; value: string }>({ id: null, value: '' });

  const resetStudentDraft = useCallback(() => {
    setNewStudentDraft(createEmptyDraft());
  }, []);

  const openCreateStudentModal = useCallback(
    (options?: { source?: StudentActionSource; variant?: ModalVariant }) => {
      resetStudentDraft();
      setEditingStudentId(null);
      setStudentModalSource(options?.source ?? 'default');
      setStudentModalVariant(options?.variant ?? 'modal');
      setStudentModalOpen(true);
    },
    [resetStudentDraft],
  );

  const openEditStudentModal = useCallback(() => {
    if (!selectedStudentId) return;
    const student = students.find((entry) => entry.id === selectedStudentId);
    const link = links.find((entry) => entry.studentId === selectedStudentId && !entry.isArchived);
    if (!student || !link) return;
    setNewStudentDraft({
      customName: link.customName,
      username: student.username ?? '',
      pricePerLesson: typeof link.pricePerLesson === 'number' ? String(link.pricePerLesson) : '',
    });
    setEditingStudentId(selectedStudentId);
    setStudentModalSource('default');
    setStudentModalVariant('modal');
    setStudentModalOpen(true);
  }, [links, selectedStudentId, students]);

  const closeStudentModal = useCallback(() => {
    setStudentModalOpen(false);
    setEditingStudentId(null);
    setStudentModalSource('default');
    setStudentModalVariant('modal');
  }, []);

  const setStudentDraft = useCallback((draft: StudentDraft) => {
    setNewStudentDraft(draft);
  }, []);

  const handleAddStudent = useCallback(async () => {
    if (!newStudentDraft.customName.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите имя ученика.');
      return;
    }
    if (!newStudentDraft.username.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите Telegram username ученика.');
      return;
    }
    const pricePerLesson = parseStudentPrice(newStudentDraft.pricePerLesson);
    if (pricePerLesson === null) {
      showInfoDialog('Заполните все поля', 'Укажите цену занятия для ученика.');
      return;
    }

    const isOnboardingSource = studentModalSource.startsWith('onboarding');
    onStudentCreateStarted?.(studentModalSource);
    try {
      const data = await api.addStudent({
        customName: newStudentDraft.customName,
        username: newStudentDraft.username || undefined,
        pricePerLesson,
      });

      const { student, link } = data;

      setStudents((prev) => {
        if (prev.find((s) => s.id === student.id)) return prev;
        return [...prev, student];
      });

      setLinks((prev) => {
        const exists = prev.find((l) => l.studentId === link.studentId && l.teacherId === link.teacherId);
        if (exists) {
          return prev.map((l) => (l.studentId === link.studentId && l.teacherId === link.teacherId ? link : l));
        }
        return [...prev, link];
      });

      resetStudentDraft();
      setSelectedStudentId(student.id);
      if (!isOnboardingSource) {
        navigateToStudents();
      }
      closeStudentModal();
      triggerStudentsListReload();
      if (isOnboardingSource) {
        showToast({ message: 'Ученик добавлен. Отлично стартуем ✅', variant: 'success' });
      }
      onStudentCreated?.({ student, link, source: studentModalSource });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add student', error);
      onStudentCreateError?.(error, studentModalSource);
    }
  }, [
    closeStudentModal,
    navigateToStudents,
    newStudentDraft.customName,
    newStudentDraft.pricePerLesson,
    newStudentDraft.username,
    onStudentCreateError,
    onStudentCreateStarted,
    onStudentCreated,
    resetStudentDraft,
    setLinks,
    setSelectedStudentId,
    setStudents,
    showInfoDialog,
    showToast,
    studentModalSource,
    triggerStudentsListReload,
  ]);

  const handleUpdateStudent = useCallback(async () => {
    if (!editingStudentId) return;
    if (!newStudentDraft.customName.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите имя ученика.');
      return;
    }
    if (!newStudentDraft.username.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите Telegram username ученика.');
      return;
    }
    const pricePerLesson = parseStudentPrice(newStudentDraft.pricePerLesson);
    if (pricePerLesson === null) {
      showInfoDialog('Заполните все поля', 'Укажите цену занятия для ученика.');
      return;
    }
    try {
      const data = await api.updateStudent(editingStudentId, {
        customName: newStudentDraft.customName,
        username: newStudentDraft.username || undefined,
        pricePerLesson,
      });

      setStudents((prev) => prev.map((s) => (s.id === data.student.id ? data.student : s)));
      setLinks((prev) =>
        prev.map((l) =>
          l.studentId === data.link.studentId && l.teacherId === data.link.teacherId ? data.link : l,
        ),
      );
      resetStudentDraft();
      closeStudentModal();
      triggerStudentsListReload();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update student', error);
    }
  }, [
    closeStudentModal,
    editingStudentId,
    newStudentDraft.customName,
    newStudentDraft.pricePerLesson,
    newStudentDraft.username,
    resetStudentDraft,
    setLinks,
    setStudents,
    showInfoDialog,
    triggerStudentsListReload,
  ]);

  const submitStudent = useCallback(() => {
    if (editingStudentId) {
      void handleUpdateStudent();
      return;
    }
    void handleAddStudent();
  }, [editingStudentId, handleAddStudent, handleUpdateStudent]);

  const performDeleteStudent = useCallback(
    async (studentId: number) => {
      try {
        await api.deleteStudent(studentId);
        setLinks((prev) => prev.filter((link) => link.studentId !== studentId));
        clearStudentData(studentId);
        if (selectedStudentId === studentId) {
          setSelectedStudentId(null);
        }
        triggerStudentsListReload();
        showToast({ message: 'Ученик удалён из списка', variant: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось удалить ученика';
        showInfoDialog('Ошибка', message);
        // eslint-disable-next-line no-console
        console.error('Failed to delete student', error);
      }
    },
    [
      clearStudentData,
      selectedStudentId,
      setLinks,
      setSelectedStudentId,
      showInfoDialog,
      showToast,
      triggerStudentsListReload,
    ],
  );

  const requestDeleteStudent = useCallback(
    (studentId: number) => {
      const studentName = links.find((link) => link.studentId === studentId)?.customName ?? 'ученика';
      openConfirmDialog({
        title: `Удалить ${studentName}?`,
        message:
          'Связь с учеником будет удалена из вашего списка. Данные ученика сохранятся и восстановятся при повторном добавлении.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          performDeleteStudent(studentId);
        },
      });
    },
    [links, openConfirmDialog, performDeleteStudent],
  );

  const startEditPrice = useCallback((student: Student & { link: TeacherStudent }) => {
    setPriceEditState({ id: student.id, value: String(student.link.pricePerLesson ?? '') });
  }, []);

  const setPriceValue = useCallback((value: string) => {
    setPriceEditState((prev) => ({ ...prev, value }));
  }, []);

  const savePrice = useCallback(async () => {
    if (!priceEditState.id) return;
    const numeric = Number(priceEditState.value);
    if (Number.isNaN(numeric) || numeric < 0) return;
    try {
      const data = await api.updatePrice(priceEditState.id, numeric);
      setLinks((prev) => prev.map((link) => (link.id === data.link.id ? data.link : link)));
      setPriceEditState({ id: null, value: '' });
      triggerStudentsListReload();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update price', error);
    }
  }, [priceEditState.id, priceEditState.value, setLinks, triggerStudentsListReload]);

  const cancelPriceEdit = useCallback(() => {
    setPriceEditState({ id: null, value: '' });
  }, []);

  const togglePaymentReminders = useCallback(
    async (studentId: number, enabled: boolean) => {
      try {
        const data = await api.updateStudentPaymentReminders(studentId, enabled);
        setStudents((prev) => prev.map((student) => (student.id === studentId ? data.student : student)));
        triggerStudentsListReload();
        showToast({
          message: data.student.paymentRemindersEnabled
            ? 'Авто-напоминания об оплате включены'
            : 'Авто-напоминания об оплате выключены',
          variant: 'success',
        });
      } catch (error) {
        showToast({
          message: 'Не удалось обновить настройки напоминаний',
          variant: 'error',
        });
      }
    },
    [setStudents, showToast, triggerStudentsListReload],
  );

  const adjustBalance = useCallback(
    async (studentId: number, delta: number) => {
      try {
        const data = await api.adjustBalance(studentId, { delta });
        setLinks((prev) => prev.map((link) => (link.studentId === studentId ? data.link : link)));
        await refreshPayments(studentId);
        triggerStudentsListReload();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to adjust balance', error);
      }
    },
    [refreshPayments, setLinks, triggerStudentsListReload],
  );

  const topupBalance = useCallback(
    async (
      studentId: number,
      payload: { delta: number; type: PaymentEvent['type']; comment?: string; createdAt?: string },
    ) => {
      try {
        const data = await api.adjustBalance(studentId, payload);
        setLinks((prev) => prev.map((link) => (link.studentId === studentId ? data.link : link)));
        await refreshPayments(studentId);
        triggerStudentsListReload();
        showToast({
          message:
            payload.delta > 0
              ? `Баланс пополнен на ${payload.delta} занятий`
              : `Списано ${Math.abs(payload.delta)} занятий`,
          variant: 'success',
        });
      } catch (error) {
        throw error instanceof Error ? error : new Error('Не удалось пополнить баланс.');
      }
    },
    [refreshPayments, setLinks, showToast, triggerStudentsListReload],
  );

  const contextValue = useMemo(
    () => ({
      studentModalOpen,
      studentModalVariant,
      newStudentDraft,
      isEditingStudent: Boolean(editingStudentId),
      priceEditState,
      openCreateStudentModal,
      openEditStudentModal,
      closeStudentModal,
      setStudentDraft,
      submitStudent,
      requestDeleteStudent,
      startEditPrice,
      setPriceValue,
      savePrice,
      cancelPriceEdit,
      togglePaymentReminders,
      adjustBalance,
      topupBalance,
    }),
    [
      adjustBalance,
      cancelPriceEdit,
      closeStudentModal,
      editingStudentId,
      newStudentDraft,
      openCreateStudentModal,
      openEditStudentModal,
      priceEditState,
      requestDeleteStudent,
      savePrice,
      setPriceValue,
      setStudentDraft,
      studentModalOpen,
      studentModalVariant,
      submitStudent,
      togglePaymentReminders,
      topupBalance,
    ],
  );

  return contextValue;
};
