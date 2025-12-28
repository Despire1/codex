import { FC, useState } from 'react';
import { Student, TeacherStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import {
  EditOutlinedIcon,
} from '../../../icons/MaterialIcons';
import styles from '../StudentsSection.module.css';

interface StudentHeroProps {
  selectedStudent: Student & { link: TeacherStudent };
  priceEditState: { id: number | null; value: string };
  activeTab: 'homework' | 'overview' | 'lessons' | 'payments';
  onTabChange: (tab: 'homework' | 'overview' | 'lessons' | 'payments') => void;
  onStartEditPrice: (student: Student) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onOpenBalanceTopup: () => void;
  onOpenStudentModal: () => void;
}

export const StudentHero: FC<StudentHeroProps> = ({
  selectedStudent,
  priceEditState,
  activeTab,
  onTabChange,
  onStartEditPrice,
  onPriceChange,
  onSavePrice,
  onCancelPriceEdit,
  onToggleAutoReminder,
  onAdjustBalance,
  onOpenBalanceTopup,
  onOpenStudentModal,
}) => {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  return (
    <div className={`${styles.card} ${styles.headerCard}`}>
      <div className={styles.heroHeader}>
        <div className={styles.heroNameBlock}>
          <h2 className={styles.profileName}>{selectedStudent.link.customName}</h2>
          <div className={styles.studentMetaRow}>
            <span>Telegram: @{selectedStudent.username || 'нет'}</span>
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
          <div className={styles.balanceRow}>
            <span className={styles.summaryLabel}>Баланс:</span>
            <button
              type="button"
              className={styles.balanceButton}
              onClick={onOpenBalanceTopup}
              title="Нажмите, чтобы пополнить баланс"
              aria-label="Нажмите, чтобы пополнить баланс"
            >
              {selectedStudent.link.balanceLessons}
              {selectedStudent.link.balanceLessons < 0 && (
                <span className={`${styles.lozenge} ${styles.badgeDanger}`}>Долг</span>
              )}
            </button>
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
              {selectedStudent.link.autoRemindHomework ? 'Включены' : 'Выключены'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'homework' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('homework')}
        >
          Домашка
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'lessons' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('lessons')}
        >
          Занятия
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'payments' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('payments')}
        >
          Оплаты
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('overview')}
        >
          Обзор
        </button>
      </div>
    </div>
  );
};
