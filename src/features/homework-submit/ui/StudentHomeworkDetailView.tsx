import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark as farBookmark } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faBars,
  faBookOpen,
  faChartLine,
  faCheck,
  faCircleCheck,
  faClock,
  faDownload,
  faFilePdf,
  faInfinity,
  faLightbulb,
  faLink,
  faListCheck,
  faMicrophone,
  faPaperPlane,
  faPaperclip,
  faStar,
} from '@fortawesome/free-solid-svg-icons';
import {
  HomeworkAssignment,
  HomeworkAttachment,
  HomeworkSubmission,
  HomeworkTestQuestion,
  HomeworkTestQuestionKind,
} from '../../../entities/types';
import styles from './StudentHomeworkDetailView.module.css';
import { ASSIGNMENT_STATUS_LABELS } from '../../../entities/homework-assignment/model/lib/assignmentBuckets';
import { resolveAssignmentResponseConfig } from '../../../entities/homework-assignment/model/lib/assignmentResponse';
import { canStudentEditSubmission, getLatestSubmission } from '../../../entities/homework-submission/model/lib/submissionState';
import { resolveHomeworkStorageUrl, uploadFileToHomeworkStorage } from '../model/upload';

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

type QuestionCardModel =
  | {
      id: string;
      kind: 'test';
      question: HomeworkTestQuestion;
      points: number;
      typeLabel: string;
      hint: string;
      tone: 'single' | 'multiple' | 'short' | 'matching' | 'fillWord' | 'ordering' | 'table' | 'manual';
    }
  | {
      id: 'essay_response';
      kind: 'essay';
      points: number;
      typeLabel: string;
      hint: string;
      tone: 'essay';
      prompt: string;
    };

const ESSAY_MIN_WORDS = 50;
const PASS_THRESHOLD_PERCENT = 70;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseTimestamp = (value?: string | null) => {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return ts;
};

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

const formatCountdown = (remainingMs: number | null) => {
  if (remainingMs === null) return '∞';
  if (remainingMs <= 0) return '00:00';
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days}д ${restHours}ч`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatDurationMs = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const normalizeAudioMimeType = (value: string | null | undefined) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'audio/webm';
  const [mime = 'audio/webm'] = raw.split(';');
  const normalized = mime.trim();
  if (!normalized || !normalized.includes('/')) return 'audio/webm';
  return normalized;
};

const resolveAudioExtension = (mimeType: string) => {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav') || mimeType.includes('wave')) return 'wav';
  if (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')) return 'm4a';
  return 'webm';
};

const formatSubmissionStatus = (status: HomeworkSubmission['status']) => {
  if (status === 'DRAFT') return 'Черновик';
  if (status === 'SUBMITTED') return 'Сдано';
  return 'Проверено';
};

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const formatFileSize = (size?: number) => {
  if (!size || size <= 0) return '—';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

const getQuestionAnswerValue = (question: HomeworkTestQuestion, testAnswers: Record<string, unknown>) =>
  testAnswers[question.id];

const resolveQuestionKind = (question: HomeworkTestQuestion): HomeworkTestQuestionKind => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') return 'CHOICE';
  if (question.type === 'MATCHING') return 'MATCHING';
  return question.uiQuestionKind ?? 'SHORT_TEXT';
};

const countFillInBlanks = (value: string) => Array.from(value.matchAll(/\[___\]/g)).length;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
};

const deterministicShuffle = <T,>(items: T[], seedText: string): T[] => {
  const next = [...items];
  let seed = hashString(seedText);
  for (let index = next.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    const tmp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = tmp;
  }
  return next;
};

const resolveQuestionTypeLabel = (question: HomeworkTestQuestion) => {
  const kind = resolveQuestionKind(question);
  if (kind === 'CHOICE') return question.type === 'MULTIPLE_CHOICE' ? 'Несколько вариантов' : 'Один вариант';
  if (kind === 'SHORT_TEXT') return 'Короткий ответ';
  if (kind === 'LONG_TEXT') return 'Эссе';
  if (kind === 'AUDIO') return 'Аудио запись';
  if (kind === 'FILE') return 'Загрузка файла';
  if (kind === 'FILL_WORD') return 'Вставить слово';
  if (kind === 'MATCHING') return 'Сопоставление';
  if (kind === 'ORDERING') return 'Упорядочивание';
  return 'Таблица';
};

const resolveQuestionHint = (question: HomeworkTestQuestion) => {
  const kind = resolveQuestionKind(question);
  if (kind === 'CHOICE') {
    return question.type === 'MULTIPLE_CHOICE'
      ? 'Можно выбрать несколько правильных ответов'
      : 'Выберите один правильный ответ';
  }
  if (kind === 'SHORT_TEXT') return 'Введите ваш ответ в поле ниже';
  if (kind === 'LONG_TEXT') return 'Напишите развернутый ответ';
  if (kind === 'AUDIO') return 'Запишите голосовой ответ в блоке ниже';
  if (kind === 'FILE') return 'Загрузите файл в блоке вложений ниже';
  if (kind === 'FILL_WORD') return 'Заполните все пропуски в тексте';
  if (kind === 'MATCHING') return 'Соотнесите элементы из двух колонок';
  if (kind === 'ORDERING') return 'Перетащите шаги в правильный порядок';
  return 'Заполните пустые ячейки таблицы';
};

const resolveQuestionTone = (question: HomeworkTestQuestion): Exclude<QuestionCardModel['tone'], 'essay'> => {
  const kind = resolveQuestionKind(question);
  if (kind === 'CHOICE') return question.type === 'MULTIPLE_CHOICE' ? 'multiple' : 'single';
  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT') return 'short';
  if (kind === 'MATCHING') return 'matching';
  if (kind === 'FILL_WORD') return 'fillWord';
  if (kind === 'ORDERING') return 'ordering';
  if (kind === 'TABLE') return 'table';
  return 'manual';
};

const resolveQuestionPoints = (question: HomeworkTestQuestion) => {
  if (typeof question.points === 'number' && Number.isFinite(question.points) && question.points > 0) {
    return Math.round(question.points);
  }
  return question.type === 'SHORT_ANSWER' ? 2 : 2;
};

const isTestQuestionAnswered = (question: HomeworkTestQuestion, value: unknown) => {
  const kind = resolveQuestionKind(question);

  if (kind === 'CHOICE' && question.type === 'SINGLE_CHOICE') {
    if (typeof value === 'string') return Boolean(value);
    if (Array.isArray(value) && typeof value[0] === 'string') return Boolean(value[0]);
    return false;
  }

  if (kind === 'CHOICE' && question.type === 'MULTIPLE_CHOICE') {
    return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.length > 0);
  }

  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (kind === 'AUDIO' || kind === 'FILE') {
    return false;
  }

  if (kind === 'FILL_WORD') {
    const answers = Array.isArray(value) ? value : [];
    return answers.some((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (kind === 'ORDERING') {
    return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (kind === 'TABLE') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value as Record<string, unknown>).some((rowValue) => {
      if (!Array.isArray(rowValue)) return false;
      return rowValue.some((cell) => typeof cell === 'string' && cell.trim().length > 0);
    });
  }

  const selectedMap = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  const pairs = question.matchingPairs ?? [];
  if (!pairs.length || !selectedMap) return false;
  return pairs.every((pair) => typeof selectedMap[pair.left] === 'string' && String(selectedMap[pair.left]).trim().length > 0);
};

const isPdfAttachment = (attachment: HomeworkAttachment) => {
  const source = `${attachment.fileName || ''} ${attachment.url || ''}`.toLowerCase();
  return source.includes('.pdf');
};

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
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [orderingDragState, setOrderingDragState] = useState<{ questionId: string; sourceIndex: number } | null>(
    null,
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);
  const recordingLevelFrameRef = useRef<number | null>(null);
  const recordingLastSampleAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingDurationIntervalRef = useRef<number | null>(null);

  const questionRefs = useRef<Record<string, HTMLElement | null>>({});

  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    setAnswerText(latestSubmission?.answerText ?? '');
    setAttachments(latestSubmission?.attachments ?? []);
    setVoice(latestSubmission?.voice ?? []);
    setTestAnswers((latestSubmission?.testAnswers as Record<string, unknown>) ?? {});
  }, [assignment?.id, latestSubmission?.id]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const clearRecordingDurationTicker = () => {
    if (recordingDurationIntervalRef.current !== null) {
      window.clearInterval(recordingDurationIntervalRef.current);
      recordingDurationIntervalRef.current = null;
    }
    recordingStartedAtRef.current = null;
  };

  const startRecordingDurationTicker = () => {
    clearRecordingDurationTicker();
    const startedAt = Date.now();
    recordingStartedAtRef.current = startedAt;
    setRecordingDurationMs(0);
    recordingDurationIntervalRef.current = window.setInterval(() => {
      const startTs = recordingStartedAtRef.current;
      if (startTs === null) return;
      setRecordingDurationMs(Date.now() - startTs);
    }, 200);
  };

  useEffect(() => {
    return () => {
      clearRecordingDurationTicker();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
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
    const ContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextCtor) return;

    const audioContext = new ContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array<ArrayBuffer>(new ArrayBuffer(analyser.fftSize));

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

      const nowPerformanceTs = performance.now();
      if (nowPerformanceTs - recordingLastSampleAtRef.current >= 80) {
        recordingLastSampleAtRef.current = nowPerformanceTs;
        setRecordingSamples((prev) => {
          const next = [...prev, rms];
          return next.length > 80 ? next.slice(next.length - 80) : next;
        });
      }

      recordingLevelFrameRef.current = requestAnimationFrame(tick);
    };

    recordingLevelFrameRef.current = requestAnimationFrame(tick);
  };

  const handleUploadAttachments = async (files: FileList | null) => {
    if (!files || !files.length || !canEdit || !canUploadAttachments) return;

    setLocalError(null);
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((file) => uploadFileToHomeworkStorage(file, 'homework-student-attachment')),
      );
      setAttachments((prev) => [...prev, ...uploaded]);
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
      setRecordingDurationMs(0);

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
        clearRecordingDurationTicker();
        const normalizedMimeType = normalizeAudioMimeType(recorder.mimeType || 'audio/webm');
        const extension = resolveAudioExtension(normalizedMimeType);
        const blob = new Blob(mediaChunksRef.current, { type: normalizedMimeType });
        mediaChunksRef.current = [];

        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        stopLevelMeter();
        setRecording(false);

        if (shouldSkipUpload || blob.size === 0) return;
        try {
          setUploading(true);
          const fileBaseName = `voice-${Date.now()}.${extension}`;
          const file = new File([blob], fileBaseName, { type: normalizedMimeType });
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
      startRecordingDurationTicker();
      setRecording(true);
    } catch (error) {
      clearRecordingDurationTicker();
      setLocalError('Не удалось начать запись голосового');
    }
  };

  const stopVoiceRecording = () => {
    if (!recording) return;
    recordingCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = () => {
    if (!recording) return;
    recordingCancelledRef.current = true;
    clearRecordingDurationTicker();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
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
    const normalizedVoice = canUploadVoice
      ? Array.from(
          new Map(
            voice.map((item) => [`${item.fileName.trim().toLowerCase()}_${item.size}`, item] as const),
          ).values(),
        )
      : [];
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

  const questionCards = useMemo<QuestionCardModel[]>(() => {
    if (!assignment) return [];

    const cards: QuestionCardModel[] = [];

    assignment.contentSnapshot.forEach((block) => {
      if (block.type !== 'TEST') return;

      (block.questions ?? []).forEach((question) => {
        cards.push({
          id: `${block.id}_${question.id}`,
          kind: 'test',
          question,
          points: resolveQuestionPoints(question),
          typeLabel: resolveQuestionTypeLabel(question),
          hint: resolveQuestionHint(question),
          tone: resolveQuestionTone(question),
        });
      });
    });

    const showEssayCard = Boolean(responseConfig?.allowText) || (!canEdit && Boolean(answerText.trim()));
    if (showEssayCard) {
      cards.push({
        id: 'essay_response',
        kind: 'essay',
        points: 3,
        typeLabel: 'Эссе',
        hint: `Напишите развернутый ответ (минимум ${ESSAY_MIN_WORDS} слов)`,
        tone: 'essay',
        prompt: 'Напишите развернутый ответ по заданию',
      });
    }

    return cards;
  }, [answerText, assignment, canEdit, responseConfig?.allowText]);

  const answeredMap = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};

    questionCards.forEach((card) => {
      if (card.kind === 'essay') {
        result[card.id] = Boolean(answerText.trim());
        return;
      }
      const questionKind = resolveQuestionKind(card.question);
      if (questionKind === 'AUDIO') {
        result[card.id] = voice.length > 0;
        return;
      }
      if (questionKind === 'FILE') {
        result[card.id] = attachments.length > 0;
        return;
      }
      result[card.id] = isTestQuestionAnswered(card.question, getQuestionAnswerValue(card.question, testAnswers));
    });

    return result;
  }, [answerText, attachments.length, questionCards, testAnswers, voice.length]);

  const assignmentDescription = useMemo(() => {
    if (!assignment) return 'Выполните задание внимательно и ответьте на все вопросы.';
    const textBlocks = assignment.contentSnapshot
      .filter((block): block is Extract<HomeworkAssignment['contentSnapshot'][number], { type: 'TEXT' }> => block.type === 'TEXT')
      .map((block) => block.content.trim())
      .filter(Boolean);

    if (!textBlocks.length) {
      return 'Выполните все задания и отправьте ответ преподавателю.';
    }

    return textBlocks[0];
  }, [assignment]);

  const materialAttachments = useMemo(() => {
    if (!assignment) return [] as HomeworkAttachment[];
    return assignment.contentSnapshot.flatMap((block) => (block.type === 'MEDIA' ? block.attachments ?? [] : []));
  }, [assignment]);

  const completedCount = useMemo(
    () => questionCards.reduce((sum, card) => (answeredMap[card.id] ? sum + 1 : sum), 0),
    [answeredMap, questionCards],
  );

  const totalQuestions = questionCards.length;
  const progressPercent = totalQuestions ? Math.round((completedCount / totalQuestions) * 100) : 0;

  const maxPoints = questionCards.reduce((sum, card) => sum + card.points, 0);
  const displayMaxPoints = maxPoints > 0 ? maxPoints : 10;

  const latestScore = assignment
    ? assignment.score.finalScore ?? assignment.score.manualScore ?? assignment.score.autoScore ?? null
    : null;

  const estimatedMinutes = Math.max(10, totalQuestions * 3);
  const essayWordCount = countWords(answerText);

  const deadlineTs = parseTimestamp(assignment?.deadlineAt);
  const sentTs = parseTimestamp(assignment?.sentAt ?? assignment?.createdAt);
  const remainingMs = deadlineTs === null ? null : Math.max(0, deadlineTs - nowTs);

  const timeProgressPercent = useMemo(() => {
    if (deadlineTs === null) return Math.max(10, progressPercent);
    if (sentTs !== null && deadlineTs > sentTs) {
      const ratio = (deadlineTs - nowTs) / (deadlineTs - sentTs);
      return clamp(Math.round(ratio * 100), 0, 100);
    }
    return remainingMs && remainingMs > 0 ? 100 : 0;
  }, [deadlineTs, nowTs, progressPercent, remainingMs, sentTs]);

  const timeLabel = formatCountdown(remainingMs);
  const timeHint = remainingMs === null ? 'без ограничения по времени' : 'до дедлайна';

  const submitButtonLabel = assignment?.status === 'RETURNED' ? 'Пересдать' : 'Отправить';

  const tips = useMemo(() => {
    const list: Array<{ title: string; text: string }> = [];

    if (latestSubmission) {
      list.push({
        title: 'Статус попытки',
        text: `${formatSubmissionStatus(latestSubmission.status)} • ${formatDateTime(latestSubmission.submittedAt)}`,
      });
    }

    if (assignment?.teacherComment) {
      list.push({
        title: 'Комментарий преподавателя',
        text: assignment.teacherComment,
      });
    }

    list.push({
      title: 'Совет 1',
      text: 'Внимательно прочитайте формулировку каждого вопроса перед ответом.',
    });
    list.push({
      title: 'Совет 2',
      text: 'Если не уверены в ответе, сохраните черновик и вернитесь к вопросу позже.',
    });
    list.push({
      title: 'Совет 3',
      text: 'Перед отправкой проверьте орфографию и полноту ответа.',
    });

    return list.slice(0, 3);
  }, [assignment?.teacherComment, latestSubmission]);

  const showTestOnlyNotice = Boolean(responseConfig?.hasTest && !responseConfig.allowsAnyManualResponse);

  const registerQuestionRef = (questionId: string) => (node: HTMLElement | null) => {
    questionRefs.current[questionId] = node;
  };

  const scrollToQuestion = (questionId: string) => {
    const target = questionRefs.current[questionId];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderTestQuestionControls = (question: HomeworkTestQuestion) => {
    const currentValue = getQuestionAnswerValue(question, testAnswers);
    const questionKind = resolveQuestionKind(question);

    if (questionKind === 'CHOICE' && question.type === 'SINGLE_CHOICE') {
      const selected =
        typeof currentValue === 'string'
          ? currentValue
          : Array.isArray(currentValue) && typeof currentValue[0] === 'string'
            ? currentValue[0]
            : '';

      return (
        <div className={styles.optionsList}>
          {(question.options ?? []).map((option) => {
            const isActive = selected === option.id;
            return (
              <label
                key={option.id}
                className={`${styles.optionCard} ${isActive ? styles.optionCardActive : ''} ${!canEditTest ? styles.optionCardDisabled : ''}`}
              >
                <input
                  type="radio"
                  className={styles.optionInput}
                  checked={isActive}
                  disabled={!canEditTest}
                  onChange={() => setQuestionAnswer(question.id, option.id)}
                />
                <span className={`${styles.optionControl} ${styles.radioControl}`} aria-hidden />
                <span className={styles.optionText}>{option.text}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (questionKind === 'CHOICE' && question.type === 'MULTIPLE_CHOICE') {
      const selected = Array.isArray(currentValue)
        ? currentValue.filter((value): value is string => typeof value === 'string')
        : [];

      return (
        <div className={styles.optionsList}>
          {(question.options ?? []).map((option) => {
            const isActive = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className={`${styles.optionCard} ${isActive ? styles.optionCardActive : ''} ${!canEditTest ? styles.optionCardDisabled : ''}`}
              >
                <input
                  type="checkbox"
                  className={styles.optionInput}
                  checked={isActive}
                  disabled={!canEditTest}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? Array.from(new Set([...selected, option.id]))
                      : selected.filter((id) => id !== option.id);
                    setQuestionAnswer(question.id, next);
                  }}
                />
                <span className={`${styles.optionControl} ${styles.checkboxControl}`} aria-hidden>
                  {isActive ? <FontAwesomeIcon icon={faCheck} className={styles.optionCheckIcon} /> : null}
                </span>
                <span className={styles.optionText}>{option.text}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (questionKind === 'SHORT_TEXT') {
      return (
        <input
          className={styles.shortInput}
          value={typeof currentValue === 'string' ? currentValue : ''}
          disabled={!canEditTest}
          onChange={(event) => setQuestionAnswer(question.id, event.target.value)}
          placeholder="Введите ваш ответ..."
        />
      );
    }

    if (questionKind === 'LONG_TEXT') {
      return (
        <textarea
          className={styles.essayInput}
          value={typeof currentValue === 'string' ? currentValue : ''}
          disabled={!canEditTest}
          onChange={(event) => setQuestionAnswer(question.id, event.target.value)}
          placeholder="Напишите развернутый ответ..."
        />
      );
    }

    if (questionKind === 'AUDIO') {
      return (
        <div className={styles.manualAnswerStub}>
          Запишите голосовой ответ в блоке «Голосовой ответ» ниже. Можно прикрепить несколько попыток.
        </div>
      );
    }

    if (questionKind === 'FILE') {
      return (
        <div className={styles.manualAnswerStub}>
          Загрузите файл в блоке «Вложения» ниже. Поддерживаемые форматы определяет преподаватель.
        </div>
      );
    }

    if (questionKind === 'FILL_WORD') {
      const fillText = question.fillInTheBlankText ?? '';
      const normalizedText = fillText.trim();
      const segments = normalizedText ? normalizedText.split('[___]') : [];
      const blanksCount = normalizedText ? countFillInBlanks(normalizedText) : 0;
      const answers = Array.isArray(currentValue) ? currentValue.filter((value): value is string => typeof value === 'string') : [];
      const answerCount = Math.max(1, blanksCount || answers.length || 1);
      const normalizedAnswers = Array.from({ length: answerCount }, (_, index) => answers[index] ?? '');

      const updateBlankAnswer = (answerIndex: number, nextValue: string) => {
        const nextAnswers = [...normalizedAnswers];
        nextAnswers[answerIndex] = nextValue;
        setQuestionAnswer(question.id, nextAnswers);
      };

      if (!normalizedText || blanksCount === 0) {
        return (
          <div className={styles.fillWordWrap}>
            <div className={styles.manualAnswerStub}>Преподаватель не добавил пропуски в шаблон.</div>
            <input
              className={styles.shortInput}
              value={normalizedAnswers[0] ?? ''}
              disabled={!canEditTest}
              onChange={(event) => updateBlankAnswer(0, event.target.value)}
              placeholder="Введите ответ..."
            />
          </div>
        );
      }

      return (
        <div className={styles.fillWordWrap}>
          <div className={styles.fillWordLine}>
            {segments.map((segment, segmentIndex) => (
              <span key={`${question.id}_segment_${segmentIndex}`} className={styles.fillWordPart}>
                {segment}
                {segmentIndex < blanksCount ? (
                  <input
                    className={styles.fillWordInput}
                    value={normalizedAnswers[segmentIndex] ?? ''}
                    disabled={!canEditTest}
                    onChange={(event) => updateBlankAnswer(segmentIndex, event.target.value)}
                    aria-label={`Пропуск ${segmentIndex + 1}`}
                  />
                ) : null}
              </span>
            ))}
          </div>
          <p className={styles.fillWordHint}>Заполните каждый пропуск одним словом или фразой.</p>
        </div>
      );
    }

    if (questionKind === 'ORDERING') {
      const baseItems = (question.orderingItems ?? []).filter((item) => item.text.trim().length > 0);
      if (!baseItems.length) {
        return <div className={styles.manualAnswerStub}>В этом задании пока нет шагов для упорядочивания.</div>;
      }

      const itemIds = baseItems.map((item) => item.id);
      const selectedOrderRaw = Array.isArray(currentValue)
        ? currentValue.filter((value): value is string => typeof value === 'string')
        : [];
      const isValidSelectedOrder =
        selectedOrderRaw.length === itemIds.length && selectedOrderRaw.every((itemId) => itemIds.includes(itemId));

      const initialOrder = (question.shuffleOptions ?? true)
        ? deterministicShuffle(baseItems, `${question.id}_ordering`).map((item) => item.id)
        : itemIds;
      const selectedOrder = isValidSelectedOrder ? selectedOrderRaw : initialOrder;
      const itemById = new Map(baseItems.map((item) => [item.id, item] as const));

      return (
        <div className={styles.orderingList}>
          {selectedOrder.map((itemId, itemIndex) => {
            const item = itemById.get(itemId);
            if (!item) return null;
            return (
              <div
                key={item.id}
                className={`${styles.orderingItem} ${
                  orderingDragState?.questionId === question.id && orderingDragState.sourceIndex === itemIndex
                    ? styles.orderingItemDragging
                    : ''
                }`}
                onDragOver={(event) => {
                  if (!canEditTest || !orderingDragState || orderingDragState.questionId !== question.id) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!canEditTest || !orderingDragState || orderingDragState.questionId !== question.id) return;
                  event.preventDefault();
                  if (orderingDragState.sourceIndex === itemIndex) {
                    setOrderingDragState(null);
                    return;
                  }
                  const nextOrder = [...selectedOrder];
                  const [movedItemId] = nextOrder.splice(orderingDragState.sourceIndex, 1);
                  nextOrder.splice(itemIndex, 0, movedItemId);
                  setQuestionAnswer(question.id, nextOrder);
                  setOrderingDragState(null);
                }}
              >
                <span className={styles.orderingIndex}>{itemIndex + 1}</span>
                <button
                  type="button"
                  className={styles.orderingDragHandle}
                  draggable={canEditTest}
                  disabled={!canEditTest}
                  onDragStart={(event) => {
                    if (!canEditTest) return;
                    event.dataTransfer.effectAllowed = 'move';
                    setOrderingDragState({ questionId: question.id, sourceIndex: itemIndex });
                  }}
                  onDragEnd={() => setOrderingDragState(null)}
                  aria-label={`Перетащить шаг ${itemIndex + 1}`}
                >
                  <FontAwesomeIcon icon={faBars} />
                </button>
                <span className={styles.orderingText}>{item.text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (questionKind === 'TABLE') {
      const table = question.table;
      if (!table) {
        return <div className={styles.manualAnswerStub}>Преподаватель не настроил таблицу для этого вопроса.</div>;
      }

      const answerColumns = table.answerHeaders ?? [];
      const answerMap = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? (currentValue as Record<string, unknown>)
        : {};

      return (
        <div className={styles.answerTableWrap}>
          <table className={styles.answerTable}>
            <thead>
              <tr>
                <th>{table.leadHeader || 'Колонка'}</th>
                {answerColumns.map((header, headerIndex) => (
                  <th key={`${question.id}_answer_header_${headerIndex}`}>{header || `Колонка ${headerIndex + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(table.rows ?? []).map((row) => {
                const rowValuesRaw = answerMap[row.id];
                const rowValues = Array.isArray(rowValuesRaw)
                  ? rowValuesRaw.filter((value): value is string => typeof value === 'string')
                  : [];
                return (
                  <tr key={row.id}>
                    <td className={styles.answerTableLead}>{row.lead}</td>
                    {answerColumns.map((_, cellIndex) => (
                      <td key={`${row.id}_cell_${cellIndex}`}>
                        <input
                          className={styles.answerTableInput}
                          value={rowValues[cellIndex] ?? ''}
                          disabled={!canEditTest}
                          onChange={(event) => {
                            const nextRowValues = Array.from({ length: answerColumns.length }, (_, index) => rowValues[index] ?? '');
                            nextRowValues[cellIndex] = event.target.value;
                            setQuestionAnswer(question.id, {
                              ...answerMap,
                              [row.id]: nextRowValues,
                            });
                          }}
                          placeholder="Ответ"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    const selectedMap =
      currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? (currentValue as Record<string, unknown>)
        : {};

    const rightOptionsBase = Array.from(
      new Set((question.matchingPairs ?? []).map((pair) => pair.right.trim()).filter((value) => value.length > 0)),
    );
    const rightOptions = question.shuffleOptions
      ? deterministicShuffle(rightOptionsBase, `${question.id}_matching`)
      : rightOptionsBase;

    return (
      <div className={styles.matchingGrid}>
        {(question.matchingPairs ?? []).map((pair) => (
          <label key={pair.id} className={styles.matchingRow}>
            <span className={styles.matchingLabel}>{pair.left}</span>
            <select
              className={styles.matchingSelect}
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
              {rightOptions.map((option) => (
                <option key={`${pair.id}_${option}`} value={option}>
                  {option}
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
      <section className={styles.screen}>
        <div className={styles.stateCard}>Загрузка домашки...</div>
      </section>
    );
  }

  if (!assignment) {
    return (
      <section className={styles.screen}>
        <div className={styles.stateCard}>
          <div className={styles.noticeText}>Домашка не найдена или недоступна</div>
          <div className={styles.stateActions}>
            <button type="button" className={styles.lightButton} onClick={onBack}>
              Назад к списку
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.mobileMenuButton} onClick={onBack} aria-label="Вернуться назад">
            <FontAwesomeIcon icon={faBars} />
          </button>

          <div className={styles.titleCluster}>
            <button type="button" className={styles.backCircleButton} onClick={onBack} aria-label="Назад">
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <div className={styles.titleBlock}>
              <h1 className={styles.pageTitle}>{assignment.title}</h1>
              <p className={styles.pageSubtitle}>
                {ASSIGNMENT_STATUS_LABELS[assignment.status]} • ~{estimatedMinutes} минут
              </p>
            </div>
          </div>
        </div>

        <div className={styles.topbarActions}>
          <div className={styles.timerPill}>
            <FontAwesomeIcon icon={faClock} className={styles.timerPillIcon} />
            <span className={styles.timerPillValue}>{timeLabel}</span>
          </div>

          {canEdit ? (
            <>
              <button
                type="button"
                className={styles.headerDraftButton}
                disabled={submitting || uploading}
                onClick={() => {
                  void handleSubmit(false);
                }}
              >
                <FontAwesomeIcon icon={farBookmark} />
                <span>Сохранить черновик</span>
              </button>

              <button
                type="button"
                className={styles.headerSubmitButton}
                disabled={submitting || uploading}
                onClick={() => {
                  void handleSubmit(true);
                }}
              >
                <FontAwesomeIcon icon={faPaperPlane} />
                <span>{submitButtonLabel}</span>
              </button>
            </>
          ) : (
            <div className={styles.readonlyBadge}>Только просмотр</div>
          )}
        </div>
      </header>

      <div className={styles.contentScroller}>
        <div className={styles.contentInner}>
          {requestError ? (
            <div className={`${styles.notice} ${styles.noticeError}`}>
              <span className={styles.noticeText}>{requestError}</span>
              <button type="button" className={styles.noticeAction} onClick={onRefresh}>
                Обновить
              </button>
            </div>
          ) : null}

          {localError ? (
            <div className={`${styles.notice} ${styles.noticeError}`}>
              <span className={styles.noticeText}>{localError}</span>
            </div>
          ) : null}

          {latestScore !== null ? (
            <div className={`${styles.notice} ${styles.noticeSuccess}`}>Последний результат: {latestScore}/100</div>
          ) : null}

          <section className={styles.assignmentHero}>
            <div className={styles.assignmentHeroHeader}>
              <div className={styles.assignmentHeroContent}>
                <div className={styles.heroChips}>
                  <span className={styles.heroChipPrimary}>Домашка</span>
                  <span className={styles.heroChipSecondary}>{ASSIGNMENT_STATUS_LABELS[assignment.status]}</span>
                </div>
                <h2 className={styles.heroTitle}>Задание: {assignment.title}</h2>
                <p className={styles.heroDescription}>{assignmentDescription}</p>
              </div>
              <div className={styles.heroIconWrap} aria-hidden>
                <FontAwesomeIcon icon={faBookOpen} />
              </div>
            </div>

            <div className={styles.heroStatsGrid}>
              <div className={styles.heroStatCard}>
                <div className={styles.heroStatLabelRow}>
                  <FontAwesomeIcon icon={faListCheck} className={styles.heroStatBlueIcon} />
                  <span className={styles.heroStatLabel}>Всего вопросов</span>
                </div>
                <p className={styles.heroStatValue}>{totalQuestions}</p>
              </div>

              <div className={styles.heroStatCard}>
                <div className={styles.heroStatLabelRow}>
                  <FontAwesomeIcon icon={faStar} className={styles.heroStatYellowIcon} />
                  <span className={styles.heroStatLabel}>Максимум баллов</span>
                </div>
                <p className={styles.heroStatValue}>{displayMaxPoints}</p>
              </div>

              <div className={styles.heroStatCard}>
                <div className={styles.heroStatLabelRow}>
                  <FontAwesomeIcon icon={faCircleCheck} className={styles.heroStatGreenIcon} />
                  <span className={styles.heroStatLabel}>Проходной балл</span>
                </div>
                <p className={styles.heroStatValue}>{PASS_THRESHOLD_PERCENT}%</p>
              </div>

              <div className={styles.heroStatCard}>
                <div className={styles.heroStatLabelRow}>
                  <FontAwesomeIcon icon={faInfinity} className={styles.heroStatAccentIcon} />
                  <span className={styles.heroStatLabel}>Попытки</span>
                </div>
                <p className={styles.heroStatValue}>∞</p>
              </div>
            </div>
          </section>

          {showTestOnlyNotice ? (
            <div className={`${styles.notice} ${styles.noticeInfo}`}>
              Эту домашку нужно сдать через тестовые вопросы. Дополнительный текст или файлы не требуются.
            </div>
          ) : null}

          <div className={styles.mainGrid}>
            <div className={styles.questionsColumn}>
              {questionCards.length === 0 ? (
                <section className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <div className={styles.questionMeta}>
                      <h3 className={styles.questionPrompt}>В этом задании пока нет вопросов</h3>
                      <p className={styles.questionHint}>Доступны только материалы или комментарии преподавателя.</p>
                    </div>
                  </div>
                </section>
              ) : null}

              {questionCards.map((card, index) => {
                const badgeClassName =
                  card.tone === 'single'
                    ? styles.badgeSingle
                    : card.tone === 'multiple'
                      ? styles.badgeMultiple
                      : card.tone === 'short'
                        ? styles.badgeShort
                        : card.tone === 'matching'
                          ? styles.badgeMatching
                          : card.tone === 'fillWord'
                            ? styles.badgeFillWord
                            : card.tone === 'ordering'
                              ? styles.badgeOrdering
                              : card.tone === 'table'
                                ? styles.badgeTable
                                : card.tone === 'manual'
                                  ? styles.badgeInfo
                          : styles.badgeEssay;

                const promptText = card.kind === 'essay' ? card.prompt : card.question.prompt || 'Вопрос без текста';

                return (
                  <section
                    key={card.id}
                    id={`question-${index + 1}`}
                    className={styles.questionCard}
                    ref={registerQuestionRef(card.id)}
                  >
                    <div className={styles.questionHeader}>
                      <div className={styles.questionNumber}>{index + 1}</div>
                      <div className={styles.questionMeta}>
                        <div className={styles.questionTopRow}>
                          <span className={`${styles.questionTypeBadge} ${badgeClassName}`}>{card.typeLabel}</span>
                          <span className={styles.questionPoints}>• {card.points} балла</span>
                        </div>
                        <h3 className={styles.questionPrompt}>{promptText}</h3>
                        <p className={styles.questionHint}>{card.hint}</p>
                      </div>
                    </div>

                    <div className={styles.questionBody}>
                      {card.kind === 'essay' ? (
                        <>
                          <textarea
                            className={styles.essayInput}
                            value={answerText}
                            disabled={!canEditText}
                            onChange={(event) => setAnswerText(event.target.value)}
                            placeholder="Начните писать здесь..."
                          />
                          <div className={styles.essayMeta}>
                            <span>Минимум {ESSAY_MIN_WORDS} слов</span>
                            <span>{essayWordCount} / {ESSAY_MIN_WORDS} слов</span>
                          </div>
                        </>
                      ) : (
                        renderTestQuestionControls(card.question)
                      )}
                    </div>
                  </section>
                );
              })}

              {canUploadAttachments || attachments.length > 0 ? (
                <section className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <div className={styles.questionMeta}>
                      <div className={styles.questionTopRow}>
                        <span className={`${styles.questionTypeBadge} ${styles.badgeInfo}`}>Вложения</span>
                      </div>
                      <h3 className={styles.questionPrompt}>Добавьте файлы к ответу</h3>
                      <p className={styles.questionHint}>Поддерживаются форматы, настроенные преподавателем.</p>
                    </div>
                  </div>

                  <div className={styles.questionBody}>
                    <div className={styles.uploadControls}>
                      <label
                        className={`${styles.uploadButton} ${
                          !canEdit || uploading || !canUploadAttachments ? styles.uploadButtonDisabled : ''
                        }`}
                      >
                        <FontAwesomeIcon icon={faPaperclip} />
                        <span>{uploading ? 'Загрузка...' : 'Добавить файлы'}</span>
                        <input
                          className={styles.hiddenInput}
                          type="file"
                          accept={responseConfig?.attachmentAccept}
                          multiple
                          disabled={!canEdit || uploading || !canUploadAttachments}
                          onChange={(event) => {
                            void handleUploadAttachments(event.target.files);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    <div className={styles.attachmentsList}>
                      {attachments.map((item) => (
                        <div key={item.id} className={styles.attachmentRow}>
                          <a
                            href={resolveHomeworkStorageUrl(item.url)}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.attachmentInfo}
                          >
                            <span className={styles.attachmentName}>{item.fileName || item.url}</span>
                            <span className={styles.attachmentSize}>{formatFileSize(item.size)}</span>
                          </a>
                          {canEdit ? (
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => setAttachments((prev) => prev.filter((entry) => entry.id !== item.id))}
                            >
                              Удалить
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {attachments.length === 0 ? <div className={styles.emptyLine}>Файлы пока не добавлены</div> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              {canUploadVoice || voice.length > 0 ? (
                <section className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <div className={styles.questionMeta}>
                      <div className={styles.questionTopRow}>
                        <span className={`${styles.questionTypeBadge} ${styles.badgeInfo}`}>Голосовой ответ</span>
                      </div>
                      <h3 className={styles.questionPrompt}>Запишите голосовое сообщение</h3>
                      <p className={styles.questionHint}>Голосовые добавляются в ответ сразу после сохранения записи.</p>
                    </div>
                  </div>

                  <div className={styles.questionBody}>
                    <div className={styles.uploadControls}>
                      {canUploadVoice && !recording ? (
                        <button
                          type="button"
                          className={styles.recordButton}
                          disabled={!canEdit || uploading}
                          onClick={() => {
                            void startVoiceRecording();
                          }}
                        >
                          <FontAwesomeIcon icon={faMicrophone} />
                          {uploading ? 'Загрузка...' : 'Записать голосовое'}
                        </button>
                      ) : null}
                    </div>

                    {recording ? (
                      <div className={styles.recordingPanel}>
                        <div className={styles.recordingTopRow}>
                          <div className={styles.recordingHeader}>
                            <span className={styles.recordingDot} />
                            <span className={styles.recordingStatusText}>Запись голосового</span>
                          </div>
                          <div className={styles.recordingTimer}>{formatDurationMs(recordingDurationMs)}</div>
                        </div>

                        <div className={styles.waveShell}>
                          <span className={styles.waveGlow} aria-hidden />
                          <div className={styles.waveTrack} aria-live="polite">
                            {recordingSamples.length === 0 ? <span className={styles.waveBar} style={{ height: '16%' }} /> : null}
                            {recordingSamples.map((sample, sampleIndex) => (
                              <span
                                key={`recording_sample_${sampleIndex}`}
                                className={styles.waveBar}
                                style={{ height: `${Math.max(12, Math.min(100, Math.round(sample * 420)))}%` }}
                              />
                            ))}
                          </div>
                        </div>

                        <div className={styles.recordingMetaRow}>
                          <span className={styles.recordingHint}>Говорите, затем нажмите «Сохранить голосовое»</span>
                          <span className={styles.recordingLevel}>Громкость: {Math.round(Math.min(1, recordingLevel) * 100)}%</span>
                        </div>

                        <div className={styles.recordingActions}>
                          <button type="button" className={styles.cancelRecordButton} onClick={cancelVoiceRecording}>
                            Отменить запись
                          </button>
                          <button type="button" className={styles.stopRecordButton} onClick={stopVoiceRecording}>
                            Сохранить голосовое
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.attachmentsList}>
                      {voice.map((item) => (
                        <div key={item.id} className={styles.attachmentRow}>
                          <audio controls src={resolveHomeworkStorageUrl(item.url)} className={styles.voicePlayer} />
                          {canEdit ? (
                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => setVoice((prev) => prev.filter((entry) => entry.id !== item.id))}
                            >
                              Удалить
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {voice.length === 0 ? <div className={styles.emptyLine}>Голосовые пока не добавлены</div> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className={styles.submitSection}>
                <div className={styles.submitSectionContent}>
                  <h3 className={styles.submitSectionTitle}>Готовы отправить?</h3>
                  <p className={styles.submitSectionText}>
                    Проверьте все ответы перед отправкой. Вы сможете вернуться к любому вопросу до дедлайна.
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.bottomSubmitButton}
                    disabled={submitting || uploading}
                    onClick={() => {
                      void handleSubmit(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} />
                    <span>{submitButtonLabel} задание</span>
                  </button>
                ) : (
                  <div className={styles.readonlyBadge}>Ответ сейчас доступен только для просмотра</div>
                )}
              </section>
            </div>

            <aside className={styles.sidebarColumn}>
              <section className={styles.progressCard}>
                <div className={styles.sidebarTitleRow}>
                  <div className={styles.sidebarTitleIconWrap}>
                    <FontAwesomeIcon icon={faChartLine} />
                  </div>
                  <h2 className={styles.sidebarTitle}>Прогресс</h2>
                </div>

                <div className={styles.progressSummaryRow}>
                  <span className={styles.progressSummaryLabel}>Заполнено</span>
                  <span className={styles.progressSummaryValue}>
                    {completedCount} из {totalQuestions}
                  </span>
                </div>

                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
                <p className={styles.progressHint}>{progressPercent}% выполнено</p>

                <div className={styles.progressList}>
                  {questionCards.map((card, index) => {
                    const isDone = Boolean(answeredMap[card.id]);
                    return (
                      <div key={`progress_${card.id}`} className={`${styles.progressItem} ${isDone ? styles.progressItemDone : ''}`}>
                        <button
                          type="button"
                          className={styles.progressMainButton}
                          onClick={() => scrollToQuestion(card.id)}
                        >
                          <span className={styles.progressItemIndex}>
                            {isDone ? <FontAwesomeIcon icon={faCheck} /> : index + 1}
                          </span>
                          <span className={styles.progressItemLabel}>Вопрос {index + 1}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.progressJumpButton}
                          aria-label={`Перейти к вопросу ${index + 1}`}
                          onClick={() => scrollToQuestion(card.id)}
                        >
                          <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                      </div>
                    );
                  })}

                  {questionCards.length === 0 ? <div className={styles.emptyLine}>Вопросы отсутствуют</div> : null}
                </div>
              </section>

              <section className={styles.timerCard}>
                <div className={styles.sidebarTitleRow}>
                  <div className={styles.timerIconWrap}>
                    <FontAwesomeIcon icon={faClock} />
                  </div>
                  <h3 className={styles.sidebarTitle}>Оставшееся время</h3>
                </div>

                <div className={styles.timerBody}>
                  <p className={styles.timerValue}>{timeLabel}</p>
                  <p className={styles.timerNote}>{timeHint}</p>
                </div>

                <div className={styles.timerTrack}>
                  <div className={styles.timerFill} style={{ width: `${timeProgressPercent}%` }} />
                </div>
              </section>

              <section className={styles.helpCard}>
                <div className={styles.sidebarTitleRow}>
                  <div className={styles.helpIconWrap}>
                    <FontAwesomeIcon icon={faLightbulb} />
                  </div>
                  <h3 className={styles.sidebarTitle}>Подсказки</h3>
                </div>

                <div className={styles.tipList}>
                  {tips.map((tip, index) => (
                    <div key={`${tip.title}_${index}`} className={styles.tipItem}>
                      <p className={styles.tipKicker}>{tip.title}</p>
                      <p className={styles.tipText}>{tip.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              {materialAttachments.length > 0 ? (
                <section className={styles.materialsCard}>
                  <div className={styles.sidebarTitleRow}>
                    <div className={styles.sidebarTitleIconWrap}>
                      <FontAwesomeIcon icon={faPaperclip} />
                    </div>
                    <h3 className={styles.sidebarTitle}>Материалы</h3>
                  </div>

                  <div className={styles.materialList}>
                    {materialAttachments.map((item) => {
                      const isPdf = isPdfAttachment(item);
                      return (
                        <a
                          key={item.id}
                          href={resolveHomeworkStorageUrl(item.url)}
                          className={styles.materialLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className={`${styles.materialIcon} ${isPdf ? styles.materialPdfIcon : styles.materialLinkIcon}`}>
                            <FontAwesomeIcon icon={isPdf ? faFilePdf : faLink} />
                          </span>
                          <span className={styles.materialContent}>
                            <span className={styles.materialTitle}>{item.fileName || 'Файл'}</span>
                            <span className={styles.materialMeta}>{formatFileSize(item.size)}</span>
                          </span>
                          <span className={styles.materialAction}>
                            <FontAwesomeIcon icon={isPdf ? faDownload : faArrowUpRightFromSquare} />
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className={styles.deadlineCard}>
                <div className={styles.deadlineRow}>
                  <span>Дедлайн</span>
                  <strong>{formatDateTime(assignment.deadlineAt)}</strong>
                </div>
                <div className={styles.deadlineRow}>
                  <span>Отправлено</span>
                  <strong>{formatDateTime(assignment.sentAt)}</strong>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
};
