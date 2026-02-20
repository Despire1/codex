import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCheck,
  faComment,
  faClock,
  faFileLines,
  faMinus,
  faPaperclip,
  faRotateLeft,
  faUpload,
  faVolumeHigh,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import {
  HomeworkAssignment,
  HomeworkAttachment,
  HomeworkReviewDraft,
  HomeworkSubmission,
} from '../../../entities/types';
import { getLatestSubmission } from '../../../entities/homework-submission/model/lib/submissionState';
import { resolveHomeworkStorageUrl } from '../../homework-submit/model/upload';
import { buildHomeworkReviewItems, normalizeReviewPoints } from '../model/lib/questionReview';
import styles from './HomeworkReviewScreen.module.css';

interface HomeworkReviewScreenProps {
  assignment: HomeworkAssignment | null;
  submissions: HomeworkSubmission[];
  initialDraft?: HomeworkReviewDraft | null;
  loading: boolean;
  requestError: string | null;
  submitting: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onDraftChange?: (draft: HomeworkReviewDraft | null, meta: { isDirty: boolean; submissionId: number | null }) => void;
  onSubmitReview: (payload: {
    action: 'REVIEWED' | 'RETURNED';
    submissionId: number;
    autoScore: number | null;
    manualScore: number | null;
    finalScore: number | null;
    teacherComment: string | null;
  }) => Promise<boolean>;
}

const PASSING_PERCENT = 70;

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatScore = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const sanitizeComments = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, item]) => {
    if (typeof key !== 'string' || !key.trim() || typeof item !== 'string') return acc;
    acc[key] = item;
    return acc;
  }, {});
};

const sanitizeScores = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, number>;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, item]) => {
    if (typeof key !== 'string' || !key.trim()) return acc;
    const numeric = Number(item);
    if (!Number.isFinite(numeric)) return acc;
    acc[key] = numeric;
    return acc;
  }, {});
};

const areNumberMapsEqual = (left: Record<string, number>, right: Record<string, number>) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Number(right[key]) === Number(left[key]));
};

const areStringMapsEqual = (left: Record<string, string>, right: Record<string, string>) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => right[key] === left[key]);
};

const areDraftsEqual = (left: HomeworkReviewDraft | null, right: HomeworkReviewDraft | null) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.submissionId !== right.submissionId) return false;
  if (left.generalComment !== right.generalComment) return false;
  if (!areNumberMapsEqual(left.scoresById, right.scoresById)) return false;
  if (!areStringMapsEqual(left.commentsById, right.commentsById)) return false;
  return true;
};

const renderAttachmentList = (items: HomeworkAttachment[]) => {
  if (!items.length) {
    return <div className={styles.answerEmpty}>Нет файлов</div>;
  }

  return (
    <div className={styles.attachmentList}>
      {items.map((item) => (
        <a
          key={item.id}
          className={styles.attachmentLink}
          href={resolveHomeworkStorageUrl(item.url)}
          target="_blank"
          rel="noreferrer"
        >
          <FontAwesomeIcon icon={faPaperclip} />
          <span>{item.fileName || item.url}</span>
        </a>
      ))}
    </div>
  );
};

const renderVoiceList = (items: HomeworkAttachment[]) => {
  if (!items.length) {
    return <div className={styles.answerEmpty}>Нет голосовых</div>;
  }

  return (
    <div className={styles.voiceList}>
      {items.map((item) => (
        <div key={item.id} className={styles.voiceItem}>
          <div className={styles.voiceLabel}>
            <FontAwesomeIcon icon={faVolumeHigh} />
            <span>{item.fileName || 'Голосовой ответ'}</span>
          </div>
          <audio controls className={styles.voicePlayer} src={resolveHomeworkStorageUrl(item.url)} />
        </div>
      ))}
    </div>
  );
};

export const HomeworkReviewScreen: FC<HomeworkReviewScreenProps> = ({
  assignment,
  submissions,
  initialDraft = null,
  loading,
  requestError,
  submitting,
  onBack,
  onRefresh,
  onDraftChange,
  onSubmitReview,
}) => {
  const latestSubmission = useMemo(() => getLatestSubmission(submissions), [submissions]);
  const reviewItems = useMemo(() => {
    if (!assignment || !latestSubmission) return [];
    return buildHomeworkReviewItems(assignment, latestSubmission);
  }, [assignment, latestSubmission]);

  const [scoresById, setScoresById] = useState<Record<string, number>>({});
  const [commentsById, setCommentsById] = useState<Record<string, string>>({});
  const [baselineDraft, setBaselineDraft] = useState<HomeworkReviewDraft | null>(null);
  const [generalComment, setGeneralComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const draftForCurrentSubmission =
      initialDraft && latestSubmission && initialDraft.submissionId === latestSubmission.id ? initialDraft : null;
    const rawDraftScores = sanitizeScores(draftForCurrentSubmission?.scoresById);
    const initialScores = reviewItems.reduce<Record<string, number>>((acc, item) => {
      const fromDraft = rawDraftScores[item.id];
      const fallback = normalizeReviewPoints(item.initialPoints, item.maxPoints);
      if (!Number.isFinite(fromDraft)) {
        acc[item.id] = fallback;
        return acc;
      }
      acc[item.id] = normalizeReviewPoints(fromDraft, item.maxPoints);
      return acc;
    }, {});
    const rawDraftComments = sanitizeComments(draftForCurrentSubmission?.commentsById);
    const initialComments = reviewItems.reduce<Record<string, string>>((acc, item) => {
      const value = rawDraftComments[item.id];
      if (typeof value !== 'string') return acc;
      acc[item.id] = value;
      return acc;
    }, {});
    const initialGeneralComment =
      typeof draftForCurrentSubmission?.generalComment === 'string'
        ? draftForCurrentSubmission.generalComment
        : assignment?.teacherComment ?? latestSubmission?.teacherComment ?? '';

    const nextBaselineDraft =
      latestSubmission === null
        ? null
        : {
            submissionId: latestSubmission.id,
            scoresById: initialScores,
            commentsById: initialComments,
            generalComment: initialGeneralComment,
          };

    setBaselineDraft(nextBaselineDraft);
    setScoresById(initialScores);
    setCommentsById(initialComments);
    setGeneralComment(initialGeneralComment);
    setError(null);
  }, [assignment?.id, initialDraft, latestSubmission, reviewItems]);

  const currentDraft = useMemo<HomeworkReviewDraft | null>(() => {
    if (!latestSubmission) return null;

    const nextScores = reviewItems.reduce<Record<string, number>>((acc, item) => {
      const value = Number(scoresById[item.id]);
      acc[item.id] = Number.isFinite(value) ? normalizeReviewPoints(value, item.maxPoints) : 0;
      return acc;
    }, {});
    const nextComments = reviewItems.reduce<Record<string, string>>((acc, item) => {
      const value = commentsById[item.id];
      if (typeof value !== 'string') return acc;
      acc[item.id] = value;
      return acc;
    }, {});

    return {
      submissionId: latestSubmission.id,
      scoresById: nextScores,
      commentsById: nextComments,
      generalComment,
    };
  }, [commentsById, generalComment, latestSubmission, reviewItems, scoresById]);

  const draftIsDirty = useMemo(() => !areDraftsEqual(currentDraft, baselineDraft), [baselineDraft, currentDraft]);

  useEffect(() => {
    onDraftChange?.(currentDraft, {
      isDirty: draftIsDirty,
      submissionId: latestSubmission?.id ?? null,
    });
  }, [currentDraft, draftIsDirty, latestSubmission?.id, onDraftChange]);

  const maxPoints = useMemo(
    () => reviewItems.reduce((sum, item) => sum + item.maxPoints, 0),
    [reviewItems],
  );
  const earnedPoints = useMemo(
    () =>
      reviewItems.reduce((sum, item) => {
        const value = scoresById[item.id];
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [reviewItems, scoresById],
  );
  const scorePercent = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;
  const scoreTenScale = maxPoints > 0 ? Number(((earnedPoints / maxPoints) * 10).toFixed(1)) : 0;
  const autoScoreRaw = useMemo(
    () => latestSubmission?.score.autoScore ?? assignment?.score.autoScore ?? null,
    [assignment?.score.autoScore, latestSubmission?.score.autoScore],
  );

  const handleScoreChange = (itemId: string, max: number, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setScoresById((prev) => ({ ...prev, [itemId]: 0 }));
      return;
    }
    const normalized = normalizeReviewPoints(parsed, max);
    setScoresById((prev) => ({ ...prev, [itemId]: normalized }));
  };

  const buildTeacherComment = () => {
    const base = generalComment.trim();
    const details = reviewItems
      .map((item, index) => {
        const comment = commentsById[item.id]?.trim();
        if (!comment) return null;
        return `${index + 1}. ${item.prompt}: ${comment}`;
      })
      .filter((line): line is string => Boolean(line));

    if (details.length === 0) {
      return base || null;
    }

    if (!base) {
      return `Комментарии по вопросам:\n${details.join('\n')}`;
    }

    return `${base}\n\nКомментарии по вопросам:\n${details.join('\n')}`;
  };

  const submitReview = async (action: 'REVIEWED' | 'RETURNED') => {
    if (!assignment || !latestSubmission) return;
    setError(null);
    const teacherComment = buildTeacherComment();

    if (action === 'RETURNED' && !teacherComment) {
      setError('При возврате на доработку добавьте комментарий ученику.');
      return;
    }

    const success = await onSubmitReview({
      action,
      submissionId: latestSubmission.id,
      autoScore: autoScoreRaw,
      manualScore: Math.round(scoreTenScale * 10),
      finalScore: Math.round(scoreTenScale * 10),
      teacherComment,
    });

    if (!success) {
      setError('Не удалось сохранить проверку.');
      return;
    }
  };

  if (loading) {
    return (
      <section className={styles.screen}>
        <div className={styles.stateCard}>Загрузка проверки...</div>
      </section>
    );
  }

  if (requestError) {
    return (
      <section className={styles.screen}>
        <div className={styles.stateCard}>
          <p>{requestError}</p>
          <div className={styles.stateActions}>
            <button type="button" className={styles.secondaryButton} onClick={onBack}>
              Назад
            </button>
            <button type="button" className={styles.primaryButton} onClick={onRefresh}>
              Обновить
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!assignment || !latestSubmission) {
    return (
      <section className={styles.screen}>
        <div className={styles.stateCard}>
          <p>Для этой домашки пока нет попытки на проверку.</p>
          <div className={styles.stateActions}>
            <button type="button" className={styles.secondaryButton} onClick={onBack}>
              Назад
            </button>
            <button type="button" className={styles.primaryButton} onClick={onRefresh}>
              Обновить
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <div>
            <h1 className={styles.headerTitle}>Проверка: {assignment.title}</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.statusPill}>
            <FontAwesomeIcon icon={faClock} />
            <span>На проверке</span>
          </div>
          <button
            type="button"
            className={styles.secondaryHeaderButton}
            onClick={() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            <FontAwesomeIcon icon={faComment} />
            <span>Комментарий</span>
          </button>
          <button
            type="button"
            className={styles.primaryHeaderButton}
            disabled={submitting}
            onClick={() => {
              void submitReview('REVIEWED');
            }}
          >
            <FontAwesomeIcon icon={faUpload} />
            <span>{submitting ? 'Сохраняем...' : 'Завершить проверку'}</span>
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.mainColumn}>
          <section className={styles.studentCard}>
            <div className={styles.studentCardHeader}>
              <div>
                <div className={styles.studentBadgeRow}>
                  <div className={styles.studentBadge}>На проверке</div>
                  <div className={`${styles.studentBadge} ${styles.studentBadgeAttempt}`}>
                    Попытка №{latestSubmission.attemptNo}
                  </div>
                </div>
                <h2 className={styles.studentName}>
                  {assignment.studentName || assignment.studentUsername || `Ученик #${assignment.studentId}`}
                </h2>
                <p className={styles.studentMeta}>
                  Сдано: {formatDateTime(latestSubmission.submittedAt)} • Оценка будет сохранена в историю ученика
                </p>
              </div>
              <div className={styles.currentScoreCard}>
                <div className={styles.currentScoreLabel}>Текущая оценка</div>
                <div className={styles.currentScoreValue}>{formatScore(scoreTenScale)}</div>
                <div className={styles.currentScoreHint}>из 10 баллов</div>
              </div>
            </div>
          </section>

          {reviewItems.map((item, index) => {
            const currentScore = scoresById[item.id] ?? 0;
            const scoreStatusClass =
              currentScore >= item.maxPoints
                ? styles.scoreStatusCorrect
                : currentScore <= 0
                  ? styles.scoreStatusWrong
                  : styles.scoreStatusPartial;

            return (
              <article key={item.id} className={styles.questionCard}>
                <div className={styles.questionHeader}>
                  <div className={styles.questionNumber}>{index + 1}</div>
                  <div className={styles.questionMetaWrap}>
                    <div className={styles.questionTopMeta}>
                      <span className={styles.typeBadge}>{item.typeLabel}</span>
                      <span className={styles.typePoints}>• {formatScore(item.maxPoints)} балла</span>
                    </div>
                    <h3 className={styles.questionPrompt}>{item.prompt}</h3>
                    <p className={styles.questionHint}>{item.hint}</p>
                  </div>
                </div>

                <div className={styles.answerPanel}>
                  <div className={styles.answerBlock}>
                    <div className={styles.answerLabel}>Ответ ученика</div>
                    {item.kind === 'ATTACHMENTS_RESPONSE' || item.question?.uiQuestionKind === 'FILE'
                      ? renderAttachmentList(latestSubmission.attachments)
                      : null}
                    {item.kind === 'VOICE_RESPONSE' || item.question?.uiQuestionKind === 'AUDIO'
                      ? renderVoiceList(latestSubmission.voice)
                      : null}
                    {item.kind !== 'ATTACHMENTS_RESPONSE' &&
                    item.kind !== 'VOICE_RESPONSE' &&
                    item.question?.uiQuestionKind !== 'FILE' &&
                    item.question?.uiQuestionKind !== 'AUDIO' ? (
                      <div className={styles.answerText}>{item.studentAnswerSummary}</div>
                    ) : null}
                  </div>

                  {item.correctAnswerSummary ? (
                    <div className={styles.correctBlock}>
                      <div className={styles.correctLabel}>Правильный ответ</div>
                      <div className={styles.correctText}>{item.correctAnswerSummary}</div>
                    </div>
                  ) : (
                    <div className={styles.correctBlock}>
                      <div className={styles.correctLabel}>Проверка</div>
                      <div className={styles.correctText}>Требуется ручная оценка преподавателя</div>
                    </div>
                  )}
                </div>

                <div className={styles.scoringRow}>
                  <div className={styles.scoreControls}>
                    <button
                      type="button"
                      className={`${styles.scoreAction} ${styles.scoreActionSuccess}`}
                      onClick={() =>
                        setScoresById((prev) => ({
                          ...prev,
                          [item.id]: item.maxPoints,
                        }))
                      }
                    >
                      <FontAwesomeIcon icon={faCheck} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.scoreAction} ${styles.scoreActionWarning}`}
                      onClick={() =>
                        setScoresById((prev) => ({
                          ...prev,
                          [item.id]: normalizeReviewPoints(item.maxPoints / 2, item.maxPoints),
                        }))
                      }
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.scoreAction} ${styles.scoreActionDanger}`}
                      onClick={() =>
                        setScoresById((prev) => ({
                          ...prev,
                          [item.id]: 0,
                        }))
                      }
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>

                    <input
                      className={`${styles.scoreInput} ${scoreStatusClass}`}
                      type="number"
                      min={0}
                      max={item.maxPoints}
                      step={0.5}
                      value={currentScore}
                      onChange={(event) => handleScoreChange(item.id, item.maxPoints, event.target.value)}
                    />
                    <span className={styles.scoreMax}>/ {formatScore(item.maxPoints)}</span>
                  </div>
                </div>

                <textarea
                  className={styles.itemComment}
                  value={commentsById[item.id] ?? ''}
                  placeholder="Комментарий по вопросу (опционально)"
                  onChange={(event) =>
                    setCommentsById((prev) => ({
                      ...prev,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </article>
            );
          })}

          <section className={styles.feedbackCard}>
            <div className={styles.feedbackHeader}>
              <div className={styles.feedbackIcon}>
                <FontAwesomeIcon icon={faFileLines} />
              </div>
              <div>
                <h3 className={styles.feedbackTitle}>Общий комментарий</h3>
                <p className={styles.feedbackHint}>Комментарий будет отправлен ученику вместе с итоговой оценкой</p>
              </div>
            </div>

            <textarea
              ref={feedbackRef}
              className={styles.feedbackArea}
              value={generalComment}
              placeholder="Отличная работа! Вы уверенно используете нужные формы Present Perfect..."
              onChange={(event) => setGeneralComment(event.target.value)}
            />

            <div className={styles.feedbackActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={submitting}
                onClick={() => {
                  void submitReview('RETURNED');
                }}
              >
                <FontAwesomeIcon icon={faRotateLeft} />
                <span>Вернуть на доработку</span>
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={submitting}
                onClick={() => {
                  void submitReview('REVIEWED');
                }}
              >
                <FontAwesomeIcon icon={faCheck} />
                <span>{submitting ? 'Сохраняем...' : 'Отправить оценку'}</span>
              </button>
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
          </section>
        </div>

        <aside className={styles.summaryColumn}>
          <section className={styles.summaryCard}>
            <h2 className={styles.summaryTitle}>Итоговая оценка</h2>
            <div className={styles.summaryScore}>
              <div className={styles.summaryScoreValue}>{formatScore(scoreTenScale)}</div>
              <div className={styles.summaryScoreHint}>из 10 баллов</div>
              <div className={styles.summaryScoreSub}>
                Набрано: {formatScore(earnedPoints)} / {formatScore(maxPoints)}
              </div>
            </div>

            <div className={styles.summaryProgressWrap}>
              <div className={styles.summaryProgressLine}>
                <div className={styles.summaryProgressValue} style={{ width: `${scorePercent}%` }} />
              </div>
              <div className={styles.summaryPercent}>{scorePercent}% выполнения</div>
            </div>

            <div className={styles.summaryItems}>
              {reviewItems.map((item, index) => {
                const value = scoresById[item.id] ?? 0;
                const itemClass =
                  value >= item.maxPoints ? styles.summaryItemSuccess : value <= 0 ? styles.summaryItemDanger : styles.summaryItemWarning;
                return (
                  <div key={`summary_${item.id}`} className={`${styles.summaryItem} ${itemClass}`}>
                    <div className={styles.summaryItemLeft}>
                      <div className={styles.summaryItemIndex}>{index + 1}</div>
                      <span className={styles.summaryItemLabel}>Вопрос {index + 1}</span>
                    </div>
                    <span className={styles.summaryItemScore}>
                      {formatScore(value)} / {formatScore(item.maxPoints)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className={styles.summaryFooter}>
              <div className={styles.summaryFooterRow}>
                <span>Проходной балл</span>
                <strong>{PASSING_PERCENT}%</strong>
              </div>
              <div className={styles.summaryProgressLine}>
                <div
                  className={`${styles.summaryProgressValue} ${
                    scorePercent >= PASSING_PERCENT ? styles.summaryProgressSuccess : styles.summaryProgressDanger
                  }`}
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
              <p
                className={`${styles.summaryResult} ${
                  scorePercent >= PASSING_PERCENT ? styles.summaryResultSuccess : styles.summaryResultDanger
                }`}
              >
                {scorePercent >= PASSING_PERCENT ? 'Порог пройден успешно' : 'Ниже проходного балла'}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};
