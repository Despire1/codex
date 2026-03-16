import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lesson, Teacher } from '../../entities/types';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useSelectedStudent } from '@/entities/student/model/selectedStudent';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { api } from '@/shared/api/client';
import { useStudentsData } from './model/useStudentsData';
import { useStudentsHomework } from './model/useStudentsHomework';
import { useStudentsActions } from './model/useStudentsActions';
import { useStudentsList } from './model/useStudentsList';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { StudentTabId } from './types';
import { StudentsReferenceListView } from './components/reference/StudentsReferenceListView';
import { StudentsReferenceProfileView } from './components/reference/StudentsReferenceProfileView';
import styles from './StudentsSectionReference.module.css';
import { tabPathById } from '@/app/tabs';

interface StudentsSectionProps {
  hasAccess: boolean;
  teacher: Teacher;
  lessons: Lesson[];
  onActiveTabChange?: (tab: StudentTabId) => void;
  onRequestDebtDetails?: () => void;
  studentListReloadKey: number;
}

type ProfileTabId = 'homework' | 'lessons' | 'payments';

const resolveTabFromSearch = (search: string): ProfileTabId => {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === 'homework' || tab === 'lessons' || tab === 'payments') return tab;
  return 'lessons';
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  hasAccess,
  onActiveTabChange,
  studentListReloadKey,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { studentId: routeStudentIdParam } = useParams<{ studentId?: string }>();
  const timeZone = useTimeZone();
  const isMobile = useIsMobile(900);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const { openCreateStudentModal, openEditStudentModal, requestDeleteStudent, togglePaymentReminders } =
    useStudentsActions();

  const {
    studentHomeworks,
    studentHomeworkLoading,
    loadStudentHomeworks,
    studentLessons,
    studentLessonsSummary,
    studentLessonLoading,
    loadStudentLessons,
    loadStudentLessonsSummary,
    loadStudentUnpaidLessons,
    studentDebtItems,
    studentDebtTotal,
    payments,
    paymentsLoading,
    refreshPayments,
    refreshPaymentReminders,
  } = useStudentsData();

  const { remindHomeworkById } = useStudentsHomework();
  const { openCreateLessonForStudent, startEditLesson, remindLessonPayment, togglePaid } = useLessonActions();
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
  const [routeStudentEntry, setRouteStudentEntry] = useState<(typeof studentListItems)[number] | null>(null);
  const [routeStudentEntryLoading, setRouteStudentEntryLoading] = useState(false);
  const isProfileOpen = routeStudentId !== null;

  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const profileStudentId = routeStudentId ?? selectedStudentId;
    if (!profileStudentId || !isProfileOpen) return;

    void loadStudentLessonsSummary({ studentIdOverride: profileStudentId });
    void loadStudentUnpaidLessons({ studentIdOverride: profileStudentId });

    if (activeTab === 'homework') {
      void loadStudentHomeworks({ studentIdOverride: profileStudentId });
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
    loadStudentHomeworks,
    loadStudentLessons,
    loadStudentLessonsSummary,
    loadStudentUnpaidLessons,
    refreshPaymentReminders,
    refreshPayments,
    routeStudentId,
    selectedStudentId,
  ]);

  const selectedStudentEntry = useMemo(
    () => {
      const targetStudentId = routeStudentId ?? selectedStudentId;
      if (!targetStudentId) return null;
      return (
        studentListItems.find((item) => item.student.id === targetStudentId) ??
        (routeStudentEntry?.student.id === targetStudentId ? routeStudentEntry : null)
      );
    },
    [routeStudentEntry, routeStudentId, selectedStudentId, studentListItems],
  );

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

  const handleEditStudent = (options?: { focusField?: 'price' }) => {
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

  const handleToggleStudentPaymentReminders = (enabled: boolean) => {
    const profileStudentId = selectedStudentEntry?.student.id ?? routeStudentId ?? selectedStudentId;
    if (!profileStudentId) return;
    void togglePaymentReminders(profileStudentId, enabled);
  };

  const handleOpenLesson = (lesson: Lesson) => {
    startEditLesson(lesson, { skipNavigation: true });
  };

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
          timeZone={timeZone}
        />
      ) : !selectedStudentEntry ? (
        <div>
          {routeStudentEntryLoading ? 'Загружаем карточку ученика…' : 'Ученик не найден.'}
        </div>
      ) : (
        <StudentsReferenceProfileView
          studentEntry={selectedStudentEntry}
          studentHomeworks={studentHomeworks}
          studentHomeworksLoading={studentHomeworkLoading}
          studentLessons={studentLessons}
          studentLessonsLoading={studentLessonLoading}
          studentLessonsSummary={studentLessonsSummary}
          studentDebtItems={studentDebtItems}
          payments={payments}
          paymentsLoading={paymentsLoading}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onBack={handleBackToList}
          onScheduleLesson={handleScheduleLesson}
          onEditStudent={handleEditStudent}
          onRequestDeleteStudent={handleDeleteStudent}
          onTogglePaymentReminders={handleToggleStudentPaymentReminders}
          onWriteToStudent={handleWriteToStudent}
          onRemindLessonPayment={remindLessonPayment}
          onTogglePaid={togglePaid}
          onRemindHomework={(homeworkId) => {
            void remindHomeworkById(homeworkId);
          }}
          onOpenLesson={handleOpenLesson}
          timeZone={timeZone}
        />
      )}
    </section>
  );
};
