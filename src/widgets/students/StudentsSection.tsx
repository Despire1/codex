import { type FC, type UIEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  Teacher,
} from '../../entities/types';
import styles from './StudentsSection.module.css';
// import { HomeworkPanel } from './components/HomeworkPanel';
import { LessonsTab } from './components/LessonsTab';
import { OverviewTab } from './components/OverviewTab';
import { PaymentsTab } from './components/PaymentsTab';
import { BalanceTopupModal } from './components/BalanceTopupModal';
import { StudentHero } from './components/StudentHero';
import { StudentsSidebar } from './components/StudentsSidebar';
import { SelectedStudent, StudentTabId } from './types';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { useStudentsList } from './model/useStudentsList';
import { useStudentsFilters } from './model/useStudentsFilters';
import { useSelectedStudent } from '@/entities/student/model/selectedStudent';
import { useStudentsData } from './model/useStudentsData';
import { useStudentsActions } from './model/useStudentsActions';
import { useStudentsHomework } from './model/useStudentsHomework';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';

interface StudentsSectionProps {
  hasAccess: boolean;
  teacher: Teacher;
  lessons: Lesson[];
  homeworkFilter: 'all' | HomeworkStatus | 'overdue';
  onHomeworkFilterChange: (filter: 'all' | HomeworkStatus | 'overdue') => void;
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonSortOrder: LessonSortOrder;
  onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
  onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
  onLessonDateRangeChange: (range: LessonDateRange) => void;
  onLessonSortOrderChange: (order: LessonSortOrder) => void;
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate: string;
  onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
  onPaymentDateChange: (date: string) => void;
  onActiveTabChange?: (tab: StudentTabId) => void;
  onRequestDebtDetails?: () => void;
  studentListReloadKey: number;
}
const getLessonStatusLabel = (status: Lesson['status']) => {
  if (status === 'COMPLETED') return 'Проведён';
  if (status === 'CANCELED') return 'Отменён';
  return 'Запланирован';
};

// const DEFAULT_STUDENT_TAB: StudentTabId = 'homework';
const DEFAULT_STUDENT_TAB: StudentTabId = 'overview';
// const studentTabs: StudentTabId[] = ['homework', 'overview', 'lessons', 'payments'];
const studentTabs: StudentTabId[] = ['overview', 'lessons', 'payments'];

const resolveStudentTab = (search: string): StudentTabId => {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab && studentTabs.includes(tab as StudentTabId)) {
    return tab as StudentTabId;
  }
  return DEFAULT_STUDENT_TAB;
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  hasAccess,
  teacher,
  lessons,
  homeworkFilter,
  onHomeworkFilterChange,
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  lessonSortOrder,
  onLessonPaymentFilterChange,
  onLessonStatusFilterChange,
  onLessonDateRangeChange,
  onLessonSortOrderChange,
  paymentFilter,
  paymentDate,
  onPaymentFilterChange,
  onPaymentDateChange,
  onActiveTabChange,
  onRequestDebtDetails,
  studentListReloadKey,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const {
    studentHomeworks,
    studentHomeworkHasMore,
    studentHomeworkLoading,
    loadMoreStudentHomeworks,
    studentLessons,
    studentLessonsSummary,
    studentDebtItems,
    studentDebtTotal,
    studentLessonLoading,
    payments,
    paymentReminders,
    paymentRemindersHasMore,
    paymentsLoading,
    paymentRemindersLoading,
    paymentRemindersLoadingMore,
    openPaymentReminders,
    loadMorePaymentReminders,
  } = useStudentsData();
  const {
    priceEditState,
    openCreateStudentModal,
    openEditStudentModal,
    requestDeleteStudent,
    startEditPrice,
    setPriceValue,
    savePrice,
    cancelPriceEdit,
    togglePaymentReminders,
    adjustBalance,
    topupBalance,
  } = useStudentsActions();
  const {
    openCreateLessonForStudent,
    startEditLesson,
    requestDeleteLessonFromList,
    markLessonCompleted,
    updateLessonStatus,
    togglePaid,
    remindLessonPayment,
  } = useLessonActions();
  const {
    newHomeworkDraft,
    setHomeworkDraft,
    addHomework,
    sendHomeworkToStudent,
    duplicateHomework,
    deleteHomework,
    toggleHomeworkDone,
    updateHomework,
    remindHomework,
    remindHomeworkById,
  } = useStudentsHomework();
  const { search: studentSearch, filter: studentFilter, query: studentQuery, setSearch, setFilter } =
    useStudentsFilters();
  const {
    items: studentListItems,
    counts: studentListCounts,
    total: studentListTotal,
    hasMore: studentListHasMore,
    isLoading: studentListLoading,
    loadMore: loadMoreStudents,
    updateItem: updateStudentListItem,
  } = useStudentsList({
    hasAccess,
    studentQuery,
    studentFilter,
    selectedStudentId,
    setSelectedStudentId,
    reloadKey: studentListReloadKey,
  });
  const selectedStudentEntry = studentListItems.find((item) => item.student.id === selectedStudentId);
  const selectedStudent: SelectedStudent | null = selectedStudentEntry
    ? { ...selectedStudentEntry.student, link: selectedStudentEntry.link }
    : null;
  const studentDebtSummary = selectedStudentEntry
    ? {
        total: selectedStudentEntry.debtRub ?? null,
        count: selectedStudentEntry.debtLessonCount ?? null,
      }
    : null;
  const paymentRemindersCount = selectedStudentEntry?.paymentRemindersCount ?? null;

  const [activeTab, setActiveTab] = useState<StudentTabId>(() => resolveStudentTab(location.search));
  const [editableLessonStatusId, setEditableLessonStatusId] = useState<number | null>(null);
  const isMobile = useIsMobile(720);
  const [mobileView, setMobileView] = useState<'list' | 'details'>('list');
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isBalanceTopupOpen, setIsBalanceTopupOpen] = useState(false);
  const studentListRef = useRef<HTMLDivElement | null>(null);
  const studentLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);

  useEffect(() => {
    if (!selectedStudentId) return;
    const debtRub = studentDebtTotal > 0 ? studentDebtTotal : null;
    const debtLessonCount = studentDebtItems.length > 0 ? studentDebtItems.length : null;
    updateStudentListItem(selectedStudentId, (item) => {
      if (item.debtRub === debtRub && item.debtLessonCount === debtLessonCount) {
        return item;
      }
      return { ...item, debtRub, debtLessonCount };
    });
  }, [selectedStudentId, studentDebtItems, studentDebtTotal, updateStudentListItem]);

  useEffect(() => {
    if (!selectedStudentId && isMobile) {
      setMobileView('list');
    }
  }, [selectedStudentId, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    headerRef.current?.style.setProperty('--header-collapse', '0');
    scrollProgressRef.current = 0;
  }, [isMobile, mobileView, selectedStudentId]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setIsBalanceTopupOpen(false);
    }
  }, [selectedStudentId]);

  useEffect(() => {
    const nextTab = resolveStudentTab(location.search);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [location.search]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    const target = studentLoadMoreRef.current;
    if (!target || !studentListHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreStudents();
        }
      },
      { root: studentListRef.current, rootMargin: '120px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMoreStudents, studentListHasMore]);

  const handleStartEditLessonStatus = (lessonId: number) => {
    setEditableLessonStatusId(lessonId);
  };

  const handleStopEditLessonStatus = () => {
    setEditableLessonStatusId(null);
  };

  const handleLessonStatusChange = (lessonId: number, status: Lesson['status']) => {
    updateLessonStatus(lessonId, status);
    setEditableLessonStatusId(null);
  };

  const handleSelectStudent = (id: number) => {
    setSelectedStudentId(id);
    if (isMobile) {
      setMobileView('details');
    }
  };

  const handleTabChange = (tab: StudentTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    const nextSearch = params.toString();
    const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    navigate(nextUrl, { replace: true });
  };

  const handleBackToList = () => {
    setMobileView('list');
  };

  const handleDetailsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const scrollTop = event.currentTarget.scrollTop;
    const collapseDistance = 120;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      const progress = Math.min(Math.max(scrollTop / collapseDistance, 0), 1);
      if (Math.abs(progress - scrollProgressRef.current) < 0.01) {
        return;
      }
      scrollProgressRef.current = progress;
      headerRef.current?.style.setProperty('--header-collapse', progress.toFixed(3));
    });
  };

  const handleOpenBalanceTopup = () => {
    if (!selectedStudent) return;
    setIsBalanceTopupOpen(true);
  };

  const handleCloseBalanceTopup = () => {
    setIsBalanceTopupOpen(false);
  };
  const visibleStudents = studentListItems;

  const showDetails = Boolean(selectedStudent) && (!isMobile || mobileView === 'details');
  const showList = !isMobile || mobileView === 'list' || !selectedStudent;

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        {showList && (
          <StudentsSidebar
            studentListItems={visibleStudents}
            lessons={lessons}
            selectedStudentId={selectedStudentId}
            searchQuery={studentSearch}
            activeFilter={studentFilter}
            counts={studentListCounts}
            totalCount={studentListTotal}
            isLoading={studentListLoading}
            hasMore={studentListHasMore}
            listRef={studentListRef}
            loadMoreRef={studentLoadMoreRef}
            onSelectStudent={handleSelectStudent}
            onSearchChange={setSearch}
            onFilterChange={setFilter}
            onAddStudent={openCreateStudentModal}
          />
        )}

        {showDetails && (
          <div className={`${styles.content} ${isMobile ? styles.mobileContent : ''}`}>
            <div
              className={`${styles.contentGrid} ${isMobile ? styles.mobileContentGrid : ''}`}
            >
              <div
                className={`${styles.detailsBody} ${isMobile ? styles.mobileScrollArea : ''}`}
                onScroll={handleDetailsScroll}
              >
                <StudentHero
                  headerRef={headerRef}
                  selectedStudent={selectedStudent}
                  studentLessonsSummary={studentLessonsSummary}
                  studentDebtItems={studentDebtItems}
                  studentDebtTotal={studentDebtTotal}
                  studentDebtSummary={studentDebtSummary}
                  priceEditState={priceEditState}
                  activeTab={activeTab}
                  isMobile={isMobile}
                  onBackToList={handleBackToList}
                  onTabChange={handleTabChange}
                  onStartEditPrice={startEditPrice}
                  onPriceChange={setPriceValue}
                  onSavePrice={savePrice}
                  onCancelPriceEdit={cancelPriceEdit}
                  onTogglePaymentReminders={togglePaymentReminders}
                  onAdjustBalance={adjustBalance}
                  onOpenBalanceTopup={handleOpenBalanceTopup}
                  onEditStudent={openEditStudentModal}
                  onRequestDeleteStudent={requestDeleteStudent}
                  onRequestDebtDetails={onRequestDebtDetails}
                  onRemindLessonPayment={remindLessonPayment}
                  onTogglePaid={togglePaid}
                />

                {/*
                {activeTab === 'homework' ? (
                  <HomeworkPanel
                    selectedStudent={selectedStudent}
                    studentHomeworks={studentHomeworks}
                    homeworkFilter={homeworkFilter}
                    homeworkListLoading={studentHomeworkLoading}
                    homeworkListHasMore={studentHomeworkHasMore}
                    isMobile={isMobile}
                    onHomeworkFilterChange={onHomeworkFilterChange}
                    onLoadMoreHomeworks={loadMoreStudentHomeworks}
                    onToggleHomework={toggleHomeworkDone}
                    onUpdateHomework={updateHomework}
                    onRemindHomework={remindHomework}
                    onRemindHomeworkById={remindHomeworkById}
                    onSendHomework={sendHomeworkToStudent}
                    onDeleteHomework={deleteHomework}
                    onAddHomework={addHomework}
                    onHomeworkDraftChange={setHomeworkDraft}
                    newHomeworkDraft={newHomeworkDraft}
                  />
                ) : */}
                {activeTab === 'lessons' ? (
                  <LessonsTab
                    studentLessons={studentLessons}
                    selectedStudent={selectedStudent}
                    selectedStudentId={selectedStudentId}
                    editableLessonStatusId={editableLessonStatusId}
                    lessonPaymentFilter={lessonPaymentFilter}
                    lessonStatusFilter={lessonStatusFilter}
                    lessonDateRange={lessonDateRange}
                    lessonListLoading={studentLessonLoading}
                    lessonSortOrder={lessonSortOrder}
                    onLessonPaymentFilterChange={onLessonPaymentFilterChange}
                    onLessonStatusFilterChange={onLessonStatusFilterChange}
                    onLessonDateRangeChange={onLessonDateRangeChange}
                    onLessonSortOrderChange={onLessonSortOrderChange}
                    onStartEditLessonStatus={handleStartEditLessonStatus}
                    onStopEditLessonStatus={handleStopEditLessonStatus}
                    onLessonStatusChange={handleLessonStatusChange}
                    onCreateLesson={openCreateLessonForStudent}
                    onCompleteLesson={markLessonCompleted}
                    onTogglePaid={togglePaid}
                    onEditLesson={startEditLesson}
                    onRequestDeleteLesson={requestDeleteLessonFromList}
                    getLessonStatusLabel={getLessonStatusLabel}
                    autoConfirmLessons={teacher.autoConfirmLessons}
                  />
                ) : activeTab === 'payments' ? (
                  <PaymentsTab
                    payments={payments}
                    paymentReminders={paymentReminders}
                    studentLessons={studentLessonsSummary}
                    isMobile={isMobile}
                    paymentFilter={paymentFilter}
                    paymentDate={paymentDate}
                    paymentRemindersCount={paymentRemindersCount}
                    paymentRemindersHasMore={paymentRemindersHasMore}
                    onPaymentFilterChange={onPaymentFilterChange}
                    onPaymentDateChange={onPaymentDateChange}
                    onOpenLesson={startEditLesson}
                    onOpenReminders={openPaymentReminders}
                    onLoadMoreReminders={loadMorePaymentReminders}
                    paymentsLoading={paymentsLoading}
                    paymentRemindersLoading={paymentRemindersLoading}
                    paymentRemindersLoadingMore={paymentRemindersLoadingMore}
                  />
                ) : (
                  selectedStudent && (
                    <OverviewTab
                      selectedStudent={selectedStudent}
                      studentLessonsSummary={studentLessonsSummary}
                      studentDebtItems={studentDebtItems}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {!selectedStudent && !showDetails && !isMobile && (
          <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
        )}
      </div>
      <BalanceTopupModal
        isOpen={isBalanceTopupOpen}
        isMobile={isMobile}
        student={selectedStudent ? { ...selectedStudent, link: selectedStudent.link } : null}
        onClose={handleCloseBalanceTopup}
        onSubmit={(payload) =>
          selectedStudent
            ? topupBalance(selectedStudent.id, payload)
            : Promise.resolve()
        }
      />
    </section>
  );
};
