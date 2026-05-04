import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HomeworkAssignment, Lesson, StudentListItem, Teacher } from '../../entities/types';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useSelectedStudent } from '@/entities/student/model/selectedStudent';
import {
  appendStudentProfileNote,
  deleteStudentProfileNote,
  updateStudentProfileNote,
} from '@/entities/student/lib/profileNotes';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { api } from '@/shared/api/client';
import { useStudentsData } from './model/useStudentsData';
import { useStudentsActions } from './model/useStudentsActions';
import { useStudentsList } from './model/useStudentsList';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { StudentTabId } from './types';
import { StudentsReferenceListView } from './components/reference/StudentsReferenceListView';
import { StudentsReferenceProfileView } from './components/reference/StudentsReferenceProfileView';
import { BalanceTopupModal } from './components/BalanceTopupModal';
import type { StudentModalFocusField } from '@/features/modals/StudentModal/types';
import styles from './StudentsSectionReference.module.css';
import { tabPathById } from '@/app/tabs';
import { useToast } from '@/shared/lib/toast';

interface StudentsSectionProps {
  hasAccess: boolean;
  teacher: Teacher;
  lessons: Lesson[];
  onActiveTabChange?: (tab: StudentTabId) => void;
  onRequestDebtDetails?: () => void;
  onOpenHomeworkAssign?: (studentId?: number | null, lessonId?: number | null) => void;
  studentListReloadKey: number;
}

type ProfileTabId = 'homework' | 'lessons' | 'payments';
const STUDENT_PROFILE_HOMEWORK_PAGE_SIZE = 15;

const resolveTabFromSearch = (search: string): ProfileTabId => {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === 'homework' || tab === 'lessons' || tab === 'payments') return tab;
  return 'lessons';
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  hasAccess,
  onActiveTabChange,
  onOpenHomeworkAssign,
  studentListReloadKey,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { studentId: routeStudentIdParam } = useParams<{ studentId?: string }>();
  const timeZone = useTimeZone();
  const isMobile = useIsMobile(900);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const {
    openCreateStudentModal,
    openEditStudentModal,
    requestDeleteStudent,
    requestToggleCompletion,
    togglePaymentReminders,
    topupBalance,
  } = useStudentsActions();

  const {
    studentLessons,
    studentLessonsHasMore,
    studentLessonsSummary,
    studentLessonLoading,
    studentLessonLoadingMore,
    loadStudentLessons,
    loadMoreStudentLessons,
    loadStudentUnpaidLessons,
    studentDebtItems,
    studentDebtTotal,
    payments,
    paymentsLoading,
    refreshPayments,
    refreshPaymentReminders,
  } = useStudentsData();
  const { openCreateLessonForStudent, remindLessonPayment, togglePaid } = useLessonActions();
  const routeStudentId = (() => {
    const value = Number(routeStudentIdParam);
    return Number.isFinite(value) && value > 0 ? value : null;
  })();

  const {
    items: studentListItems,
    summary: studentListSummary,
    total: studentListTotal,
    hasMore: studentListHasMore,
    isLoading: studentListLoading,
    loadMore: loadMoreStudents,
    updateItem: updateStudentListItem,
  } = useStudentsList({
    hasAccess,
    studentQuery: '',
    studentFilter: 'all',
    selectedStudentId,
    setSelectedStudentId,
    reloadKey: studentListReloadKey,
  });

  const [activeTab, setActiveTab] = useState<ProfileTabId>(() => resolveTabFromSearch(location.search));
  const [routeStudentEntry, setRouteStudentEntry] = useState<StudentListItem | null>(null);
  const [routeStudentEntryLoading, setRouteStudentEntryLoading] = useState(false);
  const [isBalanceTopupOpen, setIsBalanceTopupOpen] = useState(false);
  const [profileHomeworkAssignments, setProfileHomeworkAssignments] = useState<HomeworkAssignment[]>([]);
  const [profileHomeworkAssignmentsStudentId, setProfileHomeworkAssignmentsStudentId] = useState<number | null>(null);
  const [profileHomeworkAssignmentsLoading, setProfileHomeworkAssignmentsLoading] = useState(false);
  const [profileHomeworkAssignmentsLoadingMore, setProfileHomeworkAssignmentsLoadingMore] = useState(false);
  const [profileHomeworkAssignmentsHasMore, setProfileHomeworkAssignmentsHasMore] = useState(false);
  const [profileHomeworkAssignmentsNextOffset, setProfileHomeworkAssignmentsNextOffset] = useState<number | null>(null);
  const isProfileOpen = routeStudentId !== null;

  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const homeworkAssignmentsRequestIdRef = useRef(0);
  const homeworkAssignmentsRequestRef = useRef<{ key: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    if (!hasAccess) return;
    if (!routeStudentId) return;
    if (selectedStudentId === routeStudentId) return;
    setSelectedStudentId(routeStudentId);
  }, [hasAccess, routeStudentId, selectedStudentId, setSelectedStudentId]);

  useEffect(() => {
    if (!hasAccess) {
      setRouteStudentEntry(null);
      setRouteStudentEntryLoading(false);
      return;
    }

    if (!routeStudentId) {
      setRouteStudentEntry(null);
      setRouteStudentEntryLoading(false);
      return;
    }

    const entryFromList = studentListItems.find((item) => item.student.id === routeStudentId) ?? null;
    if (entryFromList) {
      setRouteStudentEntry(entryFromList);
      setRouteStudentEntryLoading(false);
      return;
    }

    let cancelled = false;
    setRouteStudentEntryLoading(true);

    void api
      .listStudents({ filter: 'all', limit: 1, offset: 0, studentId: routeStudentId })
      .then((data) => {
        if (cancelled) return;
        const nextEntry = data.items[0] ?? null;
        setRouteStudentEntry(nextEntry);
        if (!nextEntry) {
          navigate(tabPathById.students, { replace: true });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load student profile entry', error);
      })
      .finally(() => {
        if (cancelled) return;
        setRouteStudentEntryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasAccess, navigate, routeStudentId, studentListItems, studentListReloadKey]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !studentListHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreStudents();
        }
      },
      { root: listRef.current, rootMargin: '160px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMoreStudents, studentListHasMore]);

  useEffect(() => {
    const nextTab = resolveTabFromSearch(location.search);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [location.search]);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    const debtRub = studentDebtTotal > 0 ? studentDebtTotal : null;
    const debtLessonCount = studentDebtItems.length > 0 ? studentDebtItems.length : null;

    updateStudentListItem(selectedStudentId, (item) => {
      if (item.debtRub === debtRub && item.debtLessonCount === debtLessonCount) {
        return item;
      }
      return { ...item, debtRub, debtLessonCount };
    });
  }, [selectedStudentId, studentDebtItems.length, studentDebtTotal, updateStudentListItem]);

  useEffect(() => {
    if (!isProfileOpen) {
      onActiveTabChange?.('overview');
      return;
    }
    onActiveTabChange?.(activeTab);
  }, [activeTab, isProfileOpen, onActiveTabChange]);

  const loadProfileHomeworkAssignments = useCallback(
    async (options?: { studentIdOverride?: number | null; offset?: number; append?: boolean }) => {
      const targetStudentId = options?.studentIdOverride ?? routeStudentId ?? selectedStudentId;
      if (!targetStudentId) {
        setProfileHomeworkAssignments([]);
        setProfileHomeworkAssignmentsStudentId(null);
        setProfileHomeworkAssignmentsHasMore(false);
        setProfileHomeworkAssignmentsNextOffset(null);
        return;
      }

      const offset = options?.offset ?? 0;
      const append = Boolean(options?.append);
      const requestKey = JSON.stringify({
        studentId: targetStudentId,
        offset,
        limit: STUDENT_PROFILE_HOMEWORK_PAGE_SIZE,
      });

      if (homeworkAssignmentsRequestRef.current?.key === requestKey) {
        return homeworkAssignmentsRequestRef.current.promise;
      }

      const requestId = homeworkAssignmentsRequestIdRef.current + 1;
      homeworkAssignmentsRequestIdRef.current = requestId;
      const promise = (async () => {
        if (append) {
          setProfileHomeworkAssignmentsLoadingMore(true);
        } else {
          if (profileHomeworkAssignmentsStudentId !== targetStudentId) {
            setProfileHomeworkAssignments([]);
            setProfileHomeworkAssignmentsHasMore(false);
            setProfileHomeworkAssignmentsNextOffset(null);
          }
          setProfileHomeworkAssignmentsStudentId(targetStudentId);
          setProfileHomeworkAssignmentsLoading(true);
        }

        try {
          const response = await api.listHomeworkAssignmentsV2({
            studentId: targetStudentId,
            limit: STUDENT_PROFILE_HOMEWORK_PAGE_SIZE,
            offset,
            sort: 'created',
          });
          if (homeworkAssignmentsRequestIdRef.current !== requestId) return;

          setProfileHomeworkAssignmentsStudentId(targetStudentId);
          setProfileHomeworkAssignmentsHasMore(response.nextOffset !== null);
          setProfileHomeworkAssignmentsNextOffset(response.nextOffset);
          setProfileHomeworkAssignments((prev) =>
            append
              ? [...prev, ...response.items.filter((assignment) => !prev.some((item) => item.id === assignment.id))]
              : response.items,
          );
        } catch (error) {
          console.error('Failed to load profile homework assignments', error);
        } finally {
          if (homeworkAssignmentsRequestIdRef.current === requestId) {
            if (append) {
              setProfileHomeworkAssignmentsLoadingMore(false);
            } else {
              setProfileHomeworkAssignmentsLoading(false);
            }
          }
        }
      })();

      homeworkAssignmentsRequestRef.current = { key: requestKey, promise };
      try {
        await promise;
      } finally {
        if (homeworkAssignmentsRequestRef.current?.key === requestKey) {
          homeworkAssignmentsRequestRef.current = null;
        }
      }
    },
    [profileHomeworkAssignmentsStudentId, routeStudentId, selectedStudentId],
  );

  useEffect(() => {
    const profileStudentId = routeStudentId ?? selectedStudentId;
    if (!profileStudentId || !isProfileOpen) return;
    void loadStudentUnpaidLessons({ studentIdOverride: profileStudentId });

    if (activeTab === 'homework') {
      void loadProfileHomeworkAssignments({ studentIdOverride: profileStudentId });
      return;
    }

    if (activeTab === 'lessons') {
      void loadStudentLessons({ studentIdOverride: profileStudentId });
      return;
    }

    if (activeTab === 'payments') {
      void refreshPayments(profileStudentId);
      void refreshPaymentReminders(profileStudentId);
    }
  }, [
    activeTab,
    isProfileOpen,
    loadProfileHomeworkAssignments,
    loadStudentLessons,
    loadStudentUnpaidLessons,
    refreshPaymentReminders,
    refreshPayments,
    routeStudentId,
    selectedStudentId,
  ]);

  const loadMoreProfileHomeworkAssignments = useCallback(() => {
    if (
      profileHomeworkAssignmentsLoading ||
      profileHomeworkAssignmentsLoadingMore ||
      !profileHomeworkAssignmentsHasMore
    ) {
      return;
    }
    if (typeof profileHomeworkAssignmentsNextOffset !== 'number') return;
    void loadProfileHomeworkAssignments({
      offset: profileHomeworkAssignmentsNextOffset,
      append: true,
    });
  }, [
    loadProfileHomeworkAssignments,
    profileHomeworkAssignmentsHasMore,
    profileHomeworkAssignmentsLoading,
    profileHomeworkAssignmentsLoadingMore,
    profileHomeworkAssignmentsNextOffset,
  ]);

  const handleRemindHomeworkAssignment = useCallback(
    async (assignmentId: number) => {
      try {
        const response = await api.remindHomeworkAssignmentV2(assignmentId);
        setProfileHomeworkAssignments((prev) =>
          prev.map((assignment) => (assignment.id === assignmentId ? response.assignment : assignment)),
        );
        showToast({ message: 'Напоминание отправлено', variant: 'success' });
      } catch (error) {
        console.error('Failed to remind homework assignment', error);
        showToast({ message: 'Не удалось отправить напоминание', variant: 'error' });
      }
    },
    [showToast],
  );

  const selectedStudentEntry = useMemo(() => {
    const targetStudentId = routeStudentId ?? selectedStudentId;
    if (!targetStudentId) return null;
    return (
      studentListItems.find((item) => item.student.id === targetStudentId) ??
      (routeStudentEntry?.student.id === targetStudentId ? routeStudentEntry : null)
    );
  }, [routeStudentEntry, routeStudentId, selectedStudentId, studentListItems]);

  const handleOpenProfile = (studentId: number) => {
    setSelectedStudentId(studentId);
    const params = new URLSearchParams(location.search);
    params.set('tab', activeTab);
    const nextSearch = params.toString();
    navigate(`${tabPathById.students}/${studentId}${nextSearch ? `?${nextSearch}` : ''}`);
  };

  const handleTabChange = (tab: ProfileTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  const handleBackToList = () => {
    navigate(tabPathById.students);
  };

  const handleScheduleLesson = () => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    openCreateLessonForStudent(profileStudentId, {
      variant: isMobile ? 'sheet' : 'modal',
      skipNavigation: true,
    });
  };

  const handleAddStudent = () => {
    openCreateStudentModal({ variant: isMobile ? 'sheet' : 'modal' });
  };

  const handleEditStudentFromList = (studentId: number) => {
    setSelectedStudentId(studentId);
    openEditStudentModal({ studentId, variant: isMobile ? 'sheet' : 'modal' });
  };

  const handleDeleteStudentFromList = (studentId: number) => {
    requestDeleteStudent(studentId);
  };

  const handleToggleCompletionFromList = (studentId: number) => {
    requestToggleCompletion(studentId);
  };

  const handleScheduleLessonFromList = (studentId: number) => {
    setSelectedStudentId(studentId);
    openCreateLessonForStudent(studentId, {
      variant: isMobile ? 'sheet' : 'modal',
      skipNavigation: true,
    });
  };

  const handleTopUpBalanceFromList = (studentId: number) => {
    setSelectedStudentId(studentId);
    navigate(`${tabPathById.students}/${studentId}`);
    setIsBalanceTopupOpen(true);
  };

  const handleAssignHomeworkFromList = (studentId: number) => {
    onOpenHomeworkAssign?.(studentId, null);
  };

  const handleWriteToStudentFromList = (studentId: number) => {
    const entry = studentListItems.find((item) => item.student.id === studentId);
    const username = entry?.student.username?.trim();
    if (!username) {
      showToast({ message: 'У ученика нет Telegram-юзернейма', variant: 'error' });
      return;
    }
    const normalized = username.startsWith('@') ? username.slice(1) : username;
    window.location.href = `tg://resolve?domain=${normalized}`;
  };

  const handleEditStudent = (options?: { focusField?: StudentModalFocusField }) => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    setSelectedStudentId(profileStudentId);
    openEditStudentModal({ variant: isMobile ? 'sheet' : 'modal', focusField: options?.focusField });
  };

  const handleDeleteStudent = () => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    requestDeleteStudent(profileStudentId);
  };

  const handleToggleCompletionFromProfile = () => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    requestToggleCompletion(profileStudentId);
  };

  const handleOpenBalanceTopup = () => {
    if (!selectedStudentEntry) return;
    setIsBalanceTopupOpen(true);
  };

  const handleToggleStudentPaymentReminders = (enabled: boolean) => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    void togglePaymentReminders(profileStudentId, enabled);
  };

  const applyUpdatedStudentLink = useCallback(
    (studentId: number, nextLink: StudentListItem['link']) => {
      updateStudentListItem(studentId, (item) => ({ ...item, link: nextLink }));
      setRouteStudentEntry((prev) =>
        prev?.student.id === studentId
          ? {
              ...prev,
              link: nextLink,
            }
          : prev,
      );
    },
    [updateStudentListItem],
  );

  const saveStudentNotes = useCallback(
    async (studentEntry: StudentListItem, notes: string) => {
      const data = await api.updateStudent(studentEntry.student.id, {
        customName: studentEntry.link.customName,
        username: studentEntry.student.username ?? '',
        pricePerLesson: studentEntry.link.pricePerLesson,
        email: studentEntry.link.email ?? '',
        phone: studentEntry.link.phone ?? '',
        studentLevel: studentEntry.link.studentLevel ?? '',
        learningGoal: studentEntry.link.learningGoal ?? '',
        notes,
      });
      applyUpdatedStudentLink(studentEntry.student.id, data.link);
    },
    [applyUpdatedStudentLink],
  );

  const handleCreateStudentNote = useCallback(
    async (studentEntry: StudentListItem, payload: { content: string; noteType: 'IMPORTANT' | 'INFO' }) => {
      const nextNotes = appendStudentProfileNote(studentEntry.link.notes, payload);
      await saveStudentNotes(studentEntry, nextNotes);
    },
    [saveStudentNotes],
  );

  const handleUpdateStudentNote = useCallback(
    async (
      studentEntry: StudentListItem,
      noteId: string,
      payload: { content: string; noteType: 'IMPORTANT' | 'INFO' },
    ) => {
      const nextNotes = updateStudentProfileNote(studentEntry.link.notes, noteId, payload);
      await saveStudentNotes(studentEntry, nextNotes);
    },
    [saveStudentNotes],
  );

  const handleDeleteStudentNote = useCallback(
    async (studentEntry: StudentListItem, noteId: string) => {
      const nextNotes = deleteStudentProfileNote(studentEntry.link.notes, noteId);
      await saveStudentNotes(studentEntry, nextNotes);
    },
    [saveStudentNotes],
  );

  const handleSaveStudentLearningGoal = useCallback(
    async (studentEntry: StudentListItem, value: string) => {
      const trimmed = value.trim();
      if ((studentEntry.link.learningGoal ?? '') === trimmed) return;
      try {
        const data = await api.updateStudent(studentEntry.student.id, {
          customName: studentEntry.link.customName,
          username: studentEntry.student.username ?? '',
          pricePerLesson: studentEntry.link.pricePerLesson,
          email: studentEntry.link.email ?? '',
          phone: studentEntry.link.phone ?? '',
          studentLevel: studentEntry.link.studentLevel ?? '',
          learningGoal: trimmed,
          notes: studentEntry.link.notes ?? '',
        });
        applyUpdatedStudentLink(studentEntry.student.id, data.link);
        showToast({
          message: trimmed ? 'Цель обновлена' : 'Цель удалена',
          variant: 'success',
        });
      } catch (error) {
        showToast({ message: 'Не удалось сохранить цель', variant: 'error' });
        throw error;
      }
    },
    [applyUpdatedStudentLink, showToast],
  );

  const handleWriteToStudent = () => {
    const username = selectedStudentEntry?.student.username?.trim();
    if (!username) return;
    const normalized = username.startsWith('@') ? username.slice(1) : username;
    window.location.href = `tg://resolve?domain=${normalized}`;
  };

  if (!hasAccess) {
    return <section className={styles.section}>Доступ к разделу учеников ограничен.</section>;
  }

  return (
    <section className={styles.section}>
      {!isProfileOpen ? (
        <StudentsReferenceListView
          students={studentListItems}
          totalStudents={studentListTotal}
          summary={studentListSummary}
          isLoading={studentListLoading}
          hasMore={studentListHasMore}
          listRef={listRef}
          loadMoreRef={loadMoreRef}
          onOpenStudent={handleOpenProfile}
          onAddStudent={handleAddStudent}
          onEditStudent={handleEditStudentFromList}
          onDeleteStudent={handleDeleteStudentFromList}
          onToggleCompletion={handleToggleCompletionFromList}
          onScheduleLesson={handleScheduleLessonFromList}
          onTopUpBalance={handleTopUpBalanceFromList}
          onAssignHomework={onOpenHomeworkAssign ? handleAssignHomeworkFromList : undefined}
          onWriteStudent={handleWriteToStudentFromList}
          timeZone={timeZone}
        />
      ) : !selectedStudentEntry ? (
        routeStudentEntryLoading ? (
          <div className={styles.notFoundLoading}>Загружаем карточку ученика…</div>
        ) : (
          <div className={styles.notFoundPage}>
            <div className={styles.notFoundCard}>
              <div className={styles.notFoundIcon} aria-hidden>
                ?
              </div>
              <h2 className={styles.notFoundTitle}>Ученик не найден</h2>
              <p className={styles.notFoundDescription}>
                Возможно, ученик был удалён или вы перешли по устаревшей ссылке. Проверьте URL или вернитесь к списку.
              </p>
              <div className={styles.notFoundActions}>
                <button type="button" className={styles.notFoundSecondaryButton} onClick={handleBackToList}>
                  К списку учеников
                </button>
                <button type="button" className={styles.notFoundPrimaryButton} onClick={handleAddStudent}>
                  Добавить ученика
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <StudentsReferenceProfileView
          studentEntry={selectedStudentEntry}
          studentHomeworkAssignments={profileHomeworkAssignments}
          studentHomeworkAssignmentsLoading={profileHomeworkAssignmentsLoading}
          studentHomeworkAssignmentsHasMore={profileHomeworkAssignmentsHasMore}
          studentHomeworkAssignmentsLoadingMore={profileHomeworkAssignmentsLoadingMore}
          studentLessons={studentLessons}
          studentLessonsHasMore={studentLessonsHasMore}
          studentLessonsLoading={studentLessonLoading}
          studentLessonsLoadingMore={studentLessonLoadingMore}
          studentLessonsSummary={studentLessonsSummary}
          studentDebtItems={studentDebtItems}
          payments={payments}
          paymentsLoading={paymentsLoading}
          onLoadMoreHomeworks={loadMoreProfileHomeworkAssignments}
          onLoadMoreLessons={loadMoreStudentLessons}
          onCreateStudentNote={handleCreateStudentNote}
          onUpdateStudentNote={handleUpdateStudentNote}
          onDeleteStudentNote={handleDeleteStudentNote}
          onSaveLearningGoal={handleSaveStudentLearningGoal}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onBack={handleBackToList}
          onScheduleLesson={handleScheduleLesson}
          onEditStudent={handleEditStudent}
          onOpenBalanceTopup={handleOpenBalanceTopup}
          onRequestDeleteStudent={handleDeleteStudent}
          onRequestToggleCompletion={handleToggleCompletionFromProfile}
          onTogglePaymentReminders={handleToggleStudentPaymentReminders}
          onWriteToStudent={handleWriteToStudent}
          onRemindLessonPayment={remindLessonPayment}
          onTogglePaid={togglePaid}
          onRemindHomework={(assignmentId) => {
            void handleRemindHomeworkAssignment(assignmentId);
          }}
          timeZone={timeZone}
        />
      )}
      <BalanceTopupModal
        isOpen={isBalanceTopupOpen}
        isMobile={isMobile}
        student={selectedStudentEntry ? { ...selectedStudentEntry.student, link: selectedStudentEntry.link } : null}
        onClose={() => setIsBalanceTopupOpen(false)}
        onSubmit={(payload) => {
          if (!selectedStudentEntry) {
            return Promise.resolve();
          }
          return topupBalance(selectedStudentEntry.student.id, payload);
        }}
      />
    </section>
  );
};
