import { format } from 'date-fns';
import { type FC } from 'react';
import { EditIcon } from '../../icons/MaterialIcons';
import { LinkedStudent, Student } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './StudentsSection.module.css';

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

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h2>Ученики</h2>
        <button className={controls.secondaryButton} onClick={onOpenStudentModal}>
          + Добавить ученика
        </button>
      </div>
      <div className={styles.studentList}>
        {linkedStudents.map((student) => (
          <button
            key={student.id}
            className={`${styles.studentCard} ${selectedStudentId === student.id ? styles.activeStudent : ''}`}
            onClick={() => onSelectStudent(student.id)}
          >
            <div className={styles.studentName}>{student.link.customName}</div>
            <div className={styles.studentMeta}>
              @{student.username || '—'} · Баланс: {student.link.balanceLessons} · Автонапоминания:{' '}
              {student.link.autoRemindHomework ? 'вкл' : 'выкл'}
            </div>
          </button>
        ))}
      </div>

      {selectedStudent && (
        <div className={styles.profile}>
          <div className={styles.profileHeader}>
            <div>
              <div className={styles.profileName}>{selectedStudent.link.customName}</div>
              <div className={styles.studentMeta}>Telegram: @{selectedStudent.username || 'нет'}</div>
            </div>
            <button className={controls.secondaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
              Напомнить о ДЗ
            </button>
          </div>
          <div className={styles.toggleRow}>
            <span>Автоматически напоминать о ДЗ</span>
            <label className={controls.switch}>
              <input
                type="checkbox"
                checked={selectedStudent.link.autoRemindHomework}
                onChange={() => onToggleAutoReminder(selectedStudent.id)}
              />
              <span className={controls.slider} />
            </label>
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
            <span>Предоплаченные уроки: {selectedStudent.link.balanceLessons}</span>
            <div className={styles.balanceActions}>
              <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, 1)}>
                +1
              </button>
              <button className={controls.smallButton} onClick={() => onAdjustBalance(selectedStudent.id, -1)}>
                -1
              </button>
            </div>
          </div>

          <div className={styles.homeworkBlock}>
            <div className={styles.priceLabel}>Домашние задания</div>
            <div className={styles.homeworkList}>
              {selectedStudent.homeworks.map((hw) => (
                <div key={hw.id} className={styles.homeworkItem}>
                  <div>
                    <div className={styles.homeworkText}>{hw.text}</div>
                    {hw.deadline && (
                      <div className={styles.homeworkMeta}>
                        Дедлайн: {format(new Date(hw.deadline), 'd MMM', { locale: undefined })}
                      </div>
                    )}
                    {hw.isDone && <div className={styles.homeworkMeta}>Отмечено как выполненное</div>}
                  </div>
                  <button className={controls.smallButton} onClick={() => onToggleHomework(hw.id)}>
                    {hw.isDone ? 'Не готово' : 'Сделано'}
                  </button>
                </div>
              ))}
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
                <input
                  className={controls.input}
                  type="date"
                  value={newHomeworkDraft.deadline}
                  onChange={(e) => onHomeworkDraftChange({ ...newHomeworkDraft, deadline: e.target.value })}
                />
              </div>
              <button className={controls.primaryButton} onClick={onAddHomework}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
