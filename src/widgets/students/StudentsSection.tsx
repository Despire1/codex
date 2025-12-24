import { format, isBefore, parseISO } from 'date-fns';
import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
  type FC,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Homework,
  HomeworkAttachment,
  HomeworkStatus,
  Lesson,
  PaymentEvent,
  Student,
  StudentListItem,
} from '../../entities/types';
import styles from './StudentsSection.module.css';
import { HomeworkTab } from './components/HomeworkTab';
import { HomeworkCreateModal } from './components/HomeworkCreateModal';
import { HomeworkDrawer } from './components/HomeworkDrawer';
import { LessonsTab } from './components/LessonsTab';
import { OverviewTab } from './components/OverviewTab';
import { PaymentsTab } from './components/PaymentsTab';
import { StudentHero } from './components/StudentHero';
import { StudentsSidebar } from './components/StudentsSidebar';
import { HomeworkDraft, HomeworkStatusInfo, NewHomeworkDraft, SelectedStudent } from './types';
import { ru } from 'date-fns/locale';

interface StudentsSectionProps {
  studentListItems: StudentListItem[];
  studentListCounts: { withDebt: number; overdue: number };
  studentListTotal: number;
  studentListLoading: boolean;
  studentListHasMore: boolean;
  studentSearch: string;
  studentFilter: 'all' | 'debt' | 'overdue';
  selectedStudentId: number | null;
  priceEditState: { id: number | null; value: string };
  studentHomeworks: Homework[];
  homeworkFilter: 'all' | HomeworkStatus | 'overdue';
  homeworkListLoading: boolean;
  homeworkListHasMore: boolean;
  onSelectStudent: (id: number) => void;
  onStudentSearchChange: (value: string) => void;
  onStudentFilterChange: (value: 'all' | 'debt' | 'overdue') => void;
  onLoadMoreStudents: () => void;
  onHomeworkFilterChange: (filter: 'all' | HomeworkStatus | 'overdue') => void;
  onLoadMoreHomeworks: () => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onStartEditPrice: (student: Student) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onRemindHomework: (studentId: number) => void;
  onRemindHomeworkById?: (homeworkId: number) => void;
  onSendHomework?: (homeworkId: number) => void;
  onDuplicateHomework?: (homeworkId: number) => void;
  onDeleteHomework?: (homeworkId: number) => void;
  onAddHomework: () => void;
  onHomeworkDraftChange: (draft: NewHomeworkDraft) => void;
  onToggleHomework: (homeworkId: number) => void;
  onUpdateHomework?: (homeworkId: number, payload: Partial<Homework>) => void;
  onOpenStudentModal: () => void;
  lessons: Lesson[];
  payments: PaymentEvent[];
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate: string;
  onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
  onPaymentDateChange: (date: string) => void;
  onCompleteLesson: (lessonId: number) => void;
  onChangeLessonStatus: (lessonId: number, status: Lesson['status']) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onCreateLesson: (studentId?: number) => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: number) => void;
  newHomeworkDraft: NewHomeworkDraft;
}
const getHomeworkStatusInfo = (homework: Homework): HomeworkStatusInfo => {
  const baseStatus = (homework.status as HomeworkStatus) ?? (homework.isDone ? 'DONE' : 'ASSIGNED');
  if (homework.deadline) {
    const deadlineDate = parseISO(`${homework.deadline}T00:00:00`);
    if (isBefore(deadlineDate, new Date()) && baseStatus !== 'DONE') {
      return { status: baseStatus, isOverdue: true };
    }
  }
  return { status: baseStatus, isOverdue: false };
};

const getStatusLabel = (status: HomeworkStatus) => {
  if (status === 'DONE') return 'Выполнено';
  if (status === 'IN_PROGRESS') return 'В работе';
  if (status === 'ASSIGNED') return 'Назначено';
  return 'Черновик';
};

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
};

const getHomeworkTitle = (text: string) => {
  const normalized = (text ?? '').trim().replace(/\s+\n/g, '\n');
  const firstLine = normalized.split('\n').find((line) => line.trim().length > 0) ?? '';
  const baseTitle = firstLine || 'Домашнее задание';
  return truncate(baseTitle, 80) || 'Домашнее задание';
};

const parseTimeSpentInput = (value: string): number | null => {
  if (value.trim() === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return Math.round(numericValue);
};

const formatTimeSpentMinutes = (minutes?: number | null) => {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
};

const formatCompletionMoment = (completedAt?: string | null) => {
  if (!completedAt) return '';
  try {
    return format(parseISO(completedAt), 'd MMM, HH:mm', {locale: ru});
  } catch (error) {
    return '';
  }
};

const getLessonStatusLabel = (status: Lesson['status']) => {
  if (status === 'COMPLETED') return 'Проведён';
  if (status === 'CANCELED') return 'Отменён';
  return 'Запланирован';
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  studentListItems,
  studentListCounts,
  studentListTotal,
  studentListLoading,
  studentListHasMore,
  studentSearch,
  studentFilter,
  selectedStudentId,
  priceEditState,
  studentHomeworks,
  homeworkFilter,
  homeworkListLoading,
  homeworkListHasMore,
  onSelectStudent,
  onStudentSearchChange,
  onStudentFilterChange,
  onLoadMoreStudents,
  onHomeworkFilterChange,
  onLoadMoreHomeworks,
  onToggleAutoReminder,
  onAdjustBalance,
  onStartEditPrice,
  onPriceChange,
  onSavePrice,
  onCancelPriceEdit,
  onRemindHomework,
  onRemindHomeworkById,
  onSendHomework,
  onDuplicateHomework,
  onDeleteHomework,
  onAddHomework,
  onHomeworkDraftChange,
  onToggleHomework,
  onUpdateHomework,
  onOpenStudentModal,
  lessons,
  payments,
  paymentFilter,
  paymentDate,
  onPaymentFilterChange,
  onPaymentDateChange,
  onCompleteLesson,
  onChangeLessonStatus,
  onTogglePaid,
  onCreateLesson,
  onEditLesson,
  onDeleteLesson,
  newHomeworkDraft,
}) => {
  const selectedStudentEntry = studentListItems.find((item) => item.student.id === selectedStudentId);
  const selectedStudent: SelectedStudent | null = selectedStudentEntry
    ? { ...selectedStudentEntry.student, link: selectedStudentEntry.link }
    : null;
  const selectedStudentStats = selectedStudentEntry?.stats ?? null;

  const [activeTab, setActiveTab] = useState<'homework' | 'overview' | 'lessons' | 'payments'>('homework');
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [activeHomeworkId, setActiveHomeworkId] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');
  const [homeworkDraft, setHomeworkDraft] = useState<HomeworkDraft>({
    text: '',
    deadline: '',
    status: 'ASSIGNED',
    attachments: [],
    timeSpentMinutes: '',
  });
  const [pendingHomeworkId, setPendingHomeworkId] = useState<number | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<HomeworkAttachment | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [openHomeworkMenuId, setOpenHomeworkMenuId] = useState<number | null>(null);
  const [isDrawerMenuOpen, setIsDrawerMenuOpen] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [editableLessonStatusId, setEditableLessonStatusId] = useState<number | null>(null);
  const DRAWER_TRANSITION_MS = 250;
  const drawerAnimationTimeoutRef = useRef<number | null>(null);
  const studentListRef = useRef<HTMLDivElement | null>(null);
  const studentLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const homeworkLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const contentGridRef = useRef<HTMLDivElement | null>(null);

  const clearDrawerAnimationTimeout = () => {
    if (drawerAnimationTimeoutRef.current) {
      clearTimeout(drawerAnimationTimeoutRef.current);
      drawerAnimationTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearDrawerAnimationTimeout();
    };
  }, []);

  useEffect(() => {
    const target = studentLoadMoreRef.current;
    if (!target || !studentListHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreStudents();
        }
      },
      { root: studentListRef.current, rootMargin: '120px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [onLoadMoreStudents, studentListHasMore]);

  useEffect(() => {
    const target = homeworkLoadMoreRef.current;
    if (!target || !homeworkListHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreHomeworks();
        }
      },
      { root: contentGridRef.current, rootMargin: '120px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [homeworkListHasMore, onLoadMoreHomeworks]);

  const visibleStudents = studentListItems;

  const studentLessons = useMemo(() => {
    return lessons
      .filter((lesson) => lesson.studentId === selectedStudentId)
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());
  }, [lessons, selectedStudentId]);

  const filteredHomeworks = studentHomeworks;

  const activeHomework = studentHomeworks.find((hw) => hw.id === activeHomeworkId) ?? null;
  const draftTimeSpentMinutes = parseTimeSpentInput(homeworkDraft.timeSpentMinutes);
  const resolvedTimeSpentMinutes =
    draftTimeSpentMinutes ?? (typeof activeHomework?.timeSpentMinutes === 'number' ? activeHomework.timeSpentMinutes : null);

  useEffect(() => {
    if (activeHomeworkId && !studentHomeworks.some((hw) => hw.id === activeHomeworkId)) {
      setActiveHomeworkId(null);
    }
  }, [activeHomeworkId, studentHomeworks]);

  const activeStatusInfo = useMemo(() => {
    if (!activeHomework) return null;
    return getHomeworkStatusInfo({
      ...activeHomework,
      status: homeworkDraft.status,
      deadline: homeworkDraft.deadline || activeHomework.deadline,
    } as Homework);
  }, [activeHomework, homeworkDraft.deadline, homeworkDraft.status]);
  const shouldShowDescriptionToggle = useMemo(() => {
    if (!activeHomework?.text) return false;
    const linesCount = activeHomework.text.split('\n').length;
    return activeHomework.text.length > 480 || linesCount > 8;
  }, [activeHomework?.text]);

  const hasUnsavedChanges = useMemo(() => {
    if (!activeHomework) return false;
    const originalAttachments = activeHomework.attachments ?? [];
    const draftAttachments = homeworkDraft.attachments ?? [];
    const originalTimeSpent =
      typeof activeHomework.timeSpentMinutes === 'number' ? activeHomework.timeSpentMinutes : null;
    const draftTimeSpent = parseTimeSpentInput(homeworkDraft.timeSpentMinutes);

    const sameAttachments =
      originalAttachments.length === draftAttachments.length &&
      JSON.stringify(originalAttachments) === JSON.stringify(draftAttachments);

    return (
      activeHomework.text !== homeworkDraft.text ||
      (activeHomework.deadline ?? '') !== homeworkDraft.deadline ||
      (activeHomework.status ?? 'ASSIGNED') !== homeworkDraft.status ||
      originalTimeSpent !== draftTimeSpent ||
      !sameAttachments
    );
  }, [activeHomework, homeworkDraft]);

  const closeHomeworkDrawer = () => {
    if (drawerMode === 'edit' && hasUnsavedChanges) {
      setPendingHomeworkId(null);
      setShowUnsavedConfirm(true);
      return;
    }
    clearDrawerAnimationTimeout();
    setIsDrawerMenuOpen(false);
    setOpenHomeworkMenuId(null);
    setIsDrawerVisible(false);
    drawerAnimationTimeoutRef.current = window.setTimeout(() => {
      setActiveHomeworkId(null);
      setDrawerMode('view');
      drawerAnimationTimeoutRef.current = null;
    }, DRAWER_TRANSITION_MS);
  };

  useEffect(() => {
    if (activeHomework) {
      setHomeworkDraft({
        text: activeHomework.text,
        deadline: activeHomework.deadline ?? '',
        status: (activeHomework.status as HomeworkStatus) ?? 'ASSIGNED',
        attachments: activeHomework.attachments ?? [],
        timeSpentMinutes:
          typeof activeHomework.timeSpentMinutes === 'number'
            ? String(activeHomework.timeSpentMinutes)
            : '',
      });
      setDrawerMode('view');
      setIsDescriptionExpanded(false);
      requestAnimationFrame(() => setIsDrawerVisible(true));
    } else {
      setIsDrawerVisible(false);
    }
  }, [activeHomework?.id]);

  const handleOpenHomework = (homeworkId: number) => {
    setIsDrawerMenuOpen(false);
    if (drawerMode === 'edit' && hasUnsavedChanges && activeHomeworkId !== homeworkId) {
      setPendingHomeworkId(homeworkId);
      setShowUnsavedConfirm(true);
      return;
    }
    setActiveHomeworkId(homeworkId);
    setDrawerMode('view');
  };

  const handleOpenHomeworkCard = (homeworkId: number) => {
    setOpenHomeworkMenuId(null);
    handleOpenHomework(homeworkId);
  };

  const handleToggleHomeworkMenu = (homeworkId: number) => {
    setOpenHomeworkMenuId((prev) => (prev === homeworkId ? null : homeworkId));
  };

  const handleEditHomework = (homeworkId: number) => {
    handleOpenHomework(homeworkId);
    setDrawerMode('edit');
  };

  const resetDraftToOriginal = () => {
    if (!activeHomework) return;
    setHomeworkDraft({
      text: activeHomework.text,
      deadline: activeHomework.deadline ?? '',
      status: (activeHomework.status as HomeworkStatus) ?? 'ASSIGNED',
      attachments: activeHomework.attachments ?? [],
      timeSpentMinutes:
        typeof activeHomework.timeSpentMinutes === 'number'
          ? String(activeHomework.timeSpentMinutes)
          : '',
    });
  };

  const handleDiscardChanges = () => {
    resetDraftToOriginal();
    setShowUnsavedConfirm(false);
    setDrawerMode('view');
    if (pendingHomeworkId) {
      setActiveHomeworkId(pendingHomeworkId);
      setPendingHomeworkId(null);
      requestAnimationFrame(() => setIsDrawerVisible(true));
    } else if (!pendingHomeworkId) {
      closeHomeworkDrawer();
    }
  };

  const handleKeepEditing = () => {
    setShowUnsavedConfirm(false);
  };

  const handleStartEditLessonStatus = (lessonId: number) => {
    setEditableLessonStatusId(lessonId);
  };

  const handleStopEditLessonStatus = () => {
    setEditableLessonStatusId(null);
  };

  const handleLessonStatusChange = (lessonId: number, status: Lesson['status']) => {
    onChangeLessonStatus(lessonId, status);
    setEditableLessonStatusId(null);
  };

  const handleOpenCreateHomework = () => {
    onHomeworkDraftChange({
      ...newHomeworkDraft,
      status: 'DRAFT',
      baseStatus: 'DRAFT',
      sendNow: false,
      timeSpentMinutes: '',
    });
    setIsHomeworkModalOpen(true);
  };

  const handleConfirmSaveAndClose = async () => {
    const saved = await handleSaveDraft();
    if (!saved) return;
    setShowUnsavedConfirm(false);
    if (pendingHomeworkId) {
      setActiveHomeworkId(pendingHomeworkId);
      setPendingHomeworkId(null);
      requestAnimationFrame(() => setIsDrawerVisible(true));
    } else {
      closeHomeworkDrawer();
    }
  };

  const handleSaveDraft = async (): Promise<boolean> => {
    if (!activeHomework || !onUpdateHomework) return false;
    if (!homeworkDraft.text.trim()) {
      setSaveError('Введите текст задания');
      return false;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload: Partial<Homework> = {
        text: homeworkDraft.text,
        deadline: homeworkDraft.deadline || null,
        attachments: homeworkDraft.attachments,
        timeSpentMinutes: parseTimeSpentInput(homeworkDraft.timeSpentMinutes),
      };

      payload.status = homeworkDraft.status;

      await onUpdateHomework(activeHomework.id, payload);
      setDrawerMode('view');
      return true;
    } catch (error) {
      setSaveError('Ошибка сохранения, попробуйте ещё раз');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const MAX_ATTACHMENTS = 5;
  const MAX_SIZE_MB = 10;

  const addAttachments = (files: File[]) => {
    const availableSlots = MAX_ATTACHMENTS - (homeworkDraft.attachments?.length ?? 0);
    if (availableSlots <= 0) return;
    const nextFiles = files.slice(0, availableSlots);

    nextFiles.forEach((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) return;

      const tempId = `${Date.now()}-${file.name}`;
      const reader = new FileReader();
      reader.onload = () => {
        setHomeworkDraft((prev) => ({
          ...prev,
          attachments: [
            ...(prev.attachments ?? []),
            {
              id: tempId,
              url: reader.result as string,
              fileName: file.name,
              size: file.size,
              status: 'ready',
            },
          ],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (attachmentId: string) => {
    setHomeworkDraft((prev) => ({
      ...prev,
      attachments: (prev.attachments ?? []).filter((item) => item.id !== attachmentId),
    }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (drawerMode !== 'edit') return;
    const files = Array.from(event.dataTransfer.files || []);
    addAttachments(files);
  };

  const handlePaste = (event: ClipboardEvent | ReactClipboardEvent) => {
    if (drawerMode !== 'edit') return;
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      addAttachments(files as File[]);
    }
  };

  useEffect(() => {
    const handler = (event: ClipboardEvent) => handlePaste(event);
    if (activeHomeworkId) {
      window.addEventListener('paste', handler);
    }
    return () => window.removeEventListener('paste', handler);
  }, [activeHomeworkId, drawerMode]);

  const handleHomeworkReminder = (homeworkId: number) => {
    if (onRemindHomeworkById) {
      onRemindHomeworkById(homeworkId);
    } else if (selectedStudent) {
      onRemindHomework(selectedStudent.id);
    }
  };

  const handleCopyHomework = (text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
  };

  const handleMoveToDraft = (homeworkId: number) => {
    if (!onUpdateHomework) return;
    const homework = studentHomeworks.find((item) => item.id === homeworkId);
    if (!homework) return;
    const info = getHomeworkStatusInfo(homework);
    if (info.status === 'DRAFT') {
      setOpenHomeworkMenuId(null);
      return;
    }

    const confirmed = window.confirm('Перевести задание в черновик? Ученик перестанет его видеть.');
    if (!confirmed) return;

    if (activeHomeworkId === homeworkId) {
      setHomeworkDraft((prev) => ({
        ...prev,
        status: 'DRAFT',
        baseStatus: 'DRAFT',
      }));
    }

    onUpdateHomework(homeworkId, { status: 'DRAFT' });
    setIsDrawerMenuOpen(false);
    setOpenHomeworkMenuId(null);
  };

  const handleSendHomework = (homeworkId: number) => {
    if (!onSendHomework) return;
    onSendHomework(homeworkId);

    if (activeHomeworkId === homeworkId) {
      setHomeworkDraft((prev) => ({
        ...prev,
        status: 'ASSIGNED',
      }));
    }
  };

  const handleDeleteHomework = (homeworkId: number) => {
    if (!onDeleteHomework) return;
    const confirmed = window.confirm('Удалить домашнее задание? Его нельзя будет вернуть.');
    if (!confirmed) return;
    onDeleteHomework(homeworkId);
    setOpenHomeworkMenuId(null);
  };

  const handleCreateStatusChange = (status: HomeworkStatus) => {
    const nextBaseStatus = status === 'IN_PROGRESS' || status === 'DONE' ? 'ASSIGNED' : status;
    onHomeworkDraftChange({
      ...newHomeworkDraft,
      baseStatus: nextBaseStatus,
      status: newHomeworkDraft.sendNow ? 'ASSIGNED' : nextBaseStatus,
    });
  };

  const handleSendNowToggle = (value: boolean) => {
    onHomeworkDraftChange({
      ...newHomeworkDraft,
      sendNow: value,
      status: value ? 'ASSIGNED' : newHomeworkDraft.baseStatus ?? 'DRAFT',
    });
  };

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        <StudentsSidebar
          studentListItems={visibleStudents}
          selectedStudentId={selectedStudentId}
          searchQuery={studentSearch}
          activeFilter={studentFilter}
          counts={studentListCounts}
          totalCount={studentListTotal}
          isLoading={studentListLoading}
          hasMore={studentListHasMore}
          listRef={studentListRef}
          loadMoreRef={studentLoadMoreRef}
          onSelectStudent={onSelectStudent}
          onSearchChange={onStudentSearchChange}
          onFilterChange={onStudentFilterChange}
          onOpenStudentModal={onOpenStudentModal}
        />

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid} ref={contentGridRef}>
              <StudentHero
                selectedStudent={selectedStudent}
                priceEditState={priceEditState}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onStartEditPrice={onStartEditPrice}
                onPriceChange={onPriceChange}
                onSavePrice={onSavePrice}
                onCancelPriceEdit={onCancelPriceEdit}
                onToggleAutoReminder={onToggleAutoReminder}
                onAdjustBalance={onAdjustBalance}
                onOpenStudentModal={onOpenStudentModal}
              />

              {activeTab === 'homework' ? (
                <HomeworkTab
                  homeworkFilter={homeworkFilter}
                  filteredHomeworks={filteredHomeworks}
                  activeHomeworkId={activeHomeworkId}
                  openHomeworkMenuId={openHomeworkMenuId}
                  isLoading={homeworkListLoading}
                  hasMore={homeworkListHasMore}
                  loadMoreRef={homeworkLoadMoreRef}
                  onOpenCreateHomework={handleOpenCreateHomework}
                  onChangeFilter={onHomeworkFilterChange}
                  onOpenHomework={handleOpenHomeworkCard}
                  onToggleHomeworkMenu={handleToggleHomeworkMenu}
                  onToggleHomework={onToggleHomework}
                  onHomeworkReminder={handleHomeworkReminder}
                  onEditHomework={handleEditHomework}
                  onMoveToDraft={handleMoveToDraft}
                  onDeleteHomework={handleDeleteHomework}
                  getHomeworkStatusInfo={getHomeworkStatusInfo}
                  getHomeworkTitle={getHomeworkTitle}
                  formatTimeSpentMinutes={formatTimeSpentMinutes}
                  formatCompletionMoment={formatCompletionMoment}
                />
              ) : activeTab === 'lessons' ? (
                <LessonsTab
                  studentLessons={studentLessons}
                  selectedStudent={selectedStudent}
                  selectedStudentId={selectedStudentId}
                  editableLessonStatusId={editableLessonStatusId}
                  onStartEditLessonStatus={handleStartEditLessonStatus}
                  onStopEditLessonStatus={handleStopEditLessonStatus}
                  onLessonStatusChange={handleLessonStatusChange}
                  onCreateLesson={onCreateLesson}
                  onCompleteLesson={onCompleteLesson}
                  onTogglePaid={onTogglePaid}
                  onEditLesson={onEditLesson}
                  onDeleteLesson={onDeleteLesson}
                  getLessonStatusLabel={getLessonStatusLabel}
                />
              ) : activeTab === 'payments' ? (
                <PaymentsTab
                  payments={payments}
                  paymentFilter={paymentFilter}
                  paymentDate={paymentDate}
                  onPaymentFilterChange={onPaymentFilterChange}
                  onPaymentDateChange={onPaymentDateChange}
                  onOpenLesson={onEditLesson}
                />
              ) : (
                selectedStudent && (
                  <OverviewTab
                    selectedStudent={selectedStudent}
                    selectedStudentStats={selectedStudentStats}
                    onRemindHomework={onRemindHomework}
                  />
                )
              )}
            </div>
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>

      {activeHomework && (
        <HomeworkDrawer
          activeHomework={activeHomework}
          selectedStudent={selectedStudent}
          drawerMode={drawerMode}
          isDrawerVisible={isDrawerVisible}
          isDrawerMenuOpen={isDrawerMenuOpen}
          isSaving={isSaving}
          saveError={saveError}
          hasUnsavedChanges={hasUnsavedChanges}
          shouldShowDescriptionToggle={shouldShowDescriptionToggle}
          isDescriptionExpanded={isDescriptionExpanded}
          activeStatusInfo={activeStatusInfo}
          resolvedTimeSpentMinutes={resolvedTimeSpentMinutes}
          homeworkDraft={homeworkDraft}
          attachmentPreview={attachmentPreview}
          showUnsavedConfirm={showUnsavedConfirm}
          onClose={closeHomeworkDrawer}
          onToggleDrawerMenu={() => setIsDrawerMenuOpen((prev) => !prev)}
          onStartEdit={() => {
            setIsDrawerMenuOpen(false);
            setDrawerMode('edit');
          }}
          onMoveToDraft={handleMoveToDraft}
          onSendHomework={onSendHomework ? handleSendHomework : undefined}
          onToggleDescription={() => setIsDescriptionExpanded((prev) => !prev)}
          onDraftChange={setHomeworkDraft}
          onRemoveAttachment={removeAttachment}
          onOpenAttachmentPreview={setAttachmentPreview}
          onCloseAttachmentPreview={() => setAttachmentPreview(null)}
          onAddAttachments={addAttachments}
          onDrop={handleDrop}
          onToggleHomework={onToggleHomework}
          onRemindHomework={(homeworkId) => onRemindHomeworkById?.(homeworkId) ?? onRemindHomework(selectedStudent!.id)}
          onSaveDraft={handleSaveDraft}
          onDiscardChanges={handleDiscardChanges}
          onResetDraft={resetDraftToOriginal}
          onKeepEditing={handleKeepEditing}
          onConfirmSaveAndClose={handleConfirmSaveAndClose}
          formatTimeSpentMinutes={formatTimeSpentMinutes}
          formatCompletionMoment={formatCompletionMoment}
          getStatusLabel={getStatusLabel}
        />
      )}

      <HomeworkCreateModal
        isOpen={isHomeworkModalOpen}
        draft={newHomeworkDraft}
        onDraftChange={onHomeworkDraftChange}
        onAddHomework={onAddHomework}
        onClose={() => setIsHomeworkModalOpen(false)}
        onCreateStatusChange={handleCreateStatusChange}
        onSendNowToggle={handleSendNowToggle}
      />
    </section>
  );
};
