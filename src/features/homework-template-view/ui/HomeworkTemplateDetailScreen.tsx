import { FC, Fragment, useLayoutEffect, useMemo } from 'react';
import {
  HomeworkAssignment,
  HomeworkAttachment,
  HomeworkBlock,
  HomeworkBlockMedia,
  HomeworkBlockTest,
  HomeworkTemplate,
  HomeworkTestQuestion,
} from '../../../entities/types';
import { canTeacherEditHomeworkTemplate } from '../../../entities/homework-template/model/lib/workflow';
import { readHomeworkTemplateQuizSettingsFromBlocks } from '../../../entities/homework-template/model/lib/quizSettings';
import {
  formatAssignmentStatus,
  resolveAssignmentStudentAvatarColor,
  resolveAssignmentStudentAvatarTextColor,
} from '../../../widgets/homeworks/teacher/model/lib/assignmentPresentation';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { resolveHomeworkStorageUrl } from '../../homework-submit/model/upload';
import { extractEstimatedMinutes, getQuestionKind } from '../../homework-template-editor/model/lib/createTemplateScreen';
import {
  clearHomeworkTemplateDetailTopbarState,
  publishHomeworkTemplateDetailTopbarState,
} from '../model/lib/homeworkTemplateDetailTopbarBridge';
import {
  HomeworkArrowLeftIcon,
  HomeworkArrowUpRightFromSquareIcon,
  HomeworkBellRegularIcon,
  HomeworkCalendarDayIcon,
  HomeworkChartLineIcon,
  HomeworkCheckIcon,
  HomeworkCircleInfoIcon,
  HomeworkClockIcon,
  HomeworkCopyIcon,
  HomeworkDownloadIcon,
  HomeworkEyeIcon,
  HomeworkFileAudioIcon,
  HomeworkFileImageIcon,
  HomeworkFilePdfIcon,
  HomeworkFileWordIcon,
  HomeworkHourglassHalfIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkPaperPlaneIcon,
  HomeworkPaperclipIcon,
  HomeworkPenToSquareIcon,
  HomeworkPrintIcon,
  HomeworkRobotIcon,
  HomeworkSlidersIcon,
  HomeworkXMarkIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import { useIsDesktop } from '../../../shared/lib/useIsDesktop';
import styles from './HomeworkTemplateDetailScreen.module.css';

interface HomeworkTemplateDetailScreenProps {
  homework: HomeworkTemplate;
  assignments: HomeworkAssignment[];
  onBack: () => void;
  onEdit: () => void;
  onCreateBasedOn: () => void;
  onAssign: () => void;
  onArchive?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  CHOICE: 'Множественный выбор',
  SHORT_TEXT: 'Короткий ответ',
  LONG_TEXT: 'Развернутый ответ',
  AUDIO: 'Аудиоответ',
  FILE: 'Файл',
  FILL_WORD: 'Вставить слово',
  MATCHING: 'Сопоставление',
  ORDERING: 'Упорядочивание',
  TABLE: 'Таблица',
};

const formatDate = (value: string | null | undefined, timeZone: string, pattern = 'd MMM yyyy') => {
  if (!value) return '—';
  try {
    return formatInTimeZone(value, pattern, { timeZone });
  } catch {
    return '—';
  }
};

const formatPointsLabel = (value: number) => {
  const points = Math.max(0, Math.round(value));
  const mod10 = points % 10;
  const mod100 = points % 100;
  if (mod10 === 1 && mod100 !== 11) return `${points} балл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${points} балла`;
  return `${points} баллов`;
};

const getStudentInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'У';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const getAttachmentKind = (attachment: HomeworkAttachment) => {
  const source = `${attachment.fileName || ''} ${attachment.url || ''}`.toLowerCase();
  if (source.includes('.pdf')) return 'pdf';
  if (source.includes('.doc') || source.includes('.docx')) return 'word';
  if (source.includes('.png') || source.includes('.jpg') || source.includes('.jpeg') || source.includes('.webp')) return 'image';
  if (source.includes('.mp3') || source.includes('.wav') || source.includes('.ogg') || source.includes('.m4a')) return 'audio';
  if (source.startsWith('http')) return 'link';
  return 'file';
};

const renderAttachmentIcon = (attachment: HomeworkAttachment) => {
  const kind = getAttachmentKind(attachment);
  if (kind === 'pdf') return <HomeworkFilePdfIcon size={18} />;
  if (kind === 'word') return <HomeworkFileWordIcon size={18} />;
  if (kind === 'image') return <HomeworkFileImageIcon size={18} />;
  if (kind === 'audio') return <HomeworkFileAudioIcon size={18} />;
  if (kind === 'link') return <HomeworkLinkIcon size={18} />;
  return <HomeworkPaperclipIcon size={18} />;
};

const resolveAttachmentToneClass = (attachment: HomeworkAttachment) => {
  const kind = getAttachmentKind(attachment);
  if (kind === 'pdf') return styles.materialIcon_pdf;
  if (kind === 'word') return styles.materialIcon_word;
  if (kind === 'image') return styles.materialIcon_image;
  if (kind === 'audio') return styles.materialIcon_audio;
  if (kind === 'link') return styles.materialIcon_link;
  return styles.materialIcon_file;
};

const formatAttachmentMeta = (attachment: HomeworkAttachment) => {
  if (attachment.size && attachment.size > 0) {
    const sizeKb = attachment.size / 1024;
    if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(sizeKb))} KB`;
  }

  return attachment.url || 'Без ссылки';
};

const getUniqueNonEmptyValues = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );

const resolveIssuedDateLabel = (assignments: HomeworkAssignment[], timeZone: string) => {
  const values = getUniqueNonEmptyValues(assignments.map((assignment) => assignment.sentAt));
  if (values.length === 0) return 'Не выдано';
  if (values.length === 1) return formatDate(values[0], timeZone);
  return 'Индивидуально';
};

const resolveDeadlineLabel = (assignments: HomeworkAssignment[], timeZone: string) => {
  if (assignments.length === 0) return 'Без срока';
  const rawValues = assignments.map((assignment) => assignment.deadlineAt);
  const values = getUniqueNonEmptyValues(rawValues);
  const hasEmpty = rawValues.some((value) => !value);
  if (values.length === 0) return 'Без срока';
  if (values.length === 1 && !hasEmpty) return formatDate(values[0], timeZone);
  return 'Индивидуально';
};

const resolveCorrectAnswerSummary = (question: HomeworkTestQuestion) => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const correctIds = new Set(question.correctOptionIds ?? []);
    return (question.options ?? [])
      .filter((option) => correctIds.has(option.id) && option.text.trim().length > 0)
      .map((option) => option.text.trim());
  }

  if (question.type === 'MATCHING') {
    return (question.matchingPairs ?? [])
      .filter((pair) => pair.left.trim().length > 0 || pair.right.trim().length > 0)
      .map((pair) => `${pair.left || '—'} ↔ ${pair.right || '—'}`);
  }

  const kind = getQuestionKind(question);
  if (kind === 'FILL_WORD') {
    return (question.acceptedAnswers ?? []).map((answer) => answer.trim()).filter(Boolean);
  }

  if (kind === 'ORDERING') {
    return (question.orderingItems ?? []).map((item) => item.text.trim()).filter(Boolean);
  }

  if (kind === 'TABLE') {
    return (question.table?.rows ?? []).flatMap((row) =>
      (row.answers ?? []).map((answer, index) => `${row.lead || `Строка ${index + 1}`}: ${answer || '—'}`),
    );
  }

  return (question.acceptedAnswers ?? []).map((answer) => answer.trim()).filter(Boolean);
};

const countFillInBlanks = (value: string) => (value.match(/\[___\]/g) ?? []).length;

const resolveStudentCardPresentation = (assignment: HomeworkAssignment) => {
  const hasDraftWork =
    assignment.latestSubmissionStatus === 'DRAFT' ||
    (typeof assignment.latestSubmissionAttemptNo === 'number' && assignment.latestSubmissionAttemptNo > 0 && !assignment.latestSubmissionSubmittedAt);

  if (assignment.status === 'REVIEWED') {
    return { label: assignment.lateState === 'LATE' ? 'Сдано поздно' : 'Сдано', toneClass: styles.studentStatusSuccess };
  }

  if (assignment.status === 'SUBMITTED' || assignment.status === 'IN_REVIEW') {
    return {
      label: assignment.lateState === 'LATE' ? 'На проверке · поздно' : 'На проверке',
      toneClass: styles.studentStatusReview,
    };
  }

  if (assignment.status === 'RETURNED') {
    return { label: 'На доработке', toneClass: styles.studentStatusWarning };
  }

  if (assignment.status === 'OVERDUE') {
    return { label: 'Просрочено', toneClass: styles.studentStatusDanger };
  }

  if (assignment.status === 'SENT' && hasDraftWork) {
    return { label: 'В работе', toneClass: styles.studentStatusWarning };
  }

  if (assignment.status === 'SENT') {
    return { label: 'Не начато', toneClass: styles.studentStatusMuted };
  }

  return { label: formatAssignmentStatus(assignment), toneClass: styles.studentStatusMuted };
};

const renderFillWordTemplate = (value: string) => {
  const normalized = value.trim();
  const blanksCount = countFillInBlanks(normalized);
  const segments = normalized ? normalized.split('[___]') : [];

  if (!normalized || blanksCount === 0) {
    return <div className={styles.questionPrompt}>{normalized || 'Текст с пропусками не заполнен'}</div>;
  }

  return (
    <div className={styles.fillWordSentence}>
      {segments.map((segment, index) => (
        <Fragment key={`fill_segment_${index}`}>
          {segment ? <span>{segment}</span> : null}
          {index < blanksCount ? <span className={styles.fillWordBlank}>[___]</span> : null}
        </Fragment>
      ))}
    </div>
  );
};

const QuestionAnswerPreview: FC<{ question: HomeworkTestQuestion }> = ({ question }) => {
  const kind = getQuestionKind(question);

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const correctIds = new Set(question.correctOptionIds ?? []);
    return (
      <div className={styles.questionContentStack}>
        <div className={styles.questionPrompt}>{question.prompt || 'Вопрос без текста'}</div>
        <div className={styles.answerOptionList}>
          {(question.options ?? []).map((option) => {
            const isCorrect = correctIds.has(option.id);
            return (
              <div key={option.id} className={`${styles.answerOption} ${isCorrect ? styles.answerOptionCorrect : ''}`}>
                <span className={styles.answerOptionMarker}>{isCorrect ? <HomeworkCheckIcon size={11} /> : null}</span>
                <span className={styles.answerOptionText}>{option.text || 'Вариант без текста'}</span>
                {isCorrect ? <span className={styles.answerOptionBadge}>Правильно</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (kind === 'FILL_WORD') {
    const fillText = question.fillInTheBlankText?.trim() || question.prompt.trim();
    const answers = resolveCorrectAnswerSummary(question);
    return (
      <div className={styles.fillWordLayout}>
        {question.prompt.trim().length > 0 && fillText !== question.prompt.trim() ? (
          <div className={styles.questionPrompt}>{question.prompt.trim()}</div>
        ) : null}
        {renderFillWordTemplate(fillText)}
        <div className={styles.correctAnswersPanel}>
          <div className={styles.correctAnswersTitle}>Правильные ответы:</div>
          <div className={styles.correctAnswersList}>
            {answers.length > 0 ? (
              answers.map((answer, index) => (
                <div key={`${answer}_${index}`} className={styles.correctAnswerRow}>
                  <span className={styles.correctAnswerIndex}>{index + 1}</span>
                  <div className={styles.correctAnswerValue}>{answer}</div>
                </div>
              ))
            ) : (
              <div className={styles.answerValueMuted}>Ответы не заданы</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'MATCHING') {
    return (
      <div className={styles.questionContentStack}>
        <div className={styles.questionPrompt}>{question.prompt || 'Вопрос без текста'}</div>
        <div className={styles.matchingGrid}>
          {(question.matchingPairs ?? []).map((pair) => (
            <Fragment key={pair.id}>
              <span className={styles.matchingWord}>{pair.left || '—'}</span>
              <span className={styles.matchingDefinition}>{pair.right || '—'}</span>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'ORDERING') {
    return (
      <div className={styles.questionContentStack}>
        <div className={styles.questionPrompt}>{question.prompt || 'Вопрос без текста'}</div>
        <div className={styles.sequenceList}>
          {(question.orderingItems ?? []).map((item, index) => (
            <div key={item.id} className={styles.sequenceItem}>
              <span className={styles.sequenceIndex}>{index + 1}</span>
              <span>{item.text || 'Шаг не заполнен'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'TABLE' && question.table) {
    return (
      <div className={styles.questionContentStack}>
        <div className={styles.questionPrompt}>{question.prompt || 'Вопрос без текста'}</div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <div>{question.table.leadHeader || 'Колонка'}</div>
                </th>
                {question.table.answerHeaders.map((header, index) => (
                  <th key={`${header}_${index}`}>
                    <div>{header || `Колонка ${index + 1}`}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {question.table.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.lead || '—'}</div>
                  </td>
                  {row.answers.map((answer, index) => (
                    <td key={`${row.id}_${index}`}>
                      <div>{answer || '—'}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const answers = resolveCorrectAnswerSummary(question);
  return (
    <div className={styles.questionContentStack}>
      <div className={styles.questionPrompt}>{question.prompt || 'Вопрос без текста'}</div>
      {answers.length > 0 ? (
        <div className={styles.answerValueList}>
          {answers.map((answer, index) => (
            <div key={`${answer}_${index}`} className={styles.answerValue}>
              {answer}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.answerValueMuted}>Ответы не заданы</div>
      )}
    </div>
  );
};

const countQuestionPoints = (question: HomeworkTestQuestion) =>
  typeof question.points === 'number' && Number.isFinite(question.points) && question.points > 0 ? question.points : 0;

const countSubmittedAssignments = (assignments: HomeworkAssignment[]) =>
  assignments.filter((assignment) => assignment.status === 'SUBMITTED' || assignment.status === 'IN_REVIEW' || assignment.status === 'REVIEWED').length;

export const HomeworkTemplateDetailScreen: FC<HomeworkTemplateDetailScreenProps> = ({
  homework,
  assignments,
  onBack,
  onEdit,
  onCreateBasedOn,
  onAssign,
  onArchive,
}) => {
  const timeZone = useTimeZone();
  const isDesktop = useIsDesktop();
  const blocks = homework.blocks ?? [];
  const descriptionBlock =
    blocks.find((block): block is HomeworkBlock & { type: 'TEXT'; content: string } => block.type === 'TEXT') ?? null;
  const testBlock = blocks.find((block): block is HomeworkBlockTest => block.type === 'TEST') ?? null;
  const mediaBlock = blocks.find((block): block is HomeworkBlockMedia => block.type === 'MEDIA') ?? null;
  const quizSettings = readHomeworkTemplateQuizSettingsFromBlocks(blocks);
  const estimatedMinutes = extractEstimatedMinutes(homework.level);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'DRAFT'),
    [assignments],
  );

  const canEdit = canTeacherEditHomeworkTemplate(homework) && activeAssignments.length === 0;

  const totalPoints = useMemo(
    () => (testBlock?.questions ?? []).reduce((sum, question) => sum + countQuestionPoints(question), 0),
    [testBlock],
  );

  const tags = useMemo(
    () => homework.tags.filter((tag) => tag.trim().length > 0 && tag.trim().toLowerCase() !== '__favorite'),
    [homework.tags],
  );

  const stats = useMemo(
    () => ({
      questions: testBlock?.questions.length ?? 0,
      students: activeAssignments.length,
      submitted: countSubmittedAssignments(activeAssignments),
      maxPoints: totalPoints,
    }),
    [activeAssignments, testBlock?.questions.length, totalPoints],
  );

  const issuedDateLabel = useMemo(() => resolveIssuedDateLabel(activeAssignments, timeZone), [activeAssignments, timeZone]);
  const deadlineLabel = useMemo(() => resolveDeadlineLabel(activeAssignments, timeZone), [activeAssignments, timeZone]);
  const headerStatusLabel = canEdit ? 'Черновик' : homework.isArchived ? 'В архиве' : 'Активно';
  const headerStatusTone = canEdit ? 'draft' : homework.isArchived ? 'archived' : 'active';
  const hasAttentionDot = activeAssignments.some((assignment) =>
    assignment.status === 'RETURNED' ||
    assignment.status === 'OVERDUE' ||
    assignment.status === 'SUBMITTED' ||
    assignment.status === 'IN_REVIEW',
  );

  useLayoutEffect(() => {
    publishHomeworkTemplateDetailTopbarState({
      title: homework.title || 'Домашнее задание без названия',
      subtitle: canEdit ? 'Черновик домашнего задания' : 'Просмотр выданного задания',
      statusLabel: headerStatusLabel,
      statusTone: headerStatusTone,
      hasAttentionDot,
    });

    return () => {
      clearHomeworkTemplateDetailTopbarState();
    };
  }, [canEdit, hasAttentionDot, headerStatusLabel, headerStatusTone, homework.title]);

  return (
    <section className={styles.page}>
      {!isDesktop ? (
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerStart}>
              <button type="button" className={styles.backButton} onClick={onBack} aria-label="Назад">
                <HomeworkArrowLeftIcon size={16} />
              </button>
              <div className={styles.headerTitleWrap}>
                <h1 className={styles.title}>{homework.title || 'Домашнее задание без названия'}</h1>
                <p className={styles.subtitle}>{canEdit ? 'Черновик домашнего задания' : 'Просмотр выданного задания'}</p>
              </div>
            </div>

            <div className={styles.headerActions}>
              <span
                className={`${styles.liveBadge} ${
                  headerStatusTone === 'draft'
                    ? styles.liveBadgeDraft
                    : headerStatusTone === 'archived'
                      ? styles.liveBadgeArchived
                      : styles.liveBadgeActive
                }`}
              >
                <span className={styles.liveDot} />
                {headerStatusLabel}
              </span>
              <button type="button" className={styles.headerIconButton} aria-label="Активность по домашке">
                <HomeworkBellRegularIcon size={15} />
                {hasAttentionDot ? <span className={styles.headerIconDot} /> : null}
              </button>
              <button
                type="button"
                className={styles.headerPrintButton}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.print();
                  }
                }}
              >
                <HomeworkPrintIcon size={14} />
                <span>Печать</span>
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <div className={styles.content}>
        <div className={styles.mainColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={`${styles.cardIcon} ${styles.cardIconBlue}`}>
                <HomeworkCircleInfoIcon size={14} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Информация о задании</h2>
              </div>
            </div>

            <div className={styles.infoGrid}>
              <div className={styles.infoField}>
                <span className={styles.infoLabel}>Название задания</span>
                <div className={styles.readOnlyField}>{homework.title || 'Без названия'}</div>
              </div>
              <div className={styles.infoField}>
                <span className={styles.infoLabel}>Категория</span>
                <div className={styles.readOnlyField}>{homework.subject || 'Без категории'}</div>
              </div>
            </div>

            <div className={styles.infoField}>
              <span className={styles.infoLabel}>Описание</span>
              <div className={`${styles.readOnlyField} ${styles.readOnlyFieldMultiline}`}>
                {descriptionBlock?.content?.trim() || 'Описание не добавлено'}
              </div>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaField}>
                <span className={styles.infoLabel}>Дата выдачи</span>
                <div className={styles.metaValue}>
                  <HomeworkCalendarDayIcon size={13} />
                  <span>{issuedDateLabel}</span>
                </div>
              </div>
              <div className={styles.metaField}>
                <span className={styles.infoLabel}>Срок сдачи</span>
                <div className={styles.metaValue}>
                  <HomeworkClockIcon size={13} />
                  <span>{deadlineLabel}</span>
                </div>
              </div>
              <div className={styles.metaField}>
                <span className={styles.infoLabel}>Примерное время</span>
                <div className={styles.metaValue}>
                  <HomeworkHourglassHalfIcon size={13} />
                  <span>{estimatedMinutes ? `${estimatedMinutes} мин` : 'Не указано'}</span>
                </div>
              </div>
            </div>

            {tags.length > 0 ? (
              <div className={styles.infoField}>
                <span className={styles.infoLabel}>Теги</span>
                <div className={styles.tagList}>
                  {tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.infoField}>
              <span className={styles.infoLabel}>Выдано ученикам</span>
              {activeAssignments.length > 0 ? (
                <div className={styles.studentCards}>
                  {activeAssignments.map((assignment) => {
                    const name = assignment.studentName || assignment.studentUsername || `Ученик #${assignment.studentId}`;
                    const avatarColor = resolveAssignmentStudentAvatarColor(assignment);
                    const avatarTextColor = resolveAssignmentStudentAvatarTextColor(avatarColor);
                    const presentation = resolveStudentCardPresentation(assignment);
                    return (
                      <div key={assignment.id} className={styles.studentCard}>
                        <div className={styles.studentAvatarWrap}>
                          <div className={styles.studentAvatar} style={{ background: avatarColor, color: avatarTextColor }}>
                            {getStudentInitials(name)}
                          </div>
                        </div>
                        <div className={styles.studentMeta}>
                          <strong>{name}</strong>
                          <span className={`${styles.studentStatus} ${presentation.toneClass}`}>{presentation.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyStateBox}>
                  Пока никому не выдано. Эту домашку можно доработать или сразу отправить ученикам.
                </div>
              )}
            </div>
          </section>

          {testBlock ? (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={`${styles.cardIcon} ${styles.cardIconPurple}`}>
                  <HomeworkListCheckIcon size={14} />
                </span>
                <div>
                  <h2 className={styles.cardTitle}>Вопросы</h2>
                  <p className={styles.cardHint}>Всего {stats.questions} вопросов • {formatPointsLabel(stats.maxPoints)}</p>
                </div>
              </div>

              <div className={styles.questionList}>
                {testBlock.questions.map((question, index) => (
                  <article key={question.id} className={styles.questionCard}>
                    <div className={styles.questionCardHeader}>
                      <div className={styles.questionCardHeaderStart}>
                        <div className={styles.questionNumber}>{index + 1}</div>
                        <span className={styles.questionKindBadge}>
                          {TYPE_LABELS[getQuestionKind(question)] ?? 'Вопрос'}
                        </span>
                      </div>
                      <span className={styles.questionScoreBadge}>{formatPointsLabel(countQuestionPoints(question))}</span>
                    </div>
                    <div className={styles.questionBody}>
                      <QuestionAnswerPreview question={question} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {mediaBlock ? (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={`${styles.cardIcon} ${styles.cardIconOrange}`}>
                  <HomeworkPaperclipIcon size={14} />
                </span>
                <div>
                  <h2 className={styles.cardTitle}>Материалы</h2>
                  <p className={styles.cardHint}>Прикрепленные файлы и ссылки</p>
                </div>
              </div>

              <div className={styles.materialList}>
                {(mediaBlock.attachments ?? []).length > 0 ? (
                  mediaBlock.attachments.map((attachment) => {
                    const href = resolveHomeworkStorageUrl(attachment.url);
                    const isExternal = href.startsWith('http');
                    return (
                      <div key={attachment.id} className={styles.materialCard}>
                        <div className={`${styles.materialIcon} ${resolveAttachmentToneClass(attachment)}`}>
                          {renderAttachmentIcon(attachment)}
                        </div>
                        <div className={styles.materialBody}>
                          <strong>{attachment.fileName || 'Материал'}</strong>
                          <span>{formatAttachmentMeta(attachment)}</span>
                        </div>
                        <div className={styles.materialActions}>
                          <a className={styles.materialAction} href={href} target="_blank" rel="noreferrer" aria-label="Открыть материал">
                            {isExternal ? <HomeworkArrowUpRightFromSquareIcon size={12} /> : <HomeworkEyeIcon size={12} />}
                          </a>
                          <a className={styles.materialAction} href={href} target="_blank" rel="noreferrer" aria-label="Скачать материал">
                            {isExternal ? <HomeworkLinkIcon size={12} /> : <HomeworkDownloadIcon size={12} />}
                          </a>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyStateBox}>Материалы не прикреплены.</div>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <aside className={styles.sidebar}>
          <section className={styles.sidebarCard}>
            <div className={styles.cardHeader}>
              <span className={`${styles.cardIcon} ${styles.cardIconIndigo}`}>
                <HomeworkSlidersIcon size={14} />
              </span>
              <h2 className={styles.cardTitle}>Настройки</h2>
            </div>

            <div className={styles.settingList}>
              <div className={styles.settingRow}>
                <div className={styles.settingMeta}>
                  <span className={styles.settingMetaIcon}>
                    <HomeworkRobotIcon size={13} />
                  </span>
                  <div>
                    <strong>Автопроверка</strong>
                    <span>{quizSettings.autoCheckEnabled ? 'Включена' : 'Выключена'}</span>
                  </div>
                </div>
                <span className={`${styles.settingToggle} ${quizSettings.autoCheckEnabled ? styles.settingToggleOn : ''}`} />
              </div>

              <div className={styles.settingDivider} />

              <div className={styles.settingBlock}>
                <span className={styles.settingTitle}>Проходной балл</span>
                <div className={styles.passingCard}>
                  <div className={styles.passingHeader}>
                    <span>Минимум для прохождения</span>
                    <strong>{quizSettings.passingScorePercent}%</strong>
                  </div>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${quizSettings.passingScorePercent}%` }} />
                  </div>
                </div>
              </div>

              <div className={styles.settingDivider} />

              <div className={styles.settingBlock}>
                <span className={styles.settingTitle}>Количество попыток</span>
                <div className={styles.counterCard}>
                  <strong>{quizSettings.attemptsLimit === null ? '∞' : quizSettings.attemptsLimit}</strong>
                  <span>{quizSettings.attemptsLimit === null ? 'Неограниченно' : 'Ограничено'}</span>
                </div>
              </div>

              <div className={styles.settingDivider} />

              <div className={styles.toggleList}>
                <div className={styles.toggleRowCompact}>
                  <span>Показывать правильные ответы</span>
                  {quizSettings.showCorrectAnswers ? <HomeworkCheckIcon size={13} /> : <HomeworkXMarkIcon size={13} />}
                </div>
                <div className={styles.toggleRowCompact}>
                  <span>Перемешивать вопросы</span>
                  {quizSettings.shuffleQuestions ? <HomeworkCheckIcon size={13} /> : <HomeworkXMarkIcon size={13} />}
                </div>
                <div className={styles.toggleRowCompact}>
                  <span>Таймер</span>
                  {quizSettings.timerEnabled ? (
                    <span className={styles.timerValue}>{quizSettings.timerDurationMinutes ? `${quizSettings.timerDurationMinutes} мин` : 'Да'}</span>
                  ) : (
                    <HomeworkXMarkIcon size={13} />
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.statsCard}>
            <div className={styles.cardHeader}>
              <span className={`${styles.cardIcon} ${styles.statsIcon}`}>
                <HomeworkChartLineIcon size={14} />
              </span>
              <h2 className={styles.cardTitle}>Статистика</h2>
            </div>

            <div className={styles.statsList}>
              <div className={styles.statItem}>
                <span>Всего вопросов</span>
                <strong>{stats.questions}</strong>
              </div>
              <div className={styles.statItem}>
                <span>Максимум баллов</span>
                <strong>{stats.maxPoints}</strong>
              </div>
              <div className={styles.statItem}>
                <span>Примерное время</span>
                <strong>{estimatedMinutes ? `${estimatedMinutes}м` : '—'}</strong>
              </div>
              <div className={styles.statProgress}>
                <div className={styles.statProgressTitle}>Статус выполнения</div>
                <div className={styles.statProgressRow}>
                  <span>Сдано</span>
                  <strong>{stats.submitted}/{stats.students}</strong>
                </div>
                <div className={styles.progressTrackDark}>
                  <div
                    className={styles.progressFillDark}
                    style={{ width: `${stats.students > 0 ? (stats.submitted / stats.students) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.sidebarCard}>
            <h3 className={styles.actionsTitle}>Действия</h3>
            <div className={styles.actionList}>
              {canEdit ? (
                <button type="button" className={styles.actionButton} onClick={onEdit}>
                  <HomeworkPenToSquareIcon size={13} />
                  <span>Редактировать домашку</span>
                </button>
              ) : (
                <button type="button" className={styles.actionButton} onClick={onCreateBasedOn}>
                  <HomeworkCopyIcon size={13} />
                  <span>Создать на основе этого</span>
                </button>
              )}
              <button type="button" className={styles.actionButton} onClick={onAssign}>
                <HomeworkPaperPlaneIcon size={13} />
                <span>{activeAssignments.length > 0 ? 'Выдать еще ученикам' : 'Выдать ученикам'}</span>
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.print();
                  }
                }}
              >
                <HomeworkPrintIcon size={13} />
                <span>Напечатать карточку</span>
              </button>
              {onArchive ? (
                <button type="button" className={styles.actionButtonDanger} onClick={onArchive}>
                  <HomeworkLayerGroupIcon size={13} />
                  <span>{homework.isArchived ? 'Вернуть из архива' : 'Архивировать'}</span>
                </button>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};
