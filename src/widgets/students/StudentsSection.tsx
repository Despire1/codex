import { type FC, type UIEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Homework,
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  PaymentEvent,
  PaymentEventType,
  Student,
  StudentDebtItem,
  StudentListItem,
} from '../../entities/types';
import styles from './StudentsSection.module.css';
// import { HomeworkPanel } from './components/HomeworkPanel';
import { LessonsTab } from './components/LessonsTab';
import { OverviewTab } from './components/OverviewTab';
import { PaymentsTab } from './components/PaymentsTab';
import { BalanceTopupModal } from './components/BalanceTopupModal';
import { StudentHero } from './components/StudentHero';
import { StudentsSidebar } from './components/StudentsSidebar';
import { NewHomeworkDraft, SelectedStudent } from './types';

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
  onBalanceTopup: (
    studentId: number,
    payload: {
      delta: number;
      type: Extract<PaymentEventType, 'TOP_UP' | 'MANUAL_PAID' | 'SUBSCRIPTION' | 'OTHER' | 'ADJUSTMENT'>;
      comment?: string;
      createdAt?: string;
    },
  ) => Promise<void>;
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
  onAddStudent: () => void;
  onEditStudent: () => void;
  onRequestDeleteStudent: (studentId: number) => void;
  studentLessons: Lesson[];
  studentDebtItems: StudentDebtItem[];
  studentDebtTotal: number;
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonListLoading: boolean;
  lessonSortOrder: LessonSortOrder;
  onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
  onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
  onLessonDateRangeChange: (range: LessonDateRange) => void;
  onLessonSortOrderChange: (order: LessonSortOrder) => void;
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
const getLessonStatusLabel = (status: Lesson['status']) => {
  if (status === 'COMPLETED') return 'Проведён';
  if (status === 'CANCELED') return 'Отменён';
  return 'Запланирован';
};

type StudentTabId = 'homework' | 'overview' | 'lessons' | 'payments';
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
  onBalanceTopup,
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
  onAddStudent,
  onEditStudent,
  onRequestDeleteStudent,
  studentLessons,
  studentDebtItems,
  studentDebtTotal,
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  lessonListLoading,
  lessonSortOrder,
  onLessonPaymentFilterChange,
  onLessonStatusFilterChange,
  onLessonDateRangeChange,
  onLessonSortOrderChange,
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
  const location = useLocation();
  const navigate = useNavigate();
  const selectedStudentEntry = studentListItems.find((item) => item.student.id === selectedStudentId);
  const selectedStudent: SelectedStudent | null = selectedStudentEntry
    ? { ...selectedStudentEntry.student, link: selectedStudentEntry.link }
    : null;

  const [activeTab, setActiveTab] = useState<StudentTabId>(() => resolveStudentTab(location.search));
  const [editableLessonStatusId, setEditableLessonStatusId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'details'>('list');
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isBalanceTopupOpen, setIsBalanceTopupOpen] = useState(false);
  const studentListRef = useRef<HTMLDivElement | null>(null);
  const studentLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.addEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

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

  const handleSelectStudent = (id: number) => {
    onSelectStudent(id);
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
            onSearchChange={onStudentSearchChange}
            onFilterChange={onStudentFilterChange}
            onAddStudent={onAddStudent}
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
                  studentLessons={studentLessons}
                  studentDebtItems={studentDebtItems}
                  studentDebtTotal={studentDebtTotal}
                  priceEditState={priceEditState}
                  activeTab={activeTab}
                  isMobile={isMobile}
                  onBackToList={handleBackToList}
                  onTabChange={handleTabChange}
                  onStartEditPrice={onStartEditPrice}
                  onPriceChange={onPriceChange}
                  onSavePrice={onSavePrice}
                  onCancelPriceEdit={onCancelPriceEdit}
                  onToggleAutoReminder={onToggleAutoReminder}
                  onAdjustBalance={onAdjustBalance}
                  onOpenBalanceTopup={handleOpenBalanceTopup}
                  onEditStudent={onEditStudent}
                  onRequestDeleteStudent={onRequestDeleteStudent}
                  onTogglePaid={onTogglePaid}
                />

                {/*
                {activeTab === 'homework' ? (
                  <HomeworkPanel
                    selectedStudent={selectedStudent}
                    studentHomeworks={studentHomeworks}
                    homeworkFilter={homeworkFilter}
                    homeworkListLoading={homeworkListLoading}
                    homeworkListHasMore={homeworkListHasMore}
                    isMobile={isMobile}
                    onHomeworkFilterChange={onHomeworkFilterChange}
                    onLoadMoreHomeworks={onLoadMoreHomeworks}
                    onToggleHomework={onToggleHomework}
                    onUpdateHomework={onUpdateHomework}
                    onRemindHomework={onRemindHomework}
                    onRemindHomeworkById={onRemindHomeworkById}
                    onSendHomework={onSendHomework}
                    onDeleteHomework={onDeleteHomework}
                    onAddHomework={onAddHomework}
                    onHomeworkDraftChange={onHomeworkDraftChange}
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
                    lessonListLoading={lessonListLoading}
                    lessonSortOrder={lessonSortOrder}
                    onLessonPaymentFilterChange={onLessonPaymentFilterChange}
                    onLessonStatusFilterChange={onLessonStatusFilterChange}
                    onLessonDateRangeChange={onLessonDateRangeChange}
                    onLessonSortOrderChange={onLessonSortOrderChange}
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
                      studentDebtItems={studentDebtItems}
                      studentLessons={studentLessons}
                      onRemindHomework={onRemindHomework}
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
            ? onBalanceTopup(selectedStudent.id, payload)
            : Promise.resolve()
        }
      />
    </section>
  );
};
