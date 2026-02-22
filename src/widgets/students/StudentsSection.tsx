import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lesson, Teacher } from '../../entities/types';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useSelectedStudent } from '@/entities/student/model/selectedStudent';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { useStudentsData } from './model/useStudentsData';
import { useStudentsHomework } from './model/useStudentsHomework';
import { useStudentsList } from './model/useStudentsList';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import { StudentTabId } from './types';
import { StudentsReferenceListView } from './components/reference/StudentsReferenceListView';
import { StudentsReferenceProfileView } from './components/reference/StudentsReferenceProfileView';
import styles from './StudentsSectionReference.module.css';

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
  return 'homework';
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  hasAccess,
  onActiveTabChange,
  studentListReloadKey,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const timeZone = useTimeZone();
  const isMobile = useIsMobile(900);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();

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
  const { openCreateLessonForStudent, startEditLesson } = useLessonActions();

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

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTabId>(() => resolveTabFromSearch(location.search));

  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasAccess) {
      setIsProfileOpen(false);
    }
  }, [hasAccess]);

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
      setIsProfileOpen(false);
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
    if (!selectedStudentId || !isProfileOpen) return;

    void loadStudentLessonsSummary({ studentIdOverride: selectedStudentId });
    void loadStudentUnpaidLessons({ studentIdOverride: selectedStudentId });

    if (activeTab === 'homework') {
      void loadStudentHomeworks({ studentIdOverride: selectedStudentId });
      return;
    }

    if (activeTab === 'lessons') {
      void loadStudentLessons({ studentIdOverride: selectedStudentId });
      return;
    }

    if (activeTab === 'payments') {
      void refreshPayments(selectedStudentId);
      void refreshPaymentReminders(selectedStudentId);
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
    selectedStudentId,
  ]);

  const selectedStudentEntry = useMemo(
    () => studentListItems.find((item) => item.student.id === selectedStudentId) ?? null,
    [selectedStudentId, studentListItems],
  );

  const handleOpenProfile = (studentId: number) => {
    setSelectedStudentId(studentId);
    setIsProfileOpen(true);
  };

  const handleBackToList = () => {
    setIsProfileOpen(false);
  };

  const handleTabChange = (tab: ProfileTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  };

  const handleScheduleLesson = () => {
    if (!selectedStudentId) return;
    openCreateLessonForStudent(selectedStudentId, { variant: isMobile ? 'sheet' : 'modal' });
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
      {!isProfileOpen || !selectedStudentEntry ? (
        <StudentsReferenceListView
          students={studentListItems}
          totalStudents={studentListTotal}
          summary={studentListSummary}
          isLoading={studentListLoading}
          hasMore={studentListHasMore}
          listRef={listRef}
          loadMoreRef={loadMoreRef}
          onOpenStudent={handleOpenProfile}
          timeZone={timeZone}
        />
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
          onWriteToStudent={handleWriteToStudent}
          onRemindHomework={(homeworkId) => {
            void remindHomeworkById(homeworkId);
          }}
          onOpenLesson={startEditLesson}
          timeZone={timeZone}
        />
      )}
    </section>
  );
};
