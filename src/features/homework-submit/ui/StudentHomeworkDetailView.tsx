import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkAssignment, HomeworkAttachment, HomeworkSubmission, HomeworkTestQuestion } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentHomeworkDetailView.module.css';
import { ASSIGNMENT_STATUS_LABELS } from '../../../entities/homework-assignment/model/lib/assignmentBuckets';
import { resolveAssignmentResponseConfig } from '../../../entities/homework-assignment/model/lib/assignmentResponse';
import { canStudentEditSubmission, getLatestSubmission } from '../../../entities/homework-submission/model/lib/submissionState';
import { resolveHomeworkStorageUrl, uploadFileToHomeworkStorage } from '../model/upload';
import { ChevronLeftIcon } from '../../../icons/MaterialIcons';

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
  const responseConfig = useMemo(
    () => (assignment ? resolveAssignmentResponseConfig(assignment) : null),
    [assignment],
  );
  const canEditTest = canEdit && Boolean(responseConfig?.hasTest);
  const canUploadAttachments =
    Boolean(responseConfig?.allowFiles) ||
    Boolean(responseConfig?.allowPhotos) ||
    Boolean(responseConfig?.allowDocuments) ||
    Boolean(responseConfig?.allowAudio) ||
    Boolean(responseConfig?.allowVideo);
  const canUploadVoice = Boolean(responseConfig?.allowVoice);
  const canEditText = canEdit && Boolean(responseConfig?.allowText);
  const [answerText, setAnswerText] = useState('');
  const [attachments, setAttachments] = useState<HomeworkAttachment[]>([]);
  const [voice, setVoice] = useState<HomeworkAttachment[]>([]);
  const [testAnswers, setTestAnswers] = useState<Record<string, unknown>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [recordingSamples, setRecordingSamples] = useState<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);
  const recordingLevelFrameRef = useRef<number | null>(null);
  const recordingLastSampleAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

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
      if (recordingLevelFrameRef.current) {
        cancelAnimationFrame(recordingLevelFrameRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const stopLevelMeter = () => {
    if (recordingLevelFrameRef.current) {
      cancelAnimationFrame(recordingLevelFrameRef.current);
      recordingLevelFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    analyserDataRef.current = null;
    recordingLastSampleAtRef.current = 0;
    setRecordingLevel(0);
  };

  const startLevelMeter = (stream: MediaStream) => {
    const ContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextCtor) return;

    const audioContext = new ContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    analyserDataRef.current = dataArray;

    const tick = () => {
      const activeAnalyser = analyserRef.current;
      const activeDataArray = analyserDataRef.current;
      if (!activeAnalyser || !activeDataArray) return;

      activeAnalyser.getByteTimeDomainData(activeDataArray);
      let sumSquares = 0;
      for (let index = 0; index < activeDataArray.length; index += 1) {
        const normalized = (activeDataArray[index] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / activeDataArray.length);
      setRecordingLevel(rms);

      const nowTs = performance.now();
      if (nowTs - recordingLastSampleAtRef.current >= 80) {
        recordingLastSampleAtRef.current = nowTs;
        setRecordingSamples((prev) => {
          const next = [...prev, rms];
          return next.length > 80 ? next.slice(next.length - 80) : next;
        });
      }

      recordingLevelFrameRef.current = requestAnimationFrame(tick);
    };

    recordingLevelFrameRef.current = requestAnimationFrame(tick);
  };

  const handleUploadFiles = async (files: FileList | null, target: 'attachments' | 'voice') => {
    if (!files || !files.length || !canEdit) return;
    if (target === 'voice' && !canUploadVoice) return;
    if (target === 'attachments' && !canUploadAttachments) return;
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
      const message = error instanceof Error ? error.message : '';
      setLocalError(message ? `Не удалось загрузить файл: ${message}` : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!canEdit || recording || !canUploadVoice) return;
    setLocalError(null);
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      setLocalError('Запись голосового недоступна на этом устройстве');
      return;
    }
    try {
      recordingCancelledRef.current = false;
      setRecordingSamples([]);
      setRecordingLevel(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      startLevelMeter(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const shouldSkipUpload = recordingCancelledRef.current;
        recordingCancelledRef.current = false;
        const mimeType = recorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        mediaChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        stopLevelMeter();
        setRecording(false);
        if (shouldSkipUpload || blob.size === 0) return;
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        try {
          setUploading(true);
          const uploaded = await uploadFileToHomeworkStorage(file, 'homework-student-voice');
          setVoice((prev) => [...prev, uploaded]);
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          setLocalError(message ? `Не удалось загрузить голосовое: ${message}` : 'Не удалось загрузить голосовое');
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
    recordingCancelledRef.current = false;
    mediaRecorderRef.current?.stop();
  };

  const cancelVoiceRecording = () => {
    if (!recording) return;
    recordingCancelledRef.current = true;
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
    if (!responseConfig?.canSubmit) {
      setLocalError('В этом шаблоне не настроен способ сдачи. Обратись к преподавателю.');
      return;
    }
    setLocalError(null);
    const normalizedAttachments = canUploadAttachments ? attachments : [];
    const normalizedVoice = canUploadVoice ? voice : [];
    const normalizedTestAnswers = responseConfig.hasTest && Object.keys(testAnswers).length ? testAnswers : null;
    const normalizedAnswerText = responseConfig.allowText && answerText.trim() ? answerText.trim() : null;
    const payload: StudentHomeworkSubmitPayload = {
      answerText: normalizedAnswerText,
      attachments: normalizedAttachments,
      voice: normalizedVoice,
      testAnswers: normalizedTestAnswers,
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
                  disabled={!canEditTest}
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
                  disabled={!canEditTest}
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
          disabled={!canEditTest}
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
              disabled={!canEditTest}
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
      <div className={styles.backRow}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <ChevronLeftIcon width={18} height={18} />
          К списку домашних заданий
        </button>
      </div>

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
                    <a
                      key={attachment.id}
                      href={resolveHomeworkStorageUrl(attachment.url)}
                      className={styles.mediaLink}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                Разрешено:{' '}
                {[
                  block.allowText ? 'текст' : null,
                  block.allowFiles ? 'любые файлы' : null,
                  block.allowPhotos ? 'фото' : null,
                  block.allowDocuments ? 'документы' : null,
                  block.allowAudio ? 'аудио' : null,
                  block.allowVideo ? 'видео' : null,
                  block.allowVoice ? 'voice' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'форматы не выбраны'}
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Мой ответ</h3>
        {responseConfig?.hasTest && !responseConfig.allowsAnyManualResponse ? (
          <div className={styles.hint}>Эту домашку нужно сдать через тест выше. Дополнительный текст/файлы не требуются.</div>
        ) : null}

        {responseConfig?.allowText || (!canEdit && Boolean(answerText.trim())) ? (
          <label className={styles.fieldLabel}>
            Текст ответа
            <textarea
              className={controls.textArea}
              value={answerText}
              disabled={!canEditText}
              onChange={(event) => setAnswerText(event.target.value)}
              placeholder="Введите ответ"
            />
          </label>
        ) : null}

        {canUploadAttachments || attachments.length > 0 ? (
          <label className={styles.fieldLabel}>
            Вложения
            <input
              type="file"
              accept={responseConfig?.attachmentAccept}
              multiple
              disabled={!canEdit || uploading || !canUploadAttachments}
              onChange={(event) => {
                void handleUploadFiles(event.target.files, 'attachments');
                event.target.value = '';
              }}
            />
          </label>
        ) : null}

        {canUploadVoice || voice.length > 0 ? (
          <label className={styles.fieldLabel}>
            Голосовые
            <input
              type="file"
              accept="audio/*"
              multiple
              disabled={!canEdit || uploading || !canUploadVoice}
              onChange={(event) => {
                void handleUploadFiles(event.target.files, 'voice');
                event.target.value = '';
              }}
            />
          </label>
        ) : null}

        <div className={styles.actions}>
          {canUploadVoice && !recording ? (
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
          ) : null}
          {canUploadVoice && recording ? (
            <div className={styles.recordingPanel}>
              <div className={styles.recordingHeader}>
                <span className={styles.recordingDot} />
                Идет запись…
              </div>
              <div className={styles.waveTrack} aria-live="polite">
                {recordingSamples.length === 0 ? <span className={styles.waveBar} style={{ height: '10%' }} /> : null}
                {recordingSamples.map((sample, index) => (
                  <span
                    key={`sample_${index}`}
                    className={styles.waveBar}
                    style={{ height: `${Math.max(10, Math.min(100, Math.round(sample * 380)))}%` }}
                  />
                ))}
              </div>
              <div className={styles.levelText}>Уровень: {Math.round(Math.min(1, recordingLevel) * 100)}%</div>
              <div className={styles.actions}>
                <button type="button" className={controls.secondaryButton} onClick={cancelVoiceRecording}>
                  Остановить без отправки
                </button>
                <button type="button" className={controls.primaryButton} onClick={stopVoiceRecording}>
                  Остановить и сохранить
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.attachmentList}>
          {attachments.map((item) => (
            <div key={item.id} className={styles.attachmentItem}>
              <a href={resolveHomeworkStorageUrl(item.url)} target="_blank" rel="noreferrer">
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
              <audio controls src={resolveHomeworkStorageUrl(item.url)} />
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
