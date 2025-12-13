import { format, isBefore, parseISO } from 'date-fns';
import { type FC, useEffect, useMemo, useState } from 'react';
import { EditIcon } from '../../icons/MaterialIcons';
import { LinkedStudent, Student } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './StudentsSection.module.css';

interface StudentsSectionProps {
  linkedStudents: LinkedStudent[];
  selectedStudentId: number | null;
  priceEditState: { id: number | null; value: string };
  onSelectStudent: (id: number) => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onStartEditPrice: (student: Student) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onRemindHomework: (studentId: number) => void;
  onAddHomework: () => void;
  onHomeworkDraftChange: (draft: {
    text: string;
    deadline: string;
    status: 'assigned' | 'in_progress' | 'draft';
    sendToTelegram: boolean;
    remindBefore: boolean;
  }) => void;
  onToggleHomework: (homeworkId: number) => void;
  onOpenStudentModal: () => void;
  newHomeworkDraft: {
    text: string;
    deadline: string;
    status: 'assigned' | 'in_progress' | 'draft';
    sendToTelegram: boolean;
    remindBefore: boolean;
  };
}

type HomeworkStatus = 'done' | 'overdue' | 'in_progress' | 'assigned';

const getHomeworkStatus = (homework: LinkedStudent['homeworks'][number]): HomeworkStatus => {
  if (homework.isDone) return 'done';
  if (homework.deadline) {
    const deadlineDate = parseISO(`${homework.deadline}T00:00:00`);
    if (isBefore(deadlineDate, new Date())) {
      return 'overdue';
    }
  }
  return 'in_progress';
};

const getStatusLabel = (status: HomeworkStatus) => {
  if (status === 'done') return 'Выполнено';
  if (status === 'overdue') return 'Просрочено';
  if (status === 'in_progress') return 'В работе';
  return 'Отправлено';
};

export const StudentsSection: FC<StudentsSectionProps> = ({
  linkedStudents,
  selectedStudentId,
  priceEditState,
  onSelectStudent,
  onToggleAutoReminder,
  onAdjustBalance,
  onStartEditPrice,
  onPriceChange,
  onSavePrice,
  onCancelPriceEdit,
  onRemindHomework,
  onAddHomework,
  onHomeworkDraftChange,
  onToggleHomework,
  onOpenStudentModal,
  newHomeworkDraft,
}) => {
  const selectedStudent = linkedStudents.find((s) => s.id === selectedStudentId);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'debt' | 'overdue' | 'autoOff'>('all');
  const [activeTab, setActiveTab] = useState<'homework' | 'overview'>('homework');
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [activeHomeworkId, setActiveHomeworkId] = useState<number | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isPrepaidOpen, setIsPrepaidOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const visibleStudents = useMemo(() => {
    return linkedStudents.filter((student) => {
      const matchesQuery = `${student.link.customName} ${student.username ?? ''}`
        .toLowerCase()
        .includes(debouncedQuery.toLowerCase());

      if (!matchesQuery) return false;

      const hasDebt = student.link.balanceLessons < 0;
      const hasOverdue = student.homeworks.some((hw) => getHomeworkStatus(hw) === 'overdue');
      const autoOff = !student.link.autoRemindHomework;

      if (activeFilter === 'debt') return hasDebt;
      if (activeFilter === 'overdue') return hasOverdue;
      if (activeFilter === 'autoOff') return autoOff;

      return true;
    });
  }, [activeFilter, debouncedQuery, linkedStudents]);

  const counts = useMemo(() => {
    const withDebt = linkedStudents.filter((student) => student.link.balanceLessons < 0).length;
    const overdue = linkedStudents.filter((student) =>
      student.homeworks.some((hw) => getHomeworkStatus(hw) === 'overdue'),
    ).length;
    const autoOff = linkedStudents.filter((student) => !student.link.autoRemindHomework).length;

    return { withDebt, overdue, autoOff };
  }, [linkedStudents]);

  const activeHomework = selectedStudent?.homeworks.find((hw) => hw.id === activeHomeworkId) ?? null;
  const closeHomeworkDrawer = () => setActiveHomeworkId(null);

  const renderStatusPill = (status: HomeworkStatus) => {
    const statusClass =
      status === 'done'
        ? styles.statusDone
        : status === 'overdue'
          ? styles.statusOverdue
          : styles.statusPending;

    return <span className={`${styles.statusPill} ${statusClass}`}>{getStatusLabel(status)}</span>;
  };

  const primaryActionLabel = activeTab === 'homework' ? '+ Новое ДЗ' : 'Напомнить';

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.titleRow}>
                  <h2>Ученики</h2>
                  <span className={styles.counter}>{linkedStudents.length}</span>
                </div>
                <p className={styles.subtitle}>Управляйте списком и карточками</p>
              </div>
              <button className={controls.secondaryButton} onClick={onOpenStudentModal}>
                + Добавить
              </button>
            </div>

            <div className={styles.searchBlock}>
              <input
                className={controls.input}
                placeholder="Поиск ученика..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className={styles.filters}>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'all' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  Все
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'debt' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('debt')}
                >
                  С долгом ({counts.withDebt})
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'overdue' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('overdue')}
                >
                  Просрочено ДЗ ({counts.overdue})
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'autoOff' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('autoOff')}
                >
                  Авто выкл ({counts.autoOff})
                </button>
              </div>
            </div>

            <div className={styles.studentList}>
              {visibleStudents.map((student) => {
                const status = student.link.balanceLessons < 0 ? 'debt' : student.link.balanceLessons > 0 ? 'prepaid' : 'neutral';
                const overdueCount = student.homeworks.filter((hw) => getHomeworkStatus(hw) === 'overdue').length;
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
                        <span className={styles.studentMeta}>авто: {student.link.autoRemindHomework ? 'вкл' : 'выкл'}</span>
                        <span className={`${styles.lozenge} ${styles.badgeMuted}`}>
                          Баланс: {student.link.balanceLessons}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {!visibleStudents.length && (
                <div className={styles.emptyState}>Ничего не найдено</div>
              )}
            </div>
          </div>
        </aside>

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid}>
              <div className={`${styles.card} ${styles.headerCard}`}>
                <div className={styles.heroHeader}>
                  <div className={styles.heroNameBlock}>
                    <h2 className={styles.profileName}>{selectedStudent.link.customName}</h2>
                    <div className={styles.studentMetaRow}>
                      <span>Telegram: @{selectedStudent.username || 'нет'}</span>
                      <span className={styles.metaDivider}>•</span>
                      <span>Напоминания: {selectedStudent.link.autoRemindHomework ? 'Вкл' : 'Выкл'}</span>
                    </div>
                  </div>
                  <div className={styles.heroActions}>
                    <button
                      className={controls.primaryButton}
                      onClick={() => {
                        if (activeTab === 'homework') {
                          setIsHomeworkModalOpen(true);
                          return;
                        }
                        onRemindHomework(selectedStudent.id);
                      }}
                    >
                      {primaryActionLabel}
                    </button>
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
                          <button onClick={() => onRemindHomework(selectedStudent.id)}>Напомнить про ДЗ</button>
                          <button onClick={() => onAdjustBalance(selectedStudent.id, -1)}>Напомнить про оплату</button>
                          <button onClick={() => navigator.clipboard?.writeText('Правила и памятка')}>Скопировать памятку</button>
                          <button className={styles.dangerButton}>Удалить ученика</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.summaryRow}>
                  <div className={styles.summaryItem}>
                    <div className={styles.summaryLabel}>Баланс</div>
                    <div className={styles.summaryValue}>
                      {selectedStudent.link.balanceLessons}
                      {selectedStudent.link.balanceLessons < 0 && (
                        <span className={`${styles.lozenge} ${styles.badgeDanger}`}>Долг</span>
                      )}
                      {selectedStudent.link.balanceLessons > 0 && (
                        <span className={`${styles.lozenge} ${styles.badgeSuccess}`}>Переплата</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.summaryItem}>
                    <button className={styles.summaryButton} onClick={() => setIsPrepaidOpen((prev) => !prev)}>
                      <div className={styles.summaryLabel}>Предоплата</div>
                      <div className={styles.summaryValue}>{selectedStudent.link.balanceLessons} уроков</div>
                    </button>
                    {isPrepaidOpen && (
                      <div className={styles.popover}>
                        <button onClick={() => onAdjustBalance(selectedStudent.id, 1)}>+1 занятие</button>
                        <button
                          onClick={() => onAdjustBalance(selectedStudent.id, -1)}
                          disabled={selectedStudent.link.balanceLessons <= 0}
                        >
                          -1 занятие
                        </button>
                        <button onClick={() => onAdjustBalance(selectedStudent.id, -selectedStudent.link.balanceLessons)}>
                          Сбросить в 0
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.summaryItem}>
                    <div className={styles.summaryLabel}>Цена занятия</div>
                    {priceEditState.id === selectedStudent.id ? (
                      <div className={styles.priceEditor}>
                        <input
                          className={controls.input}
                          type="number"
                          value={priceEditState.value}
                          onChange={(e) => onPriceChange(e.target.value)}
                        />
                        <div className={styles.priceButtons}>
                          <button className={controls.primaryButton} onClick={onSavePrice}>
                            Сохранить
                          </button>
                          <button className={controls.secondaryButton} onClick={onCancelPriceEdit}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.priceValueRow}>
                        <span className={styles.summaryValue}>
                          {selectedStudent.pricePerLesson && selectedStudent.pricePerLesson > 0
                            ? `${selectedStudent.pricePerLesson} ₽`
                            : '—'}
                        </span>
                        <button
                          className={controls.iconButton}
                          aria-label="Изменить цену"
                          onClick={() => onStartEditPrice(selectedStudent)}
                        >
                          <EditIcon width={18} height={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.summaryItem}>
                    <div className={styles.summaryLabel}>Напоминания о ДЗ</div>
                    <div className={styles.toggleRow}>
                      <label className={controls.switch}>
                        <input
                          type="checkbox"
                          checked={selectedStudent.link.autoRemindHomework}
                          onChange={() => onToggleAutoReminder(selectedStudent.id)}
                        />
                        <span className={controls.slider} />
                      </label>
                      <span className={styles.summaryHint}>за 24 часа</span>
                    </div>
                  </div>
                </div>

                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${activeTab === 'homework' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('homework')}
                  >
                    Домашка
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    Обзор
                  </button>
                </div>
              </div>

              {activeTab === 'homework' ? (
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Домашка</div>
                      <div className={styles.subtleLabel}>Статусы, дедлайны и быстрые действия</div>
                    </div>
                    <button className={controls.primaryButton} onClick={() => setIsHomeworkModalOpen(true)}>
                      + Новое ДЗ
                    </button>
                  </div>

                  <div className={styles.homeworkList}>
                    {selectedStudent.homeworks.map((hw) => {
                      const status = getHomeworkStatus(hw);
                      return (
                        <div
                          key={hw.id}
                          className={styles.homeworkItem}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveHomeworkId(hw.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setActiveHomeworkId(hw.id);
                            }
                          }}
                          aria-pressed={activeHomeworkId === hw.id}
                        >
                          <div className={styles.homeworkContent}>
                            <div className={styles.homeworkText}>{hw.text}</div>
                            <div className={styles.homeworkMeta}>
                              {hw.deadline
                                ? `Дедлайн: ${format(parseISO(`${hw.deadline}T00:00:00`), 'd MMM')}`
                                : 'Без дедлайна'}
                              <span className={styles.metaDivider}>•</span>
                              Статус: {getStatusLabel(status)}
                            </div>
                          </div>
                          <div className={styles.homeworkActions}>
                            {renderStatusPill(status)}
                            <div className={styles.iconActions}>
                              <button
                                className={controls.iconButton}
                                aria-label="Отметить выполненным"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleHomework(hw.id);
                                }}
                              >
                                ✓
                              </button>
                              <button
                                className={controls.iconButton}
                                aria-label="Напомнить"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemindHomework(selectedStudent.id);
                                }}
                              >
                                🔔
                              </button>
                              <button
                                className={controls.iconButton}
                                aria-label="Редактировать"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveHomeworkId(hw.id);
                                }}
                              >
                                ✏️
                              </button>
                              <button className={controls.iconButton} aria-label="Ещё">⋯</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {!selectedStudent.homeworks.length && (
                      <div className={styles.emptyState}>Пока нет ДЗ — создайте первое</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.card}>
                  <div className={styles.homeworkHeader}>
                    <div>
                      <div className={styles.priceLabel}>Обзор</div>
                      <div className={styles.subtleLabel}>Короткая сводка по ученику</div>
                    </div>
                    <button className={controls.secondaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
                      Напомнить про ДЗ
                    </button>
                  </div>
                  <div className={styles.overviewGrid}>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Баланс</p>
                      <p className={styles.statValueLarge}>{selectedStudent.link.balanceLessons} уроков</p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>ДЗ</p>
                      <p className={styles.statValueLarge}>
                        {selectedStudent.homeworks.filter((hw) => !hw.isDone).length} в работе
                      </p>
                    </div>
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Напоминания</p>
                      <p className={styles.statValueLarge}>
                        {selectedStudent.link.autoRemindHomework ? 'Включены' : 'Выключены'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>

      {activeHomework && (
        <>
          <button className={styles.drawerScrim} aria-label="Закрыть карточку ДЗ" onClick={closeHomeworkDrawer} />
          <aside className={`${styles.homeworkDrawer} ${styles.drawerOpen}`} aria-live="polite">
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.drawerEyebrow}>Домашнее задание</p>
                <div className={styles.drawerTitle}>{selectedStudent?.link.customName}</div>
              </div>
              <button className={controls.iconButton} aria-label="Закрыть" onClick={closeHomeworkDrawer}>
                ✕
              </button>
            </div>

            <div className={styles.drawerBadgeRow}>
              <span className={`${styles.drawerBadge} ${activeHomework.isDone ? styles.badgeSuccess : styles.badgeWarning}`}>
                {activeHomework.isDone ? 'выполнено' : 'в работе'}
              </span>
              <span className={styles.drawerBadge}>
                {activeHomework.deadline
                  ? `Дедлайн: ${format(new Date(activeHomework.deadline), 'd MMM', { locale: undefined })}`
                  : 'Без дедлайна'}
              </span>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.drawerTextBlock}>
                <p className={styles.priceLabel}>Описание</p>
                <p className={styles.drawerText}>{activeHomework.text}</p>
              </div>

              <div className={styles.drawerDetailsGrid}>
                <div className={styles.drawerDetail}>Учитель: вы</div>
                <div className={styles.drawerDetail}>Студент: @{selectedStudent?.username || 'нет'}</div>
                <div className={styles.drawerDetail}>Баланс: {selectedStudent?.link.balanceLessons} уроков</div>
                <div className={styles.drawerDetail}>
                  Напоминания: {selectedStudent?.link.autoRemindHomework ? 'включены' : 'выключены'}
                </div>
              </div>

              <div className={styles.drawerActions}>
                <button
                  className={`${controls.primaryButton} ${styles.drawerActionButton}`}
                  onClick={() => {
                    onToggleHomework(activeHomework.id);
                    setActiveHomeworkId(activeHomework.id);
                  }}
                >
                  {activeHomework.isDone ? 'Вернуть в работу' : 'Отметить выполненным'}
                </button>
                <button
                  className={`${controls.secondaryButton} ${styles.drawerActionButton}`}
                  onClick={() => selectedStudent && onRemindHomework(selectedStudent.id)}
                >
                  Отправить напоминание
                </button>
              </div>

              <div className={styles.drawerHelper}>
                <div>
                  <p className={styles.drawerHelperTitle}>Совет</p>
                  <p className={styles.drawerHelperText}>
                    Скопируйте текст задания и отправьте его ученику сразу после урока.
                  </p>
                </div>
                <button className={controls.smallButton} onClick={() => navigator.clipboard?.writeText(activeHomework.text)}>
                  Скопировать текст
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {isHomeworkModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.priceLabel}>Новое задание</div>
                <div className={styles.subtleLabel}>Создайте карточку и отправьте ученику</div>
              </div>
              <button className={controls.iconButton} aria-label="Закрыть" onClick={() => setIsHomeworkModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.inputLabel}>
                Текст задания
                <textarea
                  className={controls.input}
                  placeholder="Например: Разобрать тему 3 и сделать 10 задач"
                  value={newHomeworkDraft.text}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, text: e.target.value })}
                />
              </label>
              <label className={styles.inputLabel}>
                Дедлайн
                <input
                  className={controls.input}
                  type="date"
                  value={newHomeworkDraft.deadline}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, deadline: e.target.value })}
                />
              </label>
              <label className={styles.inputLabel}>
                Статус
                <select
                  className={controls.input}
                  value={newHomeworkDraft.status}
                  onChange={(e) =>
                    onHomeworkDraftChange({ ...newHomeworkDraft, status: e.target.value as StudentsSectionProps['newHomeworkDraft']['status'] })
                  }
                >
                  <option value="assigned">Отправлено</option>
                  <option value="in_progress">В работе</option>
                  <option value="draft">Черновик</option>
                </select>
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newHomeworkDraft.sendToTelegram}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, sendToTelegram: e.target.checked })}
                />
                <span>Отправить ученику в Telegram сразу</span>
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newHomeworkDraft.remindBefore}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, remindBefore: e.target.checked })}
                />
                <span>Включить напоминание за 24 часа</span>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button className={controls.secondaryButton} onClick={() => setIsHomeworkModalOpen(false)}>
                Отмена
              </button>
              <button
                className={controls.primaryButton}
                onClick={() => {
                  onAddHomework();
                  if (newHomeworkDraft.text.trim()) {
                    setIsHomeworkModalOpen(false);
                  }
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
