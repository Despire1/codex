import { parseISO } from 'date-fns';
import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { Homework, HomeworkStatus, Lesson, PaymentEvent, Student, StudentListItem } from '../../entities/types';
import styles from './StudentsSection.module.css';
import { HomeworkPanel } from './components/HomeworkPanel';
import { LessonsTab } from './components/LessonsTab';
import { OverviewTab } from './components/OverviewTab';
import { PaymentsTab } from './components/PaymentsTab';
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
  const [editableLessonStatusId, setEditableLessonStatusId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'details'>('list');
  const studentListRef = useRef<HTMLDivElement | null>(null);
  const studentLoadMoreRef = useRef<HTMLDivElement | null>(null);

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

  const handleBackToList = () => {
    setMobileView('list');
  };
  const visibleStudents = studentListItems;

  const studentLessons = useMemo(() => {
    return lessons
      .filter((lesson) => lesson.studentId === selectedStudentId)
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());
  }, [lessons, selectedStudentId]);

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
            onOpenStudentModal={onOpenStudentModal}
          />
        )}

        {showDetails && (
          <div className={`${styles.content} ${isMobile ? styles.mobileContent : ''}`}>
            {isMobile && (
              <button className={styles.backButton} type="button" onClick={handleBackToList}>
                ← Назад
              </button>
            )}
            <div
              className={`${styles.contentGrid} ${isMobile ? styles.mobileContentGrid : ''}`}
            >
              <div className={`${styles.detailsBody} ${isMobile ? styles.mobileScrollArea : ''}`}>
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
            </div>
          </div>
        )}

        {!selectedStudent && !showDetails && !isMobile && (
          <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
        )}
      </div>

    </section>
  );
};
