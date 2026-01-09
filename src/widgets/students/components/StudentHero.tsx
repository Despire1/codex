import { type FC, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Lesson, Student, StudentDebtItem, TeacherStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import {
  DeleteOutlineIcon,
  EditOutlinedIcon,
  NotificationsNoneOutlinedIcon,
} from '../../../icons/MaterialIcons';
import styles from '../StudentsSection.module.css';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { StudentDebtPopoverContent } from './StudentDebtPopoverContent';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';

interface StudentHeroProps {
  headerRef?: Ref<HTMLDivElement>;
  selectedStudent: Student & { link: TeacherStudent };
  studentLessonsSummary: Lesson[];
  studentDebtItems: StudentDebtItem[];
  studentDebtTotal: number;
  priceEditState: { id: number | null; value: string };
  activeTab: 'homework' | 'overview' | 'lessons' | 'payments';
  isMobile: boolean;
  onBackToList: () => void;
  onTabChange: (tab: 'homework' | 'overview' | 'lessons' | 'payments') => void;
  onStartEditPrice: (student: Student & { link: TeacherStudent }) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onOpenBalanceTopup: () => void;
  onEditStudent: () => void;
  onRequestDeleteStudent: (studentId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void | Promise<void>;
}

export const StudentHero: FC<StudentHeroProps> = ({
  headerRef,
  selectedStudent,
  studentLessonsSummary,
  studentDebtItems,
  studentDebtTotal,
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
  onEditStudent,
  onRequestDeleteStudent,
  onTogglePaid,
}) => {
  const timeZone = useTimeZone();
  const todayZoned = toZonedDate(new Date(), timeZone);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isReminderSettingsOpen, setIsReminderSettingsOpen] = useState(false);
  const [isDebtPopoverOpen, setIsDebtPopoverOpen] = useState(false);
  const [pendingPaymentIds, setPendingPaymentIds] = useState<number[]>([]);
  const [shouldAutoCloseDebt, setShouldAutoCloseDebt] = useState(false);
  const previousDebtTotal = useRef<number>(0);
  const telegramUsername = selectedStudent.username?.trim();
  const showActivationBadge = Boolean(telegramUsername) && selectedStudent.isActivated === false;
  const activationHint =
    'Ученик ещё не активирован. Нужно, чтобы он нажал кнопку Start в Telegram-боте — тогда появится в системе и будет получать уведомления.';
  const handleMenuAction = (action: () => void) => {
    setIsActionsMenuOpen(false);
    action();
  };
  const handleTelegramConfirm = () => {
    if (!telegramUsername) return;
    setIsTelegramModalOpen(false);
    window.location.href = `tg://resolve?domain=${telegramUsername}`;
  };

  const nextLessonInfo = useMemo(() => {
    const now = new Date();
    const nextLesson = studentLessonsSummary
      .filter((lesson) => {
        if (lesson.status === 'CANCELED') return false;
        const lessonDate = new Date(lesson.startAt);
        return lessonDate > now;
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

    if (!nextLesson) {
      return {
        label: 'не запланирован',
        variant: 'empty' as const,
      };
    }

    const lessonDate = toZonedDate(nextLesson.startAt, timeZone);
    const timeLabel = format(lessonDate, 'HH:mm', { locale: ru });

    if (isSameDay(lessonDate, todayZoned)) {
      return {
        label: `Сегодня, ${timeLabel}`,
        variant: 'badge' as const,
      };
    }

    if (isSameDay(lessonDate, addDays(todayZoned, 1))) {
      return {
        label: `Завтра, ${timeLabel}`,
        variant: 'badge' as const,
      };
    }

    return {
      label: formatInTimeZone(nextLesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone }),
      variant: 'text' as const,
    };
  }, [studentLessonsSummary, timeZone, todayZoned]);

  const renderNextLessonValue = () => {
    if (nextLessonInfo.variant === 'empty') {
      return <span className={styles.summaryValueText}>{nextLessonInfo.label}</span>;
    }

    if (nextLessonInfo.variant === 'badge') {
      return (
        <button
          type="button"
          className={styles.summaryInfoBadge}
          onClick={() => onTabChange('lessons')}
        >
          {nextLessonInfo.label}
        </button>
      );
    }

    return (
      <button
        type="button"
        className={styles.summaryValueButton}
        onClick={() => onTabChange('lessons')}
      >
        {nextLessonInfo.label}
      </button>
    );
  };

  useEffect(() => {
    if (shouldAutoCloseDebt && previousDebtTotal.current > 0 && studentDebtTotal === 0) {
      setIsDebtPopoverOpen(false);
      setShouldAutoCloseDebt(false);
    } else if (shouldAutoCloseDebt && studentDebtTotal > 0 && pendingPaymentIds.length === 0) {
      setShouldAutoCloseDebt(false);
    }
    previousDebtTotal.current = studentDebtTotal;
  }, [pendingPaymentIds.length, shouldAutoCloseDebt, studentDebtTotal]);

  const handleMarkPaid = async (lessonId: number) => {
    if (pendingPaymentIds.includes(lessonId)) return;
    setPendingPaymentIds((prev) => [...prev, lessonId]);
    setShouldAutoCloseDebt(true);
    try {
      await onTogglePaid(lessonId, selectedStudent.id);
    } finally {
      setPendingPaymentIds((prev) => prev.filter((id) => id !== lessonId));
    }
  };

  const handleOpenReminderSettings = () => {
    setIsReminderSettingsOpen(true);
  };

  const handleToggleReminderSettings = () => {
    onToggleAutoReminder(selectedStudent.id);
    setIsReminderSettingsOpen(false);
  };

  const hasDebt = studentDebtItems.length > 0;
  const debtCount = studentDebtItems.length;
  const formatLessonCount = (count: number) => {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return `${count} занятий`;
    if (last === 1) return `${count} занятие`;
    if (last >= 2 && last <= 4) return `${count} занятия`;
    return `${count} занятий`;
  };
  const debtLabel = `${studentDebtTotal} ₽ (${formatLessonCount(debtCount)})`;
  const reminderStatusLabel = selectedStudent.link.autoRemindHomework ? 'Включены' : 'Выключены';
  const reminderActionLabel = selectedStudent.link.autoRemindHomework ? 'Выключить' : 'Включить';

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
              <span>Telegram:</span>
              {telegramUsername ? (
                <button
                  type="button"
                  className={`${styles.studentMeta} ${styles.studentUsernameLink} ${styles.studentUsernameButton}`}
                  onClick={() => setIsTelegramModalOpen(true)}
                >
                  @{telegramUsername}
                </button>
              ) : (
                <span className={styles.studentMeta}>@нет</span>
              )}
              {showActivationBadge && (
                <span
                  className={`${styles.lozenge} ${styles.badgeInactive}`}
                  title={activationHint}
                >
                  Не активирован
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.heroActions}>
          {!selectedStudent.link.autoRemindHomework && (
            <button
              type="button"
              className={styles.remindersBadge}
              onClick={handleOpenReminderSettings}
            >
              Напоминания выкл.
            </button>
          )}
          {isMobile ? (
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
                <button onClick={() => handleMenuAction(onEditStudent)}>Редактировать ученика</button>
                <button onClick={() => handleMenuAction(handleOpenReminderSettings)}>Напоминания</button>
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
          ) : (
            <div className={styles.actionsInline}>
              <button
                type="button"
                className={controls.iconButton}
                aria-label="Редактировать ученика"
                onClick={onEditStudent}
              >
                <EditOutlinedIcon className={styles.actionIcon} />
              </button>
              <button
                type="button"
                className={controls.iconButton}
                aria-label="Настроить напоминания"
                onClick={handleOpenReminderSettings}
              >
                <NotificationsNoneOutlinedIcon className={styles.actionIcon} />
              </button>
              <button
                type="button"
                className={controls.iconButton}
                aria-label="Удалить ученика"
                onClick={() => onRequestDeleteStudent(selectedStudent.id)}
              >
                <DeleteOutlineIcon className={styles.actionIcon} />
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={isTelegramModalOpen}
        title="Открыть Telegram?"
        onClose={() => setIsTelegramModalOpen(false)}
      >
        <p className={styles.telegramModalText}>
          Мы откроем чат с учеником @{telegramUsername}. Продолжить?
        </p>
        <div className={styles.telegramModalActions}>
          <button type="button" className={controls.secondaryButton} onClick={() => setIsTelegramModalOpen(false)}>
            Отмена
          </button>
          <button type="button" className={controls.primaryButton} onClick={handleTelegramConfirm}>
            Открыть чат
          </button>
        </div>
      </Modal>

      <div className={`${styles.summaryRow} ${styles.summaryInline}`}>
        {!isMobile && (
          <div className={styles.summaryDesktopLine}>
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
                    {selectedStudent.link.pricePerLesson && selectedStudent.link.pricePerLesson > 0
                      ? `${selectedStudent.link.pricePerLesson} ₽`
                      : 'Не задана'}
                  </span>
                  <EditOutlinedIcon width={16} height={16} />
                </button>
              )}
            </div>
            <span className={styles.summaryDivider}>|</span>
            {hasDebt && (
              <>
                <div className={styles.summaryItemLine}>
                  <span className={styles.summaryLabel}>Не оплачено:</span>
                  <AdaptivePopover
                    isOpen={isDebtPopoverOpen}
                    onClose={() => setIsDebtPopoverOpen(false)}
                    trigger={(
                      <button
                        type="button"
                        className={styles.summaryDebtBadge}
                        onClick={() => setIsDebtPopoverOpen((prev) => !prev)}
                      >
                        {debtLabel}
                      </button>
                    )}
                    side="bottom"
                    align="start"
                    offset={6}
                    className={styles.debtPopover}
                  >
                    <StudentDebtPopoverContent
                      items={studentDebtItems}
                      pendingIds={pendingPaymentIds}
                      onMarkPaid={handleMarkPaid}
                    />
                  </AdaptivePopover>
                </div>
                <span className={styles.summaryDivider}>|</span>
              </>
            )}
            <div className={styles.summaryItemLine}>
              <span className={styles.summaryLabel}>Следующий урок:</span>
              {renderNextLessonValue()}
            </div>
          </div>
        )}
        {isMobile && (
          <div className={styles.summaryMobileStack}>
            <div className={styles.summaryMobileRow}>
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
                      {selectedStudent.link.pricePerLesson && selectedStudent.link.pricePerLesson > 0
                        ? `${selectedStudent.link.pricePerLesson} ₽`
                        : 'Не задана'}
                    </span>
                    <EditOutlinedIcon width={16} height={16} />
                  </button>
                )}
              </div>
            </div>
            {hasDebt && (
              <div className={styles.summaryMobileRow}>
                <span className={styles.summaryLabel}>Не оплачено:</span>
                <button
                  type="button"
                  className={styles.summaryDebtBadge}
                  onClick={() => setIsDebtPopoverOpen(true)}
                >
                  {debtLabel}
                </button>
              </div>
            )}
            <div className={styles.summaryMobileRow}>
              <span className={styles.summaryLabel}>Следующий урок:</span>
              {renderNextLessonValue()}
            </div>
          </div>
        )}
      </div>

      {!isMobile && (
        <Modal
          open={isReminderSettingsOpen}
          title="Напоминания"
          onClose={() => setIsReminderSettingsOpen(false)}
        >
          <p className={styles.reminderStatus}>
            Автонапоминания: {reminderStatusLabel}
          </p>
          <div className={styles.reminderActions}>
            <button type="button" className={controls.secondaryButton} onClick={() => setIsReminderSettingsOpen(false)}>
              Закрыть
            </button>
            <button type="button" className={controls.primaryButton} onClick={handleToggleReminderSettings}>
              {reminderActionLabel}
            </button>
          </div>
        </Modal>
      )}

      {isMobile && (
        <BottomSheet isOpen={isReminderSettingsOpen} onClose={() => setIsReminderSettingsOpen(false)}>
          <div className={styles.reminderSheet}>
            <h3 className={styles.reminderTitle}>Напоминания</h3>
            <p className={styles.reminderStatus}>
              Автонапоминания: {reminderStatusLabel}
            </p>
            <div className={styles.reminderActions}>
              <button type="button" className={controls.secondaryButton} onClick={() => setIsReminderSettingsOpen(false)}>
                Закрыть
              </button>
              <button type="button" className={controls.primaryButton} onClick={handleToggleReminderSettings}>
                {reminderActionLabel}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {isMobile && (
        <BottomSheet isOpen={isDebtPopoverOpen} onClose={() => setIsDebtPopoverOpen(false)}>
          <StudentDebtPopoverContent
            items={studentDebtItems}
            pendingIds={pendingPaymentIds}
            onMarkPaid={handleMarkPaid}
            showCloseButton
            onClose={() => setIsDebtPopoverOpen(false)}
          />
        </BottomSheet>
      )}

      {!isMobile && (
        <Modal
          open={isReminderSettingsOpen}
          title="Напоминания"
          onClose={() => setIsReminderSettingsOpen(false)}
        >
          <p className={styles.reminderStatus}>
            Автонапоминания: {reminderStatusLabel}
          </p>
          <div className={styles.reminderActions}>
            <button type="button" className={controls.secondaryButton} onClick={() => setIsReminderSettingsOpen(false)}>
              Закрыть
            </button>
            <button type="button" className={controls.primaryButton} onClick={handleToggleReminderSettings}>
              {reminderActionLabel}
            </button>
          </div>
        </Modal>
      )}

      {isMobile && (
        <BottomSheet isOpen={isReminderSettingsOpen} onClose={() => setIsReminderSettingsOpen(false)}>
          <div className={styles.reminderSheet}>
            <h3 className={styles.reminderTitle}>Напоминания</h3>
            <p className={styles.reminderStatus}>
              Автонапоминания: {reminderStatusLabel}
            </p>
            <div className={styles.reminderActions}>
              <button type="button" className={controls.secondaryButton} onClick={() => setIsReminderSettingsOpen(false)}>
                Закрыть
              </button>
              <button type="button" className={controls.primaryButton} onClick={handleToggleReminderSettings}>
                {reminderActionLabel}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {isMobile && (
        <BottomSheet isOpen={isDebtPopoverOpen} onClose={() => setIsDebtPopoverOpen(false)}>
          <StudentDebtPopoverContent
            items={studentDebtItems}
            pendingIds={pendingPaymentIds}
            onMarkPaid={handleMarkPaid}
            showCloseButton
            onClose={() => setIsDebtPopoverOpen(false)}
          />
        </BottomSheet>
      )}

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
