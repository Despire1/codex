import { format } from 'date-fns';
import { type FC, useMemo, useState } from 'react';
import { EditIcon } from '../../icons/MaterialIcons';
import { LinkedStudent, Student } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './StudentsSection.module.css';
import { DatePickerField } from '../../shared/ui/DatePickerField';

interface StudentsSectionProps {
  linkedStudents: LinkedStudent[];
  selectedStudentId: number | null;
  priceEditState: { id: number | null; value: string };
  newHomeworkDraft: { text: string; deadline: string };
  onSelectStudent: (id: number) => void;
  onToggleAutoReminder: (studentId: number) => void;
  onAdjustBalance: (studentId: number, delta: number) => void;
  onStartEditPrice: (student: Student) => void;
  onPriceChange: (value: string) => void;
  onSavePrice: () => void;
  onCancelPriceEdit: () => void;
  onRemindHomework: (studentId: number) => void;
  onAddHomework: () => void;
  onHomeworkDraftChange: (draft: { text: string; deadline: string }) => void;
  onToggleHomework: (homeworkId: number) => void;
  onOpenStudentModal: () => void;
}

export const StudentsSection: FC<StudentsSectionProps> = ({
  linkedStudents,
  selectedStudentId,
  priceEditState,
  newHomeworkDraft,
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
}) => {
  const selectedStudent = linkedStudents.find((s) => s.id === selectedStudentId);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pendingHomework' | 'noReminder'>('all');

  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return linkedStudents.filter((student) => {
      const matchesQuery =
        !normalizedQuery ||
        student.link.customName.toLowerCase().includes(normalizedQuery) ||
        (student.username ?? '').toLowerCase().includes(normalizedQuery);

      if (!matchesQuery) return false;

      const hasPendingHomework = student.homeworks.some((hw) => !hw.isDone);
      const remindersDisabled = !student.link.autoRemindHomework;

      if (activeFilter === 'pendingHomework') return hasPendingHomework;
      if (activeFilter === 'noReminder') return remindersDisabled;
      return true;
    });
  }, [activeFilter, linkedStudents, searchQuery]);

  const renderHomeworkStatus = (student: LinkedStudent) => {
    const hasPending = student.homeworks.some((hw) => !hw.isDone);
    if (hasPending) return <span className={styles.badgeWarning}>Долг ДЗ</span>;
    if (!student.homeworks.length) return <span className={styles.badgeMuted}>Нет ДЗ</span>;
    return <span className={styles.badgeSuccess}>ДЗ выполнено</span>;
  };

  return (
    <section className={styles.section}>
      <div className={styles.grid}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.headerRow}>
              <div>
                <div className={styles.titleRow}>
                  <h2>Ученики</h2>
                  <span className={styles.counter}>{linkedStudents.length}</span>
                </div>
                <p className={styles.subtitle}>Просматривайте списки и редактируйте карточки</p>
              </div>
              <button className={controls.primaryGhost} onClick={onOpenStudentModal}>
                + Добавить ученика
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
                  className={`${styles.filterChip} ${activeFilter === 'pendingHomework' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('pendingHomework')}
                >
                  Долг ДЗ
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'noReminder' ? styles.activeChip : ''}`}
                  onClick={() => setActiveFilter('noReminder')}
                >
                  Без напоминаний
                </button>
              </div>
            </div>

            <div className={styles.studentList}>
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  className={`${styles.studentCard} ${selectedStudentId === student.id ? styles.activeStudent : ''}`}
                  onClick={() => onSelectStudent(student.id)}
                >
                  <div className={styles.studentCardHeader}>
                    <div>
                      <div className={styles.studentName}>{student.link.customName}</div>
                      <div className={styles.studentMeta}>@{student.username || 'нет'} </div>
                    </div>
                    <div className={styles.balanceBadge}>Баланс: {student.link.balanceLessons}</div>
                  </div>
                  <div className={styles.studentFooter}>
                    <span className={styles.reminderLabel}>
                      Напоминания {student.link.autoRemindHomework ? 'включены' : 'выключены'}
                    </span>
                    {renderHomeworkStatus(student)}
                  </div>
                </button>
              ))}
              {!filteredStudents.length && (
                <div className={styles.emptyState}>Не найдено учеников по вашему запросу</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid}>
              <div className={`${styles.card} ${styles.heroCard}`}>
                <div className={styles.heroHeader}>
                  <div>
                    <div className={styles.profileName}>{selectedStudent.link.customName}</div>
                    <div className={styles.studentMeta}>Telegram: @{selectedStudent.username || 'нет'}</div>
                  </div>
                  <div className={styles.heroActions}>
                    <button className={controls.secondaryButton} onClick={onOpenStudentModal}>
                      Редактировать
                    </button>
                    <button className={controls.primaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
                      Напомнить о ДЗ
                    </button>
                  </div>
                </div>
                <p className={styles.helperText}>Включите автопамятку о ДЗ с максимальной суммой, и держите постоянно на экране.</p>
              </div>

              <div className={styles.splitColumns}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.priceLabel}>Домашние задания</div>
                      <div className={styles.subtleLabel}>Вижу дедлайн и статус выполнения</div>
                    </div>
                    <label className={styles.inlineToggle}>
                      <span>Напоминать о ДЗ</span>
                      <label className={controls.switch}>
                        <input
                          type="checkbox"
                          checked={selectedStudent.link.autoRemindHomework}
                          onChange={() => onToggleAutoReminder(selectedStudent.id)}
                        />
                        <span className={controls.slider} />
                      </label>
                    </label>
                  </div>

                  <div className={styles.homeworkList}>
                    {selectedStudent.homeworks.map((hw) => (
                      <div key={hw.id} className={styles.homeworkItem}>
                        <div className={styles.homeworkContent}>
                          <div className={styles.homeworkText}>{hw.text}</div>
                          {hw.deadline && (
                            <div className={styles.homeworkMeta}>
                              Дедлайн: {format(new Date(hw.deadline), 'd MMM', { locale: undefined })}
                            </div>
                          )}
                          <div className={styles.statusPill} data-state={hw.isDone ? 'done' : 'pending'}>
                            {hw.isDone ? 'Готово' : 'В работе'}
                          </div>
                        </div>
                        <button className={controls.smallButton} onClick={() => onToggleHomework(hw.id)}>
                          {hw.isDone ? 'Не готово' : 'Отметить готово'}
                        </button>
                      </div>
                    ))}
                    {!selectedStudent.homeworks.length && (
                      <div className={styles.emptyState}>Пока нет заданий для этого ученика</div>
                    )}
                  </div>

                  <div className={styles.formCard}>
                    <div className={styles.priceLabel}>Новое задание</div>
                    <div className={controls.formRow}>
                      <input
                        className={controls.input}
                        placeholder="Текст домашнего задания"
                        value={newHomeworkDraft.text}
                        onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, text: e.target.value })}
                      />
                      <DatePickerField
                        label="Дедлайн"
                        value={newHomeworkDraft.deadline}
                        onChange={(nextDate) => onHomeworkDraftChange({ ...newHomeworkDraft, deadline: nextDate ?? '' })}
                        allowClear
                      />
                    </div>
                    <button className={controls.primaryButton} onClick={onAddHomework}>
                      Добавить
                    </button>
                  </div>
                </div>

                <div className={styles.stack}>
                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.priceLabel}>Стоимость занятий</div>
                        <div className={styles.subtleLabel}>Редактируйте цену и предоплаченные уроки</div>
                      </div>
                    </div>
                    <div className={styles.priceRow}>
                      <div className={styles.priceLabel}>Цена за занятие</div>
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
                          <span className={styles.priceValue}>
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
                    <div className={styles.balanceRow}>
                      <div>
                        <div className={styles.balanceLabel}>Предоплаченные уроки</div>
                        <div className={styles.balanceCount}>{selectedStudent.link.balanceLessons} урока</div>
                      </div>
                      <div className={styles.balanceActions}>
                        <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, 1)}>
                          +1
                        </button>
                        <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, -1)}>
                          -1
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.priceLabel}>Дедлайны</div>
                        <div className={styles.subtleLabel}>Контролируйте сроки выполнения</div>
                      </div>
                    </div>
                    <div className={styles.deadlineList}>
                      {selectedStudent.homeworks.filter((hw) => hw.deadline).length ? (
                        selectedStudent.homeworks
                          .filter((hw) => hw.deadline)
                          .map((hw) => (
                            <div key={hw.id} className={styles.deadlineItem}>
                              <div>
                                <div className={styles.deadlineTitle}>{hw.text}</div>
                                <div className={styles.deadlineMeta}>
                                  {format(new Date(hw.deadline as string), 'd MMM', { locale: undefined })}
                                </div>
                              </div>
                              <div className={styles.statusPill} data-state={hw.isDone ? 'done' : 'pending'}>
                                {hw.isDone ? 'Готово' : 'В работе'}
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className={styles.emptyState}>Дедлайнов пока нет</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>
    </section>
  );
};
