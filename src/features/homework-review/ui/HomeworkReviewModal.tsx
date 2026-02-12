import { FC, useMemo, useState } from 'react';
import { HomeworkAssignment, HomeworkSubmission } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Modal } from '../../../shared/ui/Modal/Modal';
import styles from './HomeworkReviewModal.module.css';
import { getLatestSubmission } from '../../../entities/homework-submission/model/lib/submissionState';

interface HomeworkReviewModalProps {
  open: boolean;
  assignment: HomeworkAssignment | null;
  submissions: HomeworkSubmission[];
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmitReview: (payload: {
    action: 'REVIEWED' | 'RETURNED';
    submissionId: number;
    autoScore: number | null;
    manualScore: number | null;
    finalScore: number | null;
    teacherComment: string | null;
  }) => Promise<boolean>;
}

const normalizeScoreInput = (value: string) => {
  if (!value.trim()) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export const HomeworkReviewModal: FC<HomeworkReviewModalProps> = ({
  open,
  assignment,
  submissions,
  loading,
  submitting,
  onClose,
  onSubmitReview,
}) => {
  const latestSubmission = useMemo(() => getLatestSubmission(submissions), [submissions]);
  const [autoScore, setAutoScore] = useState('');
  const [manualScore, setManualScore] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [teacherComment, setTeacherComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (action: 'REVIEWED' | 'RETURNED') => {
    if (!latestSubmission) return;
    setError(null);
    const comment = teacherComment.trim() || null;
    if (action === 'RETURNED' && !comment) {
      setError('Комментарий обязателен при возврате на доработку');
      return;
    }
    const success = await onSubmitReview({
      action,
      submissionId: latestSubmission.id,
      autoScore: normalizeScoreInput(autoScore),
      manualScore: normalizeScoreInput(manualScore),
      finalScore: normalizeScoreInput(finalScore),
      teacherComment: comment,
    });
    if (!success) {
      setError('Не удалось сохранить проверку');
      return;
    }
    onClose();
  };

  if (!assignment) {
    return (
      <Modal open={open} onClose={handleClose} title="Проверка домашки">
        <div className={styles.layout}>Нет данных для проверки</div>
      </Modal>
    );
  }

  if (loading) {
    return (
      <Modal open={open} onClose={handleClose} title="Проверка домашки">
        <div className={styles.layout}>Загрузка попытки…</div>
      </Modal>
    );
  }

  if (!latestSubmission) {
    return (
      <Modal open={open} onClose={handleClose} title="Проверка домашки">
        <div className={styles.layout}>У задания пока нет отправленной попытки</div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Проверка домашки">
      <div className={styles.layout}>
        <div className={styles.meta}>
          Попытка #{latestSubmission.attemptNo} • сдано: {latestSubmission.submittedAt ?? '—'}
        </div>

        <section className={styles.section}>
          <h4 className={styles.title}>Ответ ученика</h4>
          <div>{latestSubmission.answerText || '—'}</div>
          {latestSubmission.testAnswers ? (
            <pre>{JSON.stringify(latestSubmission.testAnswers, null, 2)}</pre>
          ) : null}
          {(latestSubmission.attachments ?? []).map((attachment) => (
            <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
              {attachment.fileName || attachment.url}
            </a>
          ))}
          {(latestSubmission.voice ?? []).map((voiceItem) => (
            <audio key={voiceItem.id} controls src={voiceItem.url} />
          ))}
        </section>

        <section className={styles.section}>
          <h4 className={styles.title}>Оценка</h4>
          <div className={styles.scores}>
            <label className={styles.fieldLabel}>
              Auto
              <input
                className={controls.input}
                type="number"
                min={0}
                max={100}
                value={autoScore}
                onChange={(event) => setAutoScore(event.target.value)}
                placeholder={String(latestSubmission.score.autoScore ?? assignment.score.autoScore ?? '')}
              />
            </label>
            <label className={styles.fieldLabel}>
              Manual
              <input
                className={controls.input}
                type="number"
                min={0}
                max={100}
                value={manualScore}
                onChange={(event) => setManualScore(event.target.value)}
                placeholder={String(latestSubmission.score.manualScore ?? assignment.score.manualScore ?? '')}
              />
            </label>
            <label className={styles.fieldLabel}>
              Final
              <input
                className={controls.input}
                type="number"
                min={0}
                max={100}
                value={finalScore}
                onChange={(event) => setFinalScore(event.target.value)}
                placeholder={String(latestSubmission.score.finalScore ?? assignment.score.finalScore ?? '')}
              />
            </label>
          </div>
          <label className={styles.fieldLabel}>
            Комментарий
            <textarea
              className={controls.textArea}
              value={teacherComment}
              onChange={(event) => setTeacherComment(event.target.value)}
              placeholder="Комментарий ученику"
            />
          </label>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={handleClose} disabled={submitting}>
            Отмена
          </button>
          <button
            type="button"
            className={controls.secondaryButton}
            onClick={() => {
              void handleSubmit('RETURNED');
            }}
            disabled={submitting}
          >
            Вернуть на доработку
          </button>
          <button
            type="button"
            className={controls.primaryButton}
            onClick={() => {
              void handleSubmit('REVIEWED');
            }}
            disabled={submitting}
          >
            Проверено
          </button>
        </div>
      </div>
    </Modal>
  );
};
