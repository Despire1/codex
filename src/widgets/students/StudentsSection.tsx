import { format, isBefore, parseISO } from 'date-fns';
import { type ClipboardEvent as ReactClipboardEvent, type DragEvent, type FC, useEffect, useMemo, useState } from 'react';
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
  Student,
} from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './StudentsSection.module.css';

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
  }) => void;
  onToggleHomework: (homeworkId: number) => void;
  onUpdateHomework?: (homeworkId: number, payload: Partial<Homework>) => void;
  onOpenStudentModal: () => void;
  lessons: Lesson[];
  onCompleteLesson: (lessonId: number) => void;
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

const getLessonStatusLabel = (status: Lesson['status']) => {
  if (status === 'COMPLETED') return 'Проведён';
  if (status === 'CANCELLED') return 'Отменён';
  return 'Запланирован';
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
  onCompleteLesson,
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
  const [activeTab, setActiveTab] = useState<'homework' | 'overview' | 'lessons'>('homework');
  const [homeworkFilter, setHomeworkFilter] = useState<'all' | HomeworkStatus | 'overdue'>('all');
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [activeHomeworkId, setActiveHomeworkId] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');
  const [homeworkDraft, setHomeworkDraft] = useState<{
    text: string;
    deadline: string;
    status: HomeworkStatus;
    attachments: HomeworkAttachment[];
  }>({ text: '', deadline: '', status: 'ASSIGNED', attachments: [] });
  const [pendingHomeworkId, setPendingHomeworkId] = useState<number | null>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<HomeworkAttachment | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [openHomeworkMenuId, setOpenHomeworkMenuId] = useState<number | null>(null);
  const [isDrawerMenuOpen, setIsDrawerMenuOpen] = useState(false);
  const [isPrepaidOpen, setIsPrepaidOpen] = useState(false);

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

    const sameAttachments =
      originalAttachments.length === draftAttachments.length &&
      JSON.stringify(originalAttachments) === JSON.stringify(draftAttachments);

    return (
      activeHomework.text !== homeworkDraft.text ||
      (activeHomework.deadline ?? '') !== homeworkDraft.deadline ||
      (activeHomework.status ?? 'ASSIGNED') !== homeworkDraft.status ||
      !sameAttachments
    );
  }, [activeHomework, homeworkDraft]);

  const closeHomeworkDrawer = () => {
    if (drawerMode === 'edit' && hasUnsavedChanges) {
      setPendingHomeworkId(null);
      setShowUnsavedConfirm(true);
      return;
    }
    setIsDrawerMenuOpen(false);
    setOpenHomeworkMenuId(null);
    setActiveHomeworkId(null);
    setDrawerMode('view');
  };

  useEffect(() => {
    if (activeHomework) {
      setHomeworkDraft({
        text: activeHomework.text,
        deadline: activeHomework.deadline ?? '',
        status: (activeHomework.status as HomeworkStatus) ?? 'ASSIGNED',
        attachments: activeHomework.attachments ?? [],
      });
      setDrawerMode('view');
      setIsDescriptionExpanded(false);
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

  const resetDraftToOriginal = () => {
    if (!activeHomework) return;
    setHomeworkDraft({
      text: activeHomework.text,
      deadline: activeHomework.deadline ?? '',
      status: (activeHomework.status as HomeworkStatus) ?? 'ASSIGNED',
      attachments: activeHomework.attachments ?? [],
    });
  };

  const handleDiscardChanges = () => {
    resetDraftToOriginal();
    setShowUnsavedConfirm(false);
    setDrawerMode('view');
    if (pendingHomeworkId) {
      setActiveHomeworkId(pendingHomeworkId);
      setPendingHomeworkId(null);
    } else if (!pendingHomeworkId) {
      setActiveHomeworkId(null);
    }
  };

  const handleKeepEditing = () => {
    setShowUnsavedConfirm(false);
  };

  const handleOpenCreateHomework = () => {
    onHomeworkDraftChange({
      ...newHomeworkDraft,
      status: 'DRAFT',
      baseStatus: 'DRAFT',
      sendNow: false,
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
    } else {
      setActiveHomeworkId(null);
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

  const renderStatusPill = (statusInfo: HomeworkStatusInfo) => {
    const statusClass =
      statusInfo.status === 'DONE'
        ? styles.statusDone
        : statusInfo.status === 'IN_PROGRESS'
          ? styles.statusInProgress
          : statusInfo.status === 'ASSIGNED'
            ? styles.statusAssigned
            : styles.statusDraft;

    return <span className={`${styles.statusPill} ${statusClass}`}>{getStatusLabel(statusInfo.status)}</span>;
  };

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

    onUpdateHomework(homeworkId, { status: 'DRAFT' });
    setIsDrawerMenuOpen(false);
    setOpenHomeworkMenuId(null);
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
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.titleRow}>
                  <div>Ученики</div>
                  <span className={styles.counter}>{linkedStudents.length}</span>
                </div>
              </div>
              <button className={controls.secondaryButton} onClick={onOpenStudentModal}>
                + Добавить
              </button>
            </div>

            <div className={styles.searchBlock}>
              <input
                className={controls.input}
                placeholder="Поиск"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            <div className={`${styles.filters} ${styles.listFilters}`}>
              <button
                className={`${styles.filterChip} ${activeFilter === 'all' ? styles.activeChip : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                Все
              </button>
              <button
                className={`${styles.filterChip} ${activeFilter === 'debt' ? styles.activeChip : ''}`}
                onClick={() => setActiveFilter('debt')}
              >
                С долгом ({counts.withDebt})
              </button>
              <button
                className={`${styles.filterChip} ${activeFilter === 'overdue' ? styles.activeChip : ''}`}
                onClick={() => setActiveFilter('overdue')}
              >
                Просрочено ДЗ ({counts.overdue})
              </button>
            </div>
            </div>

            <div className={styles.studentList}>
              {visibleStudents.map((student) => {
                const status = student.link.balanceLessons < 0 ? 'debt' : student.link.balanceLessons > 0 ? 'prepaid' : 'neutral';
                const overdueCount = student.homeworks.filter((hw) => getHomeworkStatusInfo(hw).isOverdue).length;
                const pendingCount = student.homeworks.filter((hw) => !hw.isDone).length;

                return (
                  <button
                    key={student.id}
                    className={`${styles.studentCard} ${selectedStudentId === student.id ? styles.activeStudent : ''}`}
                    onClick={() => onSelectStudent(student.id)}
                  >
                    <div className={styles.studentStripe} aria-hidden />
                    <div className={styles.studentCardBody}>
                      <div className={styles.studentCardHeader}>
                        <div className={styles.studentName}>{student.link.customName}</div>
                        <div className={styles.badgeRow}>
                          {status === 'debt' && <span className={`${styles.lozenge} ${styles.badgeDanger}`}>Долг</span>}
                          {overdueCount > 0 && (
                            <span className={`${styles.lozenge} ${styles.badgeWarning}`}>ДЗ: {overdueCount}</span>
                          )}
                          {pendingCount === 0 && student.homeworks.length > 0 && (
                            <span className={`${styles.lozenge} ${styles.badgeSuccess}`}>ДЗ сделано</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.studentSecondaryRow}>
                        <span className={styles.studentMeta}>@{student.username || 'нет'}</span>
                        <span className={styles.metaDivider}>•</span>
                        <span className={styles.studentMeta}>
                          автонапоминания: {student.link.autoRemindHomework ? 'вкл' : 'выкл'}
                        </span>
                        <span className={styles.metaDivider}>•</span>
                        <span className={styles.studentMeta}>баланс: {student.link.balanceLessons}</span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {!visibleStudents.length && (
                <div className={styles.emptyState}>Ничего не найдено</div>
              )}
            </div>
          </div>
        </aside>

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid}>
              <div className={`${styles.card} ${styles.headerCard}`}>
                <div className={styles.heroHeader}>
                  <div className={styles.heroNameBlock}>
                    <h2 className={styles.profileName}>{selectedStudent.link.customName}</h2>
                    <div className={styles.studentMetaRow}>
                      <span>Telegram: @{selectedStudent.username || 'нет'}</span>
                      <span className={styles.metaDivider}>•</span>
                      <span>Автонапоминания: {selectedStudent.link.autoRemindHomework ? 'Вкл' : 'Выкл'}</span>
                    </div>
                  </div>
                  <div className={styles.heroActions}>
                    <div className={styles.actionsMenuWrapper}>
                      <button
                        className={controls.iconButton}
                        aria-label="Дополнительные действия"
                        onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                      >
                        ⋯
                      </button>
                      {isActionsMenuOpen && (
                        <div className={styles.actionsMenu}>
                          <button onClick={onOpenStudentModal}>Редактировать ученика</button>
                          <button onClick={() => onAdjustBalance(selectedStudent.id, -1)}>Напомнить про оплату</button>
                          <button onClick={() => navigator.clipboard?.writeText('Правила и памятка')}>Скопировать памятку</button>
                          <button className={styles.dangerButton}>Удалить ученика</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`${styles.summaryRow} ${styles.summaryInline}`}>
                  <div className={styles.summaryLine}>
                    <span className={styles.summaryLabel}>Баланс:</span>
                    <span className={styles.summaryValueInline}>
                      {selectedStudent.link.balanceLessons}
                      {selectedStudent.link.balanceLessons < 0 && (
                        <span className={`${styles.lozenge} ${styles.badgeDanger}`}>Долг</span>
                      )}
                      {selectedStudent.link.balanceLessons > 0 && (
                        <span className={`${styles.lozenge} ${styles.badgeSuccess}`}>Переплата</span>
                      )}
                    </span>
                    <span className={styles.summaryDivider}>|</span>
                    <div className={styles.inlinePopover}>
                      <button className={styles.summaryButton} onClick={() => setIsPrepaidOpen((prev) => !prev)}>
                        <span className={styles.summaryLabel}>Предоплачено:</span>
                        <span className={styles.summaryValueInline}>{selectedStudent.link.balanceLessons} уроков</span>
                      </button>
                      {isPrepaidOpen && (
                        <div className={styles.popover}>
                          <button onClick={() => onAdjustBalance(selectedStudent.id, 1)}>+1 занятие</button>
                          <button
                            onClick={() => onAdjustBalance(selectedStudent.id, -1)}
                            disabled={selectedStudent.link.balanceLessons <= 0}
                          >
                            -1 занятие
                          </button>
                          <button onClick={() => onAdjustBalance(selectedStudent.id, -selectedStudent.link.balanceLessons)}>
                            Сбросить в 0
                          </button>
                        </div>
                      )}
                    </div>
                    <span className={styles.summaryDivider}>|</span>
                    <div className={styles.priceInline}>
                      <span className={styles.summaryLabel}>Цена:</span>
                      {priceEditState.id === selectedStudent.id ? (
                        <div className={styles.priceEditorInline}>
                          <input
                            className={controls.input}
                            type="number"
                            value={priceEditState.value}
                            onChange={(e) => onPriceChange(e.target.value)}
                          />
                          <div className={styles.priceButtons}>
                            <button className={controls.primaryButton} onClick={onSavePrice}>Сохранить</button>
                            <button className={controls.secondaryButton} onClick={onCancelPriceEdit}>Отмена</button>
                          </div>
                        </div>
                      ) : (
                        <button className={styles.summaryButton} onClick={() => onStartEditPrice(selectedStudent)}>
                          <span className={styles.summaryValueInline}>
                            {selectedStudent.pricePerLesson && selectedStudent.pricePerLesson > 0
                              ? `${selectedStudent.pricePerLesson} ₽`
                              : 'Не задана'}
                          </span>
                          <EditOutlinedIcon width={16} height={16} />
                        </button>
                      )}
                    </div>
                    <span className={styles.summaryDivider}>|</span>
                    <div className={styles.toggleRow}>
                      <span className={styles.summaryLabel}>Автонапоминания:</span>
                      <button
                        className={`${styles.toggleButton} ${selectedStudent.link.autoRemindHomework ? styles.toggleOn : styles.toggleOff}`}
                        onClick={() => onToggleAutoReminder(selectedStudent.id)}
                        type="button"
                      >
                        {selectedStudent.link.autoRemindHomework ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${activeTab === 'homework' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('homework')}
                  >
                    Домашка
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'lessons' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('lessons')}
                  >
                    Занятия
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    Обзор
                  </button>
                </div>
              </div>

              {activeTab === 'homework' ? (
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Домашка</div>
                      <div className={styles.subtleLabel}>Статусы, дедлайны и быстрые действия</div>
                    </div>
                    <button className={controls.primaryButton} onClick={handleOpenCreateHomework}>
                    <span className={styles.iconLeading} aria-hidden>
                      <AddOutlinedIcon width={16} height={16}/>
                    </span>
                      Новое ДЗ
                    </button>
                  </div>

                  <div className={styles.filters}>
                    {[
                      {id: 'all', label: 'Все'},
                      {id: 'DRAFT', label: 'Черновики'},
                      {id: 'ASSIGNED', label: 'Назначено'},
                      {id: 'IN_PROGRESS', label: 'В работе' },
                      { id: 'DONE', label: 'Выполнено' },
                      { id: 'overdue', label: 'Просрочено' },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        className={`${styles.filterChip} ${homeworkFilter === filter.id ? styles.activeChip : ''}`}
                        onClick={() => setHomeworkFilter(filter.id as typeof homeworkFilter)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.homeworkList}>
                    {filteredHomeworks.map((hw) => {
                      const statusInfo = getHomeworkStatusInfo(hw);
                      const title = getHomeworkTitle(hw.text);
                      const deadlineLabel = hw.deadline
                        ? `Дедлайн: ${format(parseISO(`${hw.deadline}T00:00:00`), 'd MMM')}`
                        : 'Без дедлайна';
                      return (
                        <div
                          key={hw.id}
                          className={styles.homeworkItem}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setOpenHomeworkMenuId(null);
                            handleOpenHomework(hw.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleOpenHomework(hw.id);
                            }
                          }}
                          aria-pressed={activeHomeworkId === hw.id}
                        >
                          <div className={styles.homeworkContent}>
                            <div className={styles.homeworkTitleRow}>
                              <div className={styles.homeworkTitle}>{title}</div>
                            </div>
                            <div className={styles.homeworkMetaRow}>
                              <span className={styles.homeworkMeta}>{deadlineLabel}</span>
                            </div>
                          </div>
                          <div className={styles.homeworkActions}>
                            <div className={styles.statusStack}>
                              {renderStatusPill(statusInfo)}
                              {statusInfo.isOverdue && statusInfo.status !== 'DONE' && (
                                  <span className={`${styles.statusPill} ${styles.statusOverdue}`}>Просрочено</span>
                              )}
                            </div>
                            <div className={styles.iconActions}>
                              <button
                                  className={controls.iconButton}
                                  aria-label="Отметить выполненным"
                                  title="Переключить выполнено"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onToggleHomework(hw.id);
                                  }}
                              >
                                <CheckCircleOutlineIcon width={18} height={18}/>
                              </button>
                              <div className={styles.moreActionsWrapper}>
                                <button
                                    className={controls.iconButton}
                                    aria-label="Ещё"
                                    title="Ещё действия"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenHomeworkMenuId((prev) => (prev === hw.id ? null : hw.id));
                                    }}
                                >
                                  <MoreHorizIcon width={18} height={18}/>
                                </button>
                                {openHomeworkMenuId === hw.id && (
                                    <div className={styles.moreMenu}>
                                      <button
                                          aria-label="Напомнить"
                                          title="Отправить напоминание"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleHomeworkReminder(hw.id);
                                          }}
                                      >
                                        Напомнить
                                      </button>
                                      <button
                                          aria-label="Редактировать"
                                          title="Редактировать"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleOpenHomework(hw.id);
                                            setDrawerMode('edit');
                                          }}
                                      >
                                        Редактировать
                                      </button>
                                      <button
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleMoveToDraft(hw.id);
                                          }}
                                      >
                                        В черновик
                                      </button>
                                      <button
                                          className={styles.dangerButton}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleDeleteHomework(hw.id);
                                          }}
                                      >
                                        Удалить
                                      </button>
                                    </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {!filteredHomeworks.length && (
                        <div className={styles.emptyState}>
                          <p>Пока нет домашек. Добавьте новое задание.</p>
                          <button className={controls.primaryButton} onClick={handleOpenCreateHomework}>
                            + Новое ДЗ
                          </button>
                        </div>
                    )}
                  </div>
                </div>
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

                  <div className={styles.lessonList}>
                    {studentLessons.length ? (
                      studentLessons.map((lesson) => (
                        <div key={lesson.id} className={styles.lessonItem}>
                          <div>
                            <div className={styles.lessonTitle}>
                              {format(parseISO(lesson.startAt), 'd MMM, HH:mm')}
                            </div>
                            <div className={styles.lessonMeta}>
                              Статус: {getLessonStatusLabel(lesson.status)} • Оплата:{' '}
                              {lesson.isPaid ? 'Оплачено' : 'Не оплачено'} • Цена:{' '}
                              {(
                                lesson.participants?.find((p) => p.studentId === selectedStudentId)?.price ??
                                selectedStudent.pricePerLesson ??
                                0
                              )}{' '}
                              ₽
                            </div>
                          </div>
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
                        </div>
                      ))
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
          <button className={styles.drawerScrim} aria-label="Закрыть карточку ДЗ" onClick={closeHomeworkDrawer} />
          <aside className={`${styles.homeworkDrawer} ${styles.drawerOpen}`} aria-live="polite">
            <div className={styles.drawerHeaderSticky}>
              <div>
                <p className={styles.drawerEyebrow}>Домашнее задание</p>
                <div className={styles.drawerTitle}>{selectedStudent?.link.customName}</div>
                <div className={styles.drawerSubtitle}>@{selectedStudent?.username || 'нет'} • #{activeHomework.id}</div>
              </div>
              <div className={styles.drawerHeaderActions}>
                {onSendHomework && activeHomework && (
                  <button
                    className={controls.secondaryButton}
                    onClick={() => onSendHomework(activeHomework.id)}
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
                          <button
                              aria-label="В черновик"
                              onClick={() => handleMoveToDraft(activeHomework.id)}
                          >
                            В черновик
                          </button>
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
                    ? `Дедлайн: ${format(parseISO(`${homeworkDraft.deadline}T00:00:00`), 'd MMM')}`
                    : 'Без дедлайна'}
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
