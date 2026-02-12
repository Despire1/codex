import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkAssignment, HomeworkAttachment, HomeworkBlockTest, HomeworkSubmission, HomeworkTestQuestion } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentHomeworkDetailView.module.css';
import { ASSIGNMENT_STATUS_LABELS } from '../../../entities/homework-assignment/model/lib/assignmentBuckets';
import { canStudentEditSubmission, getLatestSubmission } from '../../../entities/homework-submission/model/lib/submissionState';
import { uploadFileToHomeworkStorage } from '../model/upload';

export type StudentHomeworkSubmitPayload = {
  answerText: string | null;
  attachments: HomeworkAttachment[];
  voice: HomeworkAttachment[];
  testAnswers: Record<string, unknown> | null;
  submit: boolean;
};

interface StudentHomeworkDetailViewProps {
  assignment: HomeworkAssignment | null;
  submissions: HomeworkSubmission[];
  loading: boolean;
  submitting: boolean;
  requestError: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onSubmitPayload: (payload: StudentHomeworkSubmitPayload) => Promise<boolean>;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatSubmissionStatus = (status: HomeworkSubmission['status']) => {
  if (status === 'DRAFT') return 'Черновик';
  if (status === 'SUBMITTED') return 'Сдано';
  return 'Проверено';
};

const getQuestionAnswerValue = (question: HomeworkTestQuestion, testAnswers: Record<string, unknown>) =>
  testAnswers[question.id];

export const StudentHomeworkDetailView: FC<StudentHomeworkDetailViewProps> = ({
  assignment,
  submissions,
  loading,
  submitting,
  requestError,
  onBack,
  onRefresh,
  onSubmitPayload,
}) => {
  const latestSubmission = useMemo(() => getLatestSubmission(submissions), [submissions]);
  const canEdit = assignment ? canStudentEditSubmission(assignment) : false;
  const [answerText, setAnswerText] = useState('');
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [voice, setVoice] = useState<HomeworkAttachment[]>([]);
  const [testAnswers, setTestAnswers] = useState<Record<string, unknown>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setAnswerText(latestSubmission?.answerText ?? '');
    setAttachments(latestSubmission?.attachments ?? []);
    setVoice(latestSubmission?.voice ?? []);
    setTestAnswers((latestSubmission?.testAnswers as Record<string, unknown>) ?? {});
  }, [assignment?.id, latestSubmission?.id]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleUploadFiles = async (files: FileList | null, target: 'attachments' | 'voice') => {
    if (!files || !files.length || !canEdit) return;
    setLocalError(null);
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((file) =>
          uploadFileToHomeworkStorage(
            file,
            target === 'voice' ? 'homework-student-voice' : 'homework-student-attachment',
          ),
        ),
      );
      if (target === 'voice') {
        setVoice((prev) => [...prev, ...uploaded]);
      } else {
        setAttachments((prev) => [...prev, ...uploaded]);
      }
    } catch (error) {
      setLocalError('Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!canEdit || recording) return;
    setLocalError(null);
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      setLocalError('Запись голосового недоступна на этом устройстве');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        mediaChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        if (blob.size === 0) return;
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        try {
          setUploading(true);
          const uploaded = await uploadFileToHomeworkStorage(file, 'homework-student-voice');
          setVoice((prev) => [...prev, uploaded]);
        } catch (error) {
          setLocalError('Не удалось загрузить голосовое');
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      setLocalError('Не удалось начать запись голосового');
    }
  };

  const stopVoiceRecording = () => {
    if (!recording) return;
    mediaRecorderRef.current?.stop();
  };

  const setQuestionAnswer = (questionId: string, value: unknown) => {
    setTestAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = async (submit: boolean) => {
    if (!assignment || !canEdit) return;
    setLocalError(null);
    const payload: StudentHomeworkSubmitPayload = {
      answerText: answerText.trim() ? answerText.trim() : null,
      attachments,
      voice,
      testAnswers: Object.keys(testAnswers).length ? testAnswers : null,
      submit,
    };
    const success = await onSubmitPayload(payload);
    if (!success) {
      setLocalError(submit ? 'Не удалось отправить домашку' : 'Не удалось сохранить черновик');
    }
  };

  const renderQuestion = (question: HomeworkTestQuestion) => {
    const currentValue = getQuestionAnswerValue(question, testAnswers);
    if (question.type === 'SINGLE_CHOICE') {
      const selected =
        typeof currentValue === 'string'
          ? currentValue
          : Array.isArray(currentValue) && typeof currentValue[0] === 'string'
            ? currentValue[0]
            : '';
      return (
        <>
          {(question.options ?? []).map((option) => (
            <label key={option.id} className={styles.optionRow}>
              <input
                type="radio"
                checked={selected === option.id}
                disabled={!canEdit}
                onChange={() => setQuestionAnswer(question.id, option.id)}
              />
              {option.text}
            </label>
          ))}
        </>
      );
    }

    if (question.type === 'MULTIPLE_CHOICE') {
      const selected = Array.isArray(currentValue)
        ? currentValue.filter((value): value is string => typeof value === 'string')
        : [];
      return (
        <>
          {(question.options ?? []).map((option) => (
            <label key={option.id} className={styles.optionRow}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={!canEdit}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id);
                  setQuestionAnswer(question.id, next);
                }}
              />
              {option.text}
            </label>
          ))}
        </>
      );
    }

    if (question.type === 'SHORT_ANSWER') {
      return (
        <input
          className={controls.input}
          value={typeof currentValue === 'string' ? currentValue : ''}
          disabled={!canEdit}
          onChange={(event) => setQuestionAnswer(question.id, event.target.value)}
          placeholder="Введите ответ"
        />
      );
    }

    const selectedMap = currentValue && typeof currentValue === 'object' ? (currentValue as Record<string, unknown>) : {};
    const rightOptions = (question.matchingPairs ?? []).map((pair) => pair.right);
    return (
      <div className={styles.matchingGrid}>
        {(question.matchingPairs ?? []).map((pair) => (
          <label key={pair.id} className={styles.fieldLabel}>
            {pair.left}
            <select
              className={controls.input}
              value={typeof selectedMap[pair.left] === 'string' ? (selectedMap[pair.left] as string) : ''}
              disabled={!canEdit}
              onChange={(event) =>
                setQuestionAnswer(question.id, {
                  ...selectedMap,
                  [pair.left]: event.target.value,
                })
              }
            >
              <option value="">Выбрать</option>
              {rightOptions.map((rightOption) => (
                <option key={`${pair.id}_${rightOption}`} value={rightOption}>
                  {rightOption}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.panel}>Загрузка домашки…</div>
      </section>
    );
  }

  if (!assignment) {
    return (
      <section className={styles.page}>
        <div className={styles.panel}>
          <div className={styles.error}>Домашка не найдена или недоступна</div>
          <div className={styles.actions}>
            <button type="button" className={controls.secondaryButton} onClick={onBack}>
              Назад к списку
            </button>
          </div>
        </div>
      </section>
    );
  }

  const submitButtonLabel = assignment.status === 'RETURNED' ? 'Пересдать' : 'Сдать';
  const scoreLabel =
    assignment.score.finalScore ?? assignment.score.manualScore ?? assignment.score.autoScore ?? null;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{assignment.title}</h2>
          <div className={styles.meta}>
            <span className={styles.chip}>Статус: {ASSIGNMENT_STATUS_LABELS[assignment.status]}</span>
            <span className={styles.chip}>Дедлайн: {formatDateTime(assignment.deadlineAt)}</span>
            <span className={styles.chip}>Отправлено: {formatDateTime(assignment.sentAt)}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onBack}>
            К списку
          </button>
          <button type="button" className={controls.secondaryButton} onClick={onRefresh}>
            Обновить
          </button>
        </div>
      </header>

      {requestError ? <div className={styles.error}>{requestError}</div> : null}
      {localError ? <div className={styles.error}>{localError}</div> : null}
      {assignment.teacherComment ? <div className={styles.panel}>Комментарий учителя: {assignment.teacherComment}</div> : null}
      {scoreLabel !== null ? <div className={styles.panel}>Итоговый балл: {scoreLabel}/100</div> : null}

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Задание</h3>
        {assignment.contentSnapshot.map((block) => {
          if (block.type === 'TEXT') {
            return (
              <article key={block.id} className={styles.question}>
                <div className={styles.textBlock}>{block.content}</div>
              </article>
            );
          }

          if (block.type === 'MEDIA') {
            return (
              <article key={block.id} className={styles.question}>
                <div className={styles.panelTitle}>Материалы</div>
                <div className={styles.mediaList}>
                  {(block.attachments ?? []).map((attachment) => (
                    <a key={attachment.id} href={attachment.url} className={styles.mediaLink} target="_blank" rel="noreferrer">
                      {attachment.fileName || attachment.url}
                    </a>
                  ))}
                </div>
              </article>
            );
          }

          if (block.type === 'TEST') {
            return (
              <article key={block.id} className={styles.question}>
                <div className={styles.panelTitle}>{block.title || 'Тест'}</div>
                {(block.questions ?? []).map((question, index) => (
                  <div key={question.id} className={styles.question}>
                    <div className={styles.questionPrompt}>
                      {index + 1}. {question.prompt || 'Вопрос без текста'}
                    </div>
                    {renderQuestion(question)}
                  </div>
                ))}
              </article>
            );
          }

          return (
            <article key={block.id} className={styles.question}>
              <div className={styles.panelTitle}>Формат ответа</div>
              <div className={styles.hint}>
                Разрешено: {block.allowText ? 'текст, ' : ''}
                {block.allowFiles || block.allowDocuments ? 'файлы, ' : ''}
                {block.allowPhotos ? 'фото, ' : ''}
                {block.allowAudio ? 'аудио, ' : ''}
                {block.allowVideo ? 'видео, ' : ''}
                {block.allowVoice ? 'voice' : ''}
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Мой ответ</h3>
        <label className={styles.fieldLabel}>
          Текст ответа
          <textarea
            className={controls.textArea}
            value={answerText}
            disabled={!canEdit}
            onChange={(event) => setAnswerText(event.target.value)}
            placeholder="Введите ответ"
          />
        </label>

        <div className={styles.row}>
          <label className={styles.fieldLabel}>
            Вложения
            <input
              type="file"
              multiple
              disabled={!canEdit || uploading}
              onChange={(event) => {
                void handleUploadFiles(event.target.files, 'attachments');
                event.target.value = '';
              }}
            />
          </label>
          <label className={styles.fieldLabel}>
            Голосовые
            <input
              type="file"
              accept="audio/*"
              multiple
              disabled={!canEdit || uploading}
              onChange={(event) => {
                void handleUploadFiles(event.target.files, 'voice');
                event.target.value = '';
              }}
            />
          </label>
        </div>

        <div className={styles.actions}>
          {!recording ? (
            <button
              type="button"
              className={controls.secondaryButton}
              disabled={!canEdit || uploading}
              onClick={() => {
                void startVoiceRecording();
              }}
            >
              Записать voice
            </button>
          ) : (
            <button type="button" className={controls.secondaryButton} onClick={stopVoiceRecording}>
              Остановить запись
            </button>
          )}
        </div>

        <div className={styles.attachmentList}>
          {attachments.map((item) => (
            <div key={item.id} className={styles.attachmentItem}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.fileName}
              </a>
              {canEdit ? (
                <button
                  type="button"
                  className={controls.smallButton}
                  onClick={() => setAttachments((prev) => prev.filter((entry) => entry.id !== item.id))}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.attachmentList}>
          {voice.map((item) => (
            <div key={item.id} className={styles.attachmentItem}>
              <audio controls src={item.url} />
              {canEdit ? (
                <button
                  type="button"
                  className={controls.smallButton}
                  onClick={() => setVoice((prev) => prev.filter((entry) => entry.id !== item.id))}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          {canEdit ? (
            <>
              <button
                type="button"
                className={controls.secondaryButton}
                disabled={submitting || uploading}
                onClick={() => {
                  void handleSubmit(false);
                }}
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                className={controls.primaryButton}
                disabled={submitting || uploading}
                onClick={() => {
                  void handleSubmit(true);
                }}
              >
                {submitButtonLabel}
              </button>
            </>
          ) : (
            <div className={styles.hint}>Ответ сейчас доступен только для просмотра</div>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>История попыток</h3>
        <div className={styles.historyList}>
          {submissions.map((submission) => (
            <article key={submission.id} className={styles.historyItem}>
              <div>Попытка #{submission.attemptNo}</div>
              <div>Статус: {formatSubmissionStatus(submission.status)}</div>
              <div>Сдано: {formatDateTime(submission.submittedAt)}</div>
              <div>Проверено: {formatDateTime(submission.reviewedAt)}</div>
              <div>Комментарий: {submission.teacherComment || '—'}</div>
              <div>Балл: {submission.score.finalScore ?? submission.score.manualScore ?? submission.score.autoScore ?? '—'}</div>
            </article>
          ))}
          {submissions.length === 0 ? <div className={styles.hint}>Пока нет попыток</div> : null}
        </div>
      </section>
    </section>
  );
};

