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
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import {
  AddOutlinedIcon,
  CheckCircleOutlineIcon,
  CloseIcon,
  ContentCopyOutlinedIcon,
  EditIcon,
  DeleteOutlineIcon,
  DoneOutlinedIcon,
  EventRepeatOutlinedIcon,
  EditOutlinedIcon,
  ExpandLessOutlinedIcon,
  ExpandMoreOutlinedIcon,
  MoreHorizIcon,
  NotificationsNoneOutlinedIcon,
  PaidOutlinedIcon,
  ReplayOutlinedIcon,
} from '../../icons/MaterialIcons';
import {
  Homework,
  HomeworkAttachment,
  HomeworkStatus,
  Lesson,
  LinkedStudent,
  Payment,
  Student,
} from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import { Badge } from '../../shared/ui/Badge/Badge';
import styles from './StudentsSection.module.css';
import { PaymentList } from './components/PaymentList';
import { HomeworkTab } from './components/HomeworkTab';
import { StudentHero } from './components/StudentHero';
import { StudentsSidebar } from './components/StudentsSidebar';
import { ru } from 'date-fns/locale';

interface StudentsSectionProps {
  linkedStudents: LinkedStudent[];
  selectedStudentId: number | null;
  priceEditState: { id: number | null; value: string };
  onSelectStudent: (id: number) => void;
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
  onHomeworkDraftChange: (draft: {
    text: string;
    deadline: string;
    status: HomeworkStatus;
    baseStatus: HomeworkStatus;
    sendNow: boolean;
    remindBefore: boolean;
    timeSpentMinutes: string;
  }) => void;
  onToggleHomework: (homeworkId: number) => void;
  onUpdateHomework?: (homeworkId: number, payload: Partial<Homework>) => void;
  onOpenStudentModal: () => void;
  lessons: Lesson[];
  payments: Payment[];
  onCompleteLesson: (lessonId: number) => void;
  onChangeLessonStatus: (lessonId: number, status: Lesson['status']) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onCreateLesson: (studentId?: number) => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: number) => void;
  newHomeworkDraft: {
    text: string;
    deadline: string;
    status: HomeworkStatus;
    baseStatus: HomeworkStatus;
    sendNow: boolean;
    remindBefore: boolean;
    timeSpentMinutes: string;
  };
}
type HomeworkStatusInfo = { status: HomeworkStatus; isOverdue: boolean };

const getHomeworkStatusInfo = (homework: LinkedStudent['homeworks'][number]): HomeworkStatusInfo => {
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
  linkedStudents,
  selectedStudentId,
  priceEditState,
  onSelectStudent,
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
  onCompleteLesson,
  onChangeLessonStatus,
  onTogglePaid,
  onCreateLesson,
  onEditLesson,
  onDeleteLesson,
  newHomeworkDraft,
}) => {
  const selectedStudent = linkedStudents.find((s) => s.id === selectedStudentId);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'debt' | 'overdue'>('all');
  const [activeTab, setActiveTab] = useState<'homework' | 'overview' | 'lessons' | 'payments'>('homework');
  const [homeworkFilter, setHomeworkFilter] = useState<'all' | HomeworkStatus | 'overdue'>('all');
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [activeHomeworkId, setActiveHomeworkId] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');
  const [homeworkDraft, setHomeworkDraft] = useState<{
    text: string;
    deadline: string;
    status: HomeworkStatus;
    attachments: HomeworkAttachment[];
    timeSpentMinutes: string;
  }>({ text: '', deadline: '', status: 'ASSIGNED', attachments: [], timeSpentMinutes: '' });
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
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const visibleStudents = useMemo(() => {
    return linkedStudents.filter((student) => {
      const matchesQuery = `${student.link.customName} ${student.username ?? ''}`
        .toLowerCase()
        .includes(debouncedQuery.toLowerCase());

      if (!matchesQuery) return false;

      const hasDebt = student.link.balanceLessons < 0;
      const hasOverdue = student.homeworks.some((hw) => getHomeworkStatusInfo(hw).isOverdue);
      if (activeFilter === 'debt') return hasDebt;
      if (activeFilter === 'overdue') return hasOverdue;

      return true;
    });
  }, [activeFilter, debouncedQuery, linkedStudents]);

  const counts = useMemo(() => {
    const withDebt = linkedStudents.filter((student) => student.link.balanceLessons < 0).length;
    const overdue = linkedStudents.filter((student) =>
      student.homeworks.some((hw) => getHomeworkStatusInfo(hw).isOverdue),
    ).length;
    return { withDebt, overdue };
  }, [linkedStudents]);

  const studentLessons = useMemo(() => {
    return lessons
      .filter((lesson) => lesson.studentId === selectedStudentId)
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());
  }, [lessons, selectedStudentId]);

  const filteredHomeworks = useMemo(() => {
    const homeworks = selectedStudent?.homeworks ?? [];
    return homeworks.filter((hw) => {
      const info = getHomeworkStatusInfo(hw);
      if (homeworkFilter === 'all') return true;
      if (homeworkFilter === 'overdue') return info.isOverdue;
      return info.status === homeworkFilter;
    });
  }, [homeworkFilter, selectedStudent]);

  const activeHomework = selectedStudent?.homeworks.find((hw) => hw.id === activeHomeworkId) ?? null;
  const draftTimeSpentMinutes = parseTimeSpentInput(homeworkDraft.timeSpentMinutes);
  const resolvedTimeSpentMinutes =
    draftTimeSpentMinutes ?? (typeof activeHomework?.timeSpentMinutes === 'number' ? activeHomework.timeSpentMinutes : null);

  const activeStatusInfo = useMemo(() => {
    if (!activeHomework) return null;
    return getHomeworkStatusInfo({
      ...activeHomework,
      status: homeworkDraft.status,
      deadline: homeworkDraft.deadline || activeHomework.deadline,
    } as LinkedStudent['homeworks'][number]);
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
    const homework = selectedStudent?.homeworks.find((item) => item.id === homeworkId);
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
    if (!handleDeleteHomework) return;
    const confirmed = window.confirm('Удалить домашнее задание? Его нельзя будет вернуть.');
    if (!confirmed) return;
    handleDeleteHomework(homeworkId);
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
          linkedStudents={linkedStudents}
          visibleStudents={visibleStudents}
          selectedStudentId={selectedStudentId}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          counts={counts}
          onSelectStudent={onSelectStudent}
          onSearchChange={setSearchQuery}
          onFilterChange={setActiveFilter}
          onOpenStudentModal={onOpenStudentModal}
          getHomeworkStatusInfo={getHomeworkStatusInfo}
        />

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid}>
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
                  onOpenCreateHomework={handleOpenCreateHomework}
                  onChangeFilter={setHomeworkFilter}
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
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Занятия</div>
                      <div className={styles.subtleLabel}>Список уроков для ученика</div>
                    </div>
                    <button
                      className={controls.secondaryButton}
                      onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
                    >
                      + Урок
                    </button>
                  </div>

                  <div className={styles.lessonTableWrapper}>
                    {studentLessons.length ? (
                      <TableContainer className={styles.lessonTableContainer}>
                        <Table size="small" aria-label="Список занятий ученика">
                          <TableHead>
                            <TableRow>
                              <TableCell>Дата и время</TableCell>
                              <TableCell>Длительность</TableCell>
                              <TableCell>Статус занятия</TableCell>
                              <TableCell>Статус оплаты</TableCell>
                              <TableCell align="right">Цена</TableCell>
                              <TableCell align="right">Быстрые действия</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {studentLessons.map((lesson) => {
                              const participant = lesson.participants?.find(
                                (p) => p.studentId === selectedStudentId,
                              );
                              const resolvedPrice =
                                participant?.price ?? selectedStudent?.pricePerLesson ?? lesson.price ?? 0;
                              const isPaid = participant?.isPaid ?? lesson.isPaid;

                              return (
                                <TableRow key={lesson.id} hover className={styles.lessonTableRow}>
                                  <TableCell>
                                    <div className={styles.lessonDateCell}>
                                      <div className={styles.lessonTitle}>
                                        {format(parseISO(lesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                                      </div>
                                      <div className={styles.lessonMeta}>#{lesson.id}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className={styles.monoCell}>{lesson.durationMinutes} мин</TableCell>
                                  <TableCell>
                                    <div className={styles.lessonStatusRow}>
                                      <span className={styles.metaLabel}>Статус:</span>
                                      {editableLessonStatusId === lesson.id ? (
                                        <select
                                          className={styles.lessonStatusSelect}
                                          value={lesson.status}
                                          autoFocus
                                          onChange={(event) =>
                                            handleLessonStatusChange(
                                              lesson.id,
                                              event.target.value as Lesson['status'],
                                            )
                                          }
                                          onBlur={() => setEditableLessonStatusId(null)}
                                        >
                                          <option value="SCHEDULED">Запланирован</option>
                                          <option value="COMPLETED">Проведён</option>
                                          <option value="CANCELED">Отменён</option>
                                        </select>
                                      ) : (
                                        <button
                                          type="button"
                                          className={styles.lessonStatusTrigger}
                                          onClick={() => handleStartEditLessonStatus(lesson.id)}
                                        >
                                          {getLessonStatusLabel(lesson.status)}
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      label={isPaid ? 'Оплачено' : 'Не оплачено'}
                                      variant={isPaid ? 'paid' : 'unpaid'}
                                      className={styles.paymentBadge}
                                    />
                                  </TableCell>
                                  <TableCell align="right" className={styles.monoCell}>
                                    {resolvedPrice} ₽
                                  </TableCell>
                                  <TableCell align="right">
                                    <div className={styles.iconActions}>
                                      <button
                                        className={controls.iconButton}
                                        aria-label="Отметить проведённым"
                                        title="Отметить проведённым"
                                        onClick={() => onCompleteLesson(lesson.id)}
                                      >
                                        <DoneOutlinedIcon width={18} height={18} />
                                      </button>
                                      <button
                                        className={controls.iconButton}
                                        aria-label="Отметить оплату"
                                        title="Отметить оплату"
                                        onClick={() => onTogglePaid(lesson.id, selectedStudentId ?? undefined)}
                                      >
                                        <PaidOutlinedIcon width={18} height={18} />
                                      </button>
                                      <button
                                        className={controls.iconButton}
                                        aria-label="Перенести"
                                        title="Перенести"
                                        onClick={() => onEditLesson(lesson)}
                                      >
                                        <EventRepeatOutlinedIcon width={18} height={18} />
                                      </button>
                                      <button
                                        className={controls.iconButton}
                                        aria-label="Удалить"
                                        title="Удалить"
                                        onClick={() => onDeleteLesson(lesson.id)}
                                      >
                                        <DeleteOutlineIcon width={18} height={18} />
                                      </button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <div className={styles.emptyState}>
                        <p>Пока нет занятий. Добавьте урок.</p>
                        <button
                          className={controls.secondaryButton}
                          onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
                        >
                          + Урок
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'payments' ? (
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Оплаты</div>
                      <div className={styles.subtleLabel}>История платежей для ученика</div>
                    </div>
                  </div>
                  <PaymentList payments={payments} />
                </div>
              ) : (
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Обзор</div>
                      <div className={styles.subtleLabel}>Короткая сводка по ученику</div>
                    </div>
                    <button className={controls.secondaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
                      Напомнить про ДЗ
                    </button>
                  </div>
                  <div className={styles.overviewGrid}>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Баланс</p>
                      <p className={styles.statValueLarge}>{selectedStudent.link.balanceLessons} уроков</p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>ДЗ</p>
                      <p className={styles.statValueLarge}>
                        {selectedStudent.homeworks.filter((hw) => !hw.isDone).length} в работе
                      </p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Напоминания</p>
                      <p className={styles.statValueLarge}>
                        {selectedStudent.link.autoRemindHomework ? 'Включены' : 'Выключены'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>

      {activeHomework && (
        <>
          <button
            className={`${styles.drawerScrim} ${isDrawerVisible ? styles.scrimVisible : ''}`}
            aria-label="Закрыть карточку ДЗ"
            onClick={closeHomeworkDrawer}
          />
          <aside
            className={`${styles.homeworkDrawer} ${isDrawerVisible ? styles.drawerOpen : ''}`}
            aria-live="polite"
          >
            <div className={styles.drawerHeaderSticky}>
              <div>
                <div className={styles.drawerTitle}>{selectedStudent?.link.customName}</div>
                <div className={styles.drawerSubtitle}>@{selectedStudent?.username || 'нет'} • #{activeHomework.id}</div>
              </div>
              <div className={styles.drawerHeaderActions}>
                {onSendHomework && activeHomework && activeStatusInfo?.status === 'DRAFT' && (
                  <button
                    className={controls.secondaryButton}
                    onClick={() => handleSendHomework(activeHomework.id)}
                    disabled={isSaving}
                  >
                    Отправить ученику
                  </button>
                )}
                {drawerMode === 'view' && (
                  <div className={styles.moreActionsWrapper}>
                    <button
                      className={controls.iconButton}
                      aria-label="Дополнительные действия"
                      onClick={() => setIsDrawerMenuOpen((prev) => !prev)}
                    >
                      <MoreHorizIcon width={18} height={18} />
                    </button>
                    {isDrawerMenuOpen && (
                        <div className={styles.moreMenu}>
                          <button
                              aria-label="Редактировать"
                              onClick={() => {
                                setIsDrawerMenuOpen(false);
                                setDrawerMode('edit');
                              }}
                          >
                            Редактировать
                          </button>
                          {activeStatusInfo?.status !== 'DRAFT' && (
                            <button
                                aria-label="В черновик"
                                onClick={() => handleMoveToDraft(activeHomework.id)}
                            >
                              В черновик
                            </button>
                          )}
                        </div>
                    )}
                  </div>
                )}
                <button className={controls.iconButton} aria-label="Закрыть" onClick={closeHomeworkDrawer}>
                  <CloseIcon width={18} height={18}/>
                </button>
              </div>
            </div>

            <div className={styles.drawerScroll} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              <div className={styles.drawerBadgeRow}>
                {activeStatusInfo && (
                  <span
                    className={`${styles.drawerBadge} ${
                      activeStatusInfo.status === 'DONE'
                        ? styles.badgeSuccess
                        : activeStatusInfo.status === 'IN_PROGRESS'
                          ? styles.badgeWarning
                          : activeStatusInfo.status === 'ASSIGNED'
                            ? styles.badgeInfo
                            : styles.badgeMuted
                    }`}
                  >
                    {getStatusLabel(activeStatusInfo.status)}
                  </span>
                )}
                {activeStatusInfo?.isOverdue && activeStatusInfo.status !== 'DONE' && (
                  <span className={`${styles.drawerBadge} ${styles.badgeDanger}`}>Просрочено</span>
                )}
                <span className={styles.drawerBadge}>
                  {homeworkDraft.deadline
                    ? `Дедлайн: ${format(parseISO(`${homeworkDraft.deadline}T00:00:00`), 'd MMM', {locale: ru})}`
                    : 'Без дедлайна'}
                </span>
                <span className={styles.drawerBadge}>
                  {resolvedTimeSpentMinutes !== null
                    ? `Время: ${formatTimeSpentMinutes(resolvedTimeSpentMinutes)}`
                    : 'Время не указано'}
                </span>
                <span className={styles.drawerBadge}>
                  {activeHomework?.completedAt
                    ? `Выполнено: ${formatCompletionMoment(activeHomework.completedAt)}`
                    : 'Не выполнено'}
                </span>
                {hasUnsavedChanges && drawerMode === 'edit' && (
                  <span className={`${styles.drawerBadge} ${styles.badgeMuted}`}>Есть несохранённые изменения</span>
                )}
              </div>

              <div className={styles.drawerSection}>
                <div className={styles.sectionHeader}>
                  <p className={styles.priceLabel}>Описание</p>
                  {drawerMode === 'view' && (
                    <button className={styles.linkButton} onClick={() => setDrawerMode('edit')}>
                      <EditOutlinedIcon width={16} height={16} />
                    </button>
                  )}
                </div>
                {drawerMode === 'edit' ? (
                  <>
                    <textarea
                      className={controls.input}
                      value={homeworkDraft.text}
                      onChange={(e) => setHomeworkDraft({ ...homeworkDraft, text: e.target.value })}
                      placeholder="Введите текст домашнего задания..."
                      rows={8}
                    />
                    <div className={styles.inlineFields}>
                      <label className={styles.inputLabel}>
                        Дедлайн
                        <input
                          className={controls.input}
                          type="date"
                          value={homeworkDraft.deadline}
                          onChange={(e) => setHomeworkDraft({ ...homeworkDraft, deadline: e.target.value })}
                        />
                      </label>
                      <label className={styles.inputLabel}>
                        Статус
                        <select
                          className={controls.input}
                          value={homeworkDraft.status}
                          onChange={(e) =>
                            setHomeworkDraft({ ...homeworkDraft, status: e.target.value as HomeworkStatus })
                          }
                        >
                          <option value="DRAFT">Черновик</option>
                          <option value="ASSIGNED">Назначено</option>
                          <option value="IN_PROGRESS">В работе</option>
                          <option value="DONE">Выполнено</option>
                        </select>
                      </label>
                      <label className={styles.inputLabel}>
                        Время выполнения (мин)
                        <input
                          className={controls.input}
                          type="number"
                          min={0}
                          step={5}
                          value={homeworkDraft.timeSpentMinutes}
                          onChange={(e) =>
                            setHomeworkDraft({ ...homeworkDraft, timeSpentMinutes: e.target.value })
                          }
                          placeholder="Например, 45"
                        />
                        <span className={styles.subtleLabel}>Сколько минут заняло выполнение</span>
                      </label>
                    </div>
                    {saveError && <div className={styles.errorText}>{saveError}</div>}
                  </>
                ) : (
                  <div className={styles.descriptionBlock}>
                    <p
                      className={`${styles.drawerText} ${
                        !isDescriptionExpanded && shouldShowDescriptionToggle ? styles.clampedText : ''
                      }`}
                    >
                      {activeHomework.text}
                    </p>
                    {shouldShowDescriptionToggle && (
                      <button
                        className={styles.expandButton}
                        onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                        aria-expanded={isDescriptionExpanded}
                        type="button"
                      >
                        {isDescriptionExpanded ? (
                          <>
                            <ExpandLessOutlinedIcon width={16} height={16} /> Свернуть
                          </>
                        ) : (
                          <>
                            <ExpandMoreOutlinedIcon width={16} height={16} /> Развернуть
                          </>
                        )}
                      </button>
                    )}
                </div>
              )}
              </div>

              <div className={styles.drawerSection}>
                <div className={styles.sectionHeader}>
                  <p className={styles.priceLabel}>Фото</p>
                  <span className={styles.subtleLabel}>PNG/JPG/WebP, до 10MB, до 5 фото</span>
                  {drawerMode !== 'edit' && <button className={styles.linkButton} onClick={() => setDrawerMode('edit')}>
                    <AddOutlinedIcon width={18} height={18}/>
                  </button>}
                </div>
                {drawerMode === 'edit' && (
                    <div className={styles.attachmentControls}>
                      <label className={controls.secondaryButton}>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className={styles.hiddenInput}
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          addAttachments(files as File[]);
                          event.target.value = '';
                        }}
                      />
                      <span className={styles.iconLeading} aria-hidden>
                        <AddOutlinedIcon width={16} height={16} />
                      </span>
                      Добавить фото
                    </label>
                    <div className={styles.dropHint}>Перетащите или вставьте фото сюда</div>
                  </div>
                )}

                <div className={styles.attachmentsGrid}>
                  {(homeworkDraft.attachments ?? []).map((attachment) => (
                    <div key={attachment.id} className={styles.attachmentCard}>
                      {drawerMode === 'edit' && (
                        <button
                          className={styles.attachmentRemove}
                          aria-label="Удалить"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          ×
                        </button>
                      )}
                      <button className={styles.attachmentThumb} onClick={() => setAttachmentPreview(attachment)}>
                        <img src={attachment.url} alt={attachment.fileName} />
                      </button>
                      <div className={styles.attachmentMeta}>
                        <span className={styles.attachmentName}>{attachment.fileName}</span>
                        <span className={styles.attachmentSize}>{Math.round(attachment.size / 1024)} кб</span>
                      </div>
                    </div>
                  ))}
                  {!(homeworkDraft.attachments ?? []).length && (
                    <div className={styles.emptyState}>Пока нет вложений</div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.drawerFooter}>
              {drawerMode === 'view' ? (
                <>
                  <button
                    className={controls.primaryButton}
                    onClick={() => {
                      onToggleHomework(activeHomework.id);
                    }}
                  >
                    {activeHomework.isDone ? 'Вернуть в активные' : 'Отметить выполненным'}
                  </button>
                  <button
                    className={controls.secondaryButton}
                    onClick={() => onRemindHomeworkById?.(activeHomework.id) ?? onRemindHomework(selectedStudent!.id)}
                  >
                    Напомнить
                  </button>
                </>
              ) : (
                <>
                  <button className={controls.primaryButton} onClick={handleSaveDraft} disabled={isSaving}>
                    {isSaving ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button className={controls.secondaryButton} onClick={handleDiscardChanges} disabled={isSaving}>
                    Отмена
                  </button>
                  {hasUnsavedChanges && <button
                      className={controls.secondaryButton}
                      onClick={() => {
                        resetDraftToOriginal();
                      }}
                      disabled={isSaving}
                  >
                    <ReplayOutlinedIcon width={16} height={16}/> Сбросить
                  </button>}
                </>
              )}
            </div>
          </aside>

          {attachmentPreview && (
            <div className={styles.modalOverlay} onClick={() => setAttachmentPreview(null)}>
              <div className={styles.previewDialog} onClick={(e) => e.stopPropagation()}>
                <img src={attachmentPreview.url} alt={attachmentPreview.fileName} />
                <div className={styles.previewFooter}>
                  <span>{attachmentPreview.fileName}</span>
                  <button className={controls.secondaryButton} onClick={() => setAttachmentPreview(null)}>
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          )}

          {showUnsavedConfirm && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalCard}>
                <div className={styles.modalHeader}>
                  <div>
                    <div className={styles.priceLabel}>Несохранённые изменения</div>
                    <div className={styles.subtleLabel}>Сохранить перед закрытием?</div>
                  </div>
                  <button className={controls.iconButton} aria-label="Закрыть" onClick={handleKeepEditing}>
                    <CloseIcon width={18} height={18} />
                  </button>
                </div>
                <div className={styles.modalBody}>У вас есть несохранённые изменения. Сохранить их?</div>
                <div className={styles.modalFooter}>
                  <button className={controls.secondaryButton} onClick={handleDiscardChanges}>
                    Не сохранять
                  </button>
                  <button className={controls.secondaryButton} onClick={handleKeepEditing}>
                    Отмена
                  </button>
                  <button className={controls.primaryButton} onClick={handleConfirmSaveAndClose} disabled={isSaving}>
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isHomeworkModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.priceLabel}>Новое задание</div>
                <div className={styles.subtleLabel}>Создайте карточку и отправьте ученику</div>
              </div>
              <button className={controls.iconButton} aria-label="Закрыть" onClick={() => setIsHomeworkModalOpen(false)}>
                <CloseIcon width={18} height={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.inputLabel}>
                Текст задания
                <textarea
                  className={controls.input}
                  placeholder="Например: Разобрать тему 3 и сделать 10 задач"
                  value={newHomeworkDraft.text}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, text: e.target.value })}
                />
              </label>
              <label className={styles.inputLabel}>
                Дедлайн
                <input
                  className={controls.input}
                  type="date"
                  value={newHomeworkDraft.deadline}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, deadline: e.target.value })}
                />
              </label>
              <label className={styles.inputLabel}>
                Время выполнения (мин)
                <input
                  className={controls.input}
                  type="number"
                  min={0}
                  step={5}
                  value={newHomeworkDraft.timeSpentMinutes}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, timeSpentMinutes: e.target.value })}
                  placeholder="Например, 30"
                />
                <span className={styles.subtleLabel}>Можно оставить пустым, если ученик ещё не сделал работу</span>
              </label>
              <div className={styles.inputLabel}>
                <div className={styles.sectionHeader}>
                  <p className={styles.priceLabel}>Статус</p>
                  <span className={styles.subtleLabel}>Выберите, когда покажем ДЗ ученику</span>
                </div>
                <div className={styles.toggleGroup}>
                  <button
                    className={`${controls.secondaryButton} ${
                      (newHomeworkDraft.baseStatus ?? 'DRAFT') === 'DRAFT' ? styles.activeChip : ''
                    }`}
                    onClick={() => handleCreateStatusChange('DRAFT')}
                    disabled={newHomeworkDraft.sendNow}
                  >
                    Черновик
                  </button>
                  <button
                    className={`${controls.secondaryButton} ${
                      (newHomeworkDraft.baseStatus ?? 'DRAFT') === 'ASSIGNED' ? styles.activeChip : ''
                    }`}
                    onClick={() => handleCreateStatusChange('ASSIGNED')}
                    disabled={newHomeworkDraft.sendNow}
                  >
                    Назначено
                  </button>
                </div>
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newHomeworkDraft.sendNow}
                  onChange={(e) => handleSendNowToggle(e.target.checked)}
                />
                <span>Сразу отправить ученику</span>
              </label>
              {newHomeworkDraft.sendNow && (
                <div className={styles.helperText}>Задание будет опубликовано и станет доступно ученику</div>
              )}
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newHomeworkDraft.remindBefore}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, remindBefore: e.target.checked })}
                />
                <span>Включить напоминание за 24 часа</span>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button className={controls.secondaryButton} onClick={() => setIsHomeworkModalOpen(false)}>
                Отмена
              </button>
              <button
                className={controls.primaryButton}
                onClick={() => {
                  onAddHomework();
                  if (newHomeworkDraft.text.trim()) {
                    setIsHomeworkModalOpen(false);
                  }
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
