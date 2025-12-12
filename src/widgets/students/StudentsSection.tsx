import { format } from 'date-fns';
import { type FC, useEffect, useState } from 'react';
import { EditIcon } from '../../icons/MaterialIcons';
import { LinkedStudent, Student } from '../../entities/types';
import { api } from '../../shared/api/client';
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
  onHomeworkDraftChange: (draft: { text: string; deadline: string }) => void;
  onToggleHomework: (homeworkId: number) => void;
  onOpenStudentModal: () => void;
  newHomeworkDraft: { text: string; deadline: string };
}

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
  const [activeFilter, setActiveFilter] = useState<'all' | 'pendingHomework' | 'noReminder'>('all');
  const [isHomeworkModalOpen, setIsHomeworkModalOpen] = useState(false);
  const [visibleStudents, setVisibleStudents] = useState<LinkedStudent[]>(linkedStudents);

  useEffect(() => {
    let cancelled = false;

    const fetchFiltered = async () => {
      try {
        const { students, links, homeworks } = await api.searchStudents({ query: searchQuery, filter: activeFilter });
        if (cancelled) return;

        const mapped = links
          .map((link) => {
            const student = students.find((s) => s.id === link.studentId);
            if (!student) return null;
            return {
              ...student,
              link,
              homeworks: homeworks.filter((hw) => hw.studentId === link.studentId),
            } as LinkedStudent;
          })
          .filter(Boolean) as LinkedStudent[];

        setVisibleStudents(mapped);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to search students', error);
        if (!cancelled) {
          setVisibleStudents(linkedStudents);
        }
      }
    };

    fetchFiltered();

    return () => {
      cancelled = true;
    };
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
              {visibleStudents.map((student) => (
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
              {!visibleStudents.length && (
                <div className={styles.emptyState}>Не найдено учеников по вашему запросу</div>
              )}
            </div>

            <div className={styles.addStudentFooter}>
              <button className={`${controls.primaryButton} ${styles.addStudentButton}`} onClick={onOpenStudentModal}>
                + Добавить ученика
              </button>
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {selectedStudent ? (
            <div className={styles.contentGrid}>
              <div className={`${styles.card} ${styles.heroCard}`}>
                <div className={styles.heroHeader}>
                  <div className={styles.heroNameBlock}>
                    <div className={styles.profileName}>{selectedStudent.link.customName}</div>
                    <div className={styles.studentMeta}>Telegram: @{selectedStudent.username || 'нет'}</div>
                    <div className={styles.inlineTags}>
                      <span className={styles.infoChip}>Баланс: {selectedStudent.link.balanceLessons} уроков</span>
                      <span className={styles.infoChip}>
                        Автопамятка {selectedStudent.link.autoRemindHomework ? 'включена' : 'выключена'}
                      </span>
                      <span className={styles.infoChip}>
                        Цена занятия:
                        {selectedStudent.pricePerLesson && selectedStudent.pricePerLesson > 0
                          ? ` ${selectedStudent.pricePerLesson} ₽`
                          : ' —'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.heroActions}>
                    <button className={controls.secondaryButton} onClick={onOpenStudentModal}>
                      Редактировать
                    </button>
                    <button className={controls.primaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
                      Напомнить про ДЗ
                    </button>
                  </div>
                </div>

                <div className={styles.quickActions}>
                  <div className={styles.statBlock}>
                    <div className={styles.statLabel}>Предоплаченные уроки</div>
                    <div className={styles.statValue}>{selectedStudent.link.balanceLessons} уроков</div>
                    <div className={styles.balanceActions}>
                      <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, 1)}>
                        +1
                      </button>
                      <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, -1)}>
                        -1
                      </button>
                    </div>
                  </div>
                  <div className={styles.statBlock}>
                    <div className={styles.statLabel}>Цена за занятие</div>
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
                    ))}
                    {!selectedStudent.homeworks.length && (
                      <div className={styles.emptyState}>Пока нет заданий для этого ученика</div>
                    )}
                  </div>
                  <div className={styles.statBlock}>
                    <div className={styles.statLabel}>Автопамятка о ДЗ</div>
                    <div className={styles.toggleRow}>
                      <span>{selectedStudent.link.autoRemindHomework ? 'Включена' : 'Выключена'}</span>
                      <label className={controls.switch}>
                        <input
                          type="checkbox"
                          checked={selectedStudent.link.autoRemindHomework}
                          onChange={() => onToggleAutoReminder(selectedStudent.id)}
                        />
                        <span className={controls.slider} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className={styles.tabs}>
                  <button className={`${styles.tab} ${styles.tabActive}`}>Домашка</button>
                  <button className={styles.tab} disabled>
                    Обзор
                  </button>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.homeworkHeader}>
                  <div>
                    <div className={styles.priceLabel}>Домашние задания</div>
                    <div className={styles.subtleLabel}>Отслеживайте дедлайны и статусы</div>
                  </div>
                  <button className={controls.primaryButton} onClick={() => setIsHomeworkModalOpen(true)}>
                    + Новое ДЗ
                  </button>
                </div>

                <div className={styles.homeworkList}>
                  {selectedStudent.homeworks.map((hw) => (
                    <div key={hw.id} className={styles.homeworkItem}>
                      <div className={styles.homeworkContent}>
                        <div className={styles.homeworkText}>{hw.text}</div>
                        <div className={styles.homeworkMeta}>
                          {hw.deadline
                            ? `Дедлайн: ${format(new Date(hw.deadline), 'd MMM', { locale: undefined })}`
                            : 'Без дедлайна'}
                          <span className={styles.metaDivider}>•</span>
                          Статус: {hw.isDone ? 'выполнено' : 'в работе'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`${styles.statusPill} ${hw.isDone ? styles.statusDone : styles.statusPending}`}
                        onClick={() => onToggleHomework(hw.id)}
                      >
                        {hw.isDone ? 'выполнено' : 'в работе'}
                      </button>
                    </div>
                  ))}
                  {!selectedStudent.homeworks.length && (
                    <div className={styles.emptyState}>Пока нет заданий для этого ученика</div>
                  )}
                </div>

                <div className={styles.helperNote}>
                  Совет: форму создания ДЗ открывайте в модальном окне, а не держите постоянно на экране.
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>

      {isHomeworkModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.priceLabel}>Новое задание</div>
                <div className={styles.subtleLabel}>Отправьте ссылку и задайте дедлайн</div>
              </div>
              <button className={controls.iconButton} aria-label="Закрыть" onClick={() => setIsHomeworkModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <label className={styles.inputLabel}>
                Текст задания
                <input
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
          ) : (
            <div className={styles.placeholder}>Выберите ученика в списке, чтобы увидеть детали</div>
          )}
        </div>
      </div>
    </section>
  );
};
