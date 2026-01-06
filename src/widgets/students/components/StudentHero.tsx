import { type FC, type Ref, useState } from 'react';
import { Student, TeacherStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import {
  EditOutlinedIcon,
} from '../../../icons/MaterialIcons';
import styles from '../StudentsSection.module.css';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';

interface StudentHeroProps {
  headerRef?: Ref<HTMLDivElement>;
  selectedStudent: Student & { link: TeacherStudent };
  priceEditState: { id: number | null; value: string };
  activeTab: 'homework' | 'overview' | 'lessons' | 'payments';
  isMobile: boolean;
  onBackToList: () => void;
  onTabChange: (tab: 'homework' | 'overview' | 'lessons' | 'payments') => void;
  onStartEditPrice: (student: Student) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onOpenBalanceTopup: () => void;
  onOpenStudentModal: () => void;
  onRequestDeleteStudent: (studentId: number) => void;
}

export const StudentHero: FC<StudentHeroProps> = ({
  headerRef,
  selectedStudent,
  priceEditState,
  activeTab,
  isMobile,
  onBackToList,
  onTabChange,
  onStartEditPrice,
  onPriceChange,
  onSavePrice,
  onCancelPriceEdit,
  onToggleAutoReminder,
  onAdjustBalance,
  onOpenBalanceTopup,
  onOpenStudentModal,
  onRequestDeleteStudent,
}) => {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const handleMenuAction = (action: () => void) => {
    setIsActionsMenuOpen(false);
    action();
  };

  return (
    <div
      ref={headerRef}
      className={`${styles.card} ${styles.headerCard} ${isMobile ? styles.mobileHeaderCard : ''}`}
    >
      <div className={styles.heroHeader}>
        <div className={styles.heroNameBlock}>
          {isMobile && (
            <button
              className={styles.backIconButton}
              type="button"
              aria-label="Назад"
              onClick={onBackToList}
            >
              ←
            </button>
          )}
          <div className={styles.heroTitleStack}>
            <h2 className={styles.profileName}>{selectedStudent.link.customName}</h2>
            <div className={styles.studentMetaRow}>
              <span>Telegram: @{selectedStudent.username || 'нет'}</span>
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.actionsMenuWrapper}>
            <AdaptivePopover
              isOpen={isActionsMenuOpen}
              onClose={() => setIsActionsMenuOpen(false)}
              trigger={
                <button
                  className={controls.iconButton}
                  aria-label="Дополнительные действия"
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                >
                  ⋯
                </button>
              }
              side="bottom"
              align="end"
              offset={6}
              className={styles.actionsMenu}
            >
              <button onClick={() => handleMenuAction(onOpenStudentModal)}>Редактировать ученика</button>
              <button onClick={() => handleMenuAction(() => onAdjustBalance(selectedStudent.id, -1))}>
                Напомнить про оплату
              </button>
              <button onClick={() => handleMenuAction(() => navigator.clipboard?.writeText('Правила и памятка'))}>
                Скопировать памятку
              </button>
              <button
                className={styles.dangerButton}
                onClick={() => handleMenuAction(() => onRequestDeleteStudent(selectedStudent.id))}
              >
                Удалить ученика
              </button>
            </AdaptivePopover>
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
        {/*
        <button
          className={`${styles.tab} ${activeTab === 'homework' ? styles.tabActive : ''}`}
          onClick={() => onTabChange('homework')}
        >
          Домашка
        </button>
        */}
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
