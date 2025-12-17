import { FC } from 'react';
import { HomeworkStatus, LinkedStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';

interface StudentsSidebarProps {
  linkedStudents: LinkedStudent[];
  visibleStudents: LinkedStudent[];
  selectedStudentId: number | null;
  searchQuery: string;
  activeFilter: 'all' | 'debt' | 'overdue';
  counts: { withDebt: number; overdue: number };
  onSelectStudent: (id: number) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: 'all' | 'debt' | 'overdue') => void;
  onOpenStudentModal: () => void;
  getHomeworkStatusInfo: (homework: LinkedStudent['homeworks'][number]) => {
    status: HomeworkStatus;
    isOverdue: boolean;
  };
}

export const StudentsSidebar: FC<StudentsSidebarProps> = ({
  linkedStudents,
  visibleStudents,
  selectedStudentId,
  searchQuery,
  activeFilter,
  counts,
  onSelectStudent,
  onSearchChange,
  onFilterChange,
  onOpenStudentModal,
  getHomeworkStatusInfo,
}) => {
  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className={`${styles.filters} ${styles.listFilters}`}>
            <button
              className={`${styles.filterChip} ${activeFilter === 'all' ? styles.activeChip : ''}`}
              onClick={() => onFilterChange('all')}
            >
              Все
            </button>
            <button
              className={`${styles.filterChip} ${activeFilter === 'debt' ? styles.activeChip : ''}`}
              onClick={() => onFilterChange('debt')}
            >
              С долгом ({counts.withDebt})
            </button>
            <button
              className={`${styles.filterChip} ${activeFilter === 'overdue' ? styles.activeChip : ''}`}
              onClick={() => onFilterChange('overdue')}
            >
              Просрочено ДЗ ({counts.overdue})
            </button>
          </div>
        </div>

        <div className={styles.studentList}>
          {visibleStudents.map((student) => {
            const status =
              student.link.balanceLessons < 0 ? 'debt' : student.link.balanceLessons > 0 ? 'prepaid' : 'neutral';
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

          {!visibleStudents.length && <div className={styles.emptyState}>Ничего не найдено</div>}
        </div>
      </div>
    </aside>
  );
};
