import { FC, useMemo } from 'react';
import { ru } from 'date-fns/locale';
import type {
  HomeworkAssignment,
  HomeworkBlock,
  HomeworkBlockMedia,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkGroupListItem,
  HomeworkTemplate,
  HomeworkTestQuestion,
} from '../../../../entities/types';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import { useTimeZone } from '../../../../shared/lib/timezoneContext';
import { resolveHomeworkStorageUrl } from '../../../homework-submit/model/upload';
import type { HomeworkEditorDraft } from '../../model/types';
import { extractEstimatedMinutes, getQuestionKind } from '../../model/lib/createTemplateScreen';
import {
  HomeworkAlignLeftIcon,
  HomeworkBookOpenIcon,
  HomeworkCalendarDayIcon,
  HomeworkCircleInfoIcon,
  HomeworkClockIcon,
  HomeworkFileArrowUpIcon,
  HomeworkFileLinesIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkPaperPlaneIcon,
  HomeworkPlayIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentReadOnlyScreen.module.css';

interface AssignmentReadOnlyScreenProps {
  draft: HomeworkEditorDraft;
  assignment?: HomeworkAssignment | null;
  students: Array<{ id: number; name: string }>;
  groups: HomeworkGroupListItem[];
  templates: HomeworkTemplate[];
  previewDisabled: boolean;
  showCancelIssueAction?: boolean;
  cancelIssueSubmitting?: boolean;
  onOpenPreview: () => void;
  onCancelIssue?: () => void;
  onBack: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  TEST: 'Тест',
  WRITTEN: 'Письменное задание',
  ORAL: 'Устный ответ',
  FILE: 'Файл',
  COMBO: 'Комбинированное задание',
  EXTERNAL: 'Внешняя ссылка',
};

const QUESTION_KIND_LABELS: Record<string, string> = {
  CHOICE: 'Выбор ответа',
  SHORT_TEXT: 'Короткий ответ',
  LONG_TEXT: 'Развернутый ответ',
  AUDIO: 'Аудиоответ',
  FILE: 'Файл',
  FILL_WORD: 'Заполнить пропуск',
  MATCHING: 'Сопоставление',
  ORDERING: 'Порядок',
  TABLE: 'Таблица',
};

const formatDateTime = (value: string | null | undefined, timeZone: string) => {
  if (!value) return 'Не указано';
  try {
    return formatInTimeZone(value, 'd MMMM yyyy, HH:mm', { timeZone, locale: ru });
  } catch {
    return 'Не указано';
  }
};

const resolveQuestionLabel = (question: HomeworkTestQuestion) =>
  QUESTION_KIND_LABELS[getQuestionKind(question)] ?? 'Вопрос';

const resolveResponseFormats = (block: HomeworkBlockStudentResponse) =>
  [
    block.allowText ? 'Текст' : null,
    block.allowFiles ? 'Файлы' : null,
    block.allowPhotos ? 'Фото' : null,
    block.allowDocuments ? 'Документы' : null,
    block.allowAudio ? 'Аудио' : null,
    block.allowVideo ? 'Видео' : null,
    block.allowVoice ? 'Голос' : null,
  ].filter(Boolean) as string[];

const renderQuestionBody = (question: HomeworkTestQuestion) => {
  const kind = getQuestionKind(question);

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    return (
      <ul className={styles.answerList}>
        {(question.options ?? []).map((option) => (
          <li key={option.id} className={styles.answerListItem}>
            {option.text || 'Вариант без текста'}
          </li>
        ))}
      </ul>
    );
  }

  if (kind === 'FILL_WORD') {
    return <p className={styles.questionMetaText}>{question.fillInTheBlankText || 'Текст с пропусками не заполнен'}</p>;
  }

  if (kind === 'MATCHING') {
    return (
      <div className={styles.pairList}>
        {(question.matchingPairs ?? []).map((pair) => (
          <div key={pair.id} className={styles.pairRow}>
            <span>{pair.left || 'Левая часть не заполнена'}</span>
            <span className={styles.pairDivider}>↔</span>
            <span>{pair.right || 'Правая часть не заполнена'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'ORDERING') {
    return (
      <ol className={styles.answerListOrdered}>
        {(question.orderingItems ?? []).map((item) => (
          <li key={item.id} className={styles.answerListItem}>
            {item.text || 'Элемент порядка не заполнен'}
          </li>
        ))}
      </ol>
    );
  }

  if (kind === 'TABLE' && question.table) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.questionTable}>
          <thead>
            <tr>
              <th>{question.table.leadHeader || 'Колонка'}</th>
              {question.table.answerHeaders.map((header, index) => (
                <th key={`${header}_${index}`}>{header || `Колонка ${index + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {question.table.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.lead || '—'}</td>
                {row.answers.map((answer, index) => (
                  <td key={`${row.id}_${index}`}>{answer || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p className={styles.questionMetaText}>
      {kind === 'AUDIO'
        ? 'Ученик отвечает голосом.'
        : kind === 'FILE'
          ? 'Ученик прикладывает файл.'
          : kind === 'LONG_TEXT'
            ? 'Ожидается развернутый письменный ответ.'
            : 'Ожидается короткий письменный ответ.'}
    </p>
  );
};

const MaterialsSection: FC<{ block: HomeworkBlockMedia }> = ({ block }) => {
  const attachments = block.attachments ?? [];

  if (attachments.length === 0) {
    return <p className={styles.emptyState}>Материалы не добавлены.</p>;
  }

  return (
    <div className={styles.materialsList}>
      {attachments.map((attachment) => {
        const href = resolveHomeworkStorageUrl(attachment.url);
        return (
          <a
            key={attachment.id}
            className={styles.materialCard}
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            <div className={styles.materialCardIcon}>
              <HomeworkLinkIcon size={14} />
            </div>
            <div className={styles.materialCardBody}>
              <strong>{attachment.fileName || 'Материал'}</strong>
              <span>{attachment.url}</span>
            </div>
          </a>
        );
      })}
    </div>
  );
};

const QuestionsSection: FC<{ block: HomeworkBlockTest }> = ({ block }) => {
  if (!block.questions.length) {
    return <p className={styles.emptyState}>Вопросы пока не добавлены.</p>;
  }

  return (
    <div className={styles.questionsList}>
      {block.questions.map((question, index) => (
        <article key={question.id} className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <div>
              <span className={styles.questionIndex}>Вопрос {index + 1}</span>
              <h4 className={styles.questionTitle}>{question.prompt || 'Вопрос без текста'}</h4>
            </div>
            <div className={styles.questionMetaBadges}>
              <span className={styles.questionKindBadge}>{resolveQuestionLabel(question)}</span>
              <span className={styles.questionPointsBadge}>
                {(() => {
                  const raw = Number(question.points);
                  const resolved = Number.isFinite(raw) && raw > 0 ? raw : 1;
                  return `${resolved} б.`;
                })()}
              </span>
            </div>
          </div>
          {renderQuestionBody(question)}
          {question.explanation ? <p className={styles.questionExplanation}>{question.explanation}</p> : null}
        </article>
      ))}
    </div>
  );
};

const ResponseSection: FC<{ block: HomeworkBlockStudentResponse }> = ({ block }) => {
  const formats = resolveResponseFormats(block);

  return (
    <div className={styles.responseFormats}>
      {formats.length > 0 ? (
        formats.map((format) => (
          <span key={format} className={styles.responseChip}>
            {format}
          </span>
        ))
      ) : (
        <p className={styles.emptyState}>Форматы ответа не настроены.</p>
      )}
    </div>
  );
};

export const AssignmentReadOnlyScreen: FC<AssignmentReadOnlyScreenProps> = ({
  draft,
  assignment = null,
  students,
  groups,
  templates,
  previewDisabled,
  showCancelIssueAction = false,
  cancelIssueSubmitting = false,
  onOpenPreview,
  onCancelIssue,
  onBack,
}) => {
  const timeZone = useTimeZone();
  const studentName = assignment?.studentName ?? students.find((item) => item.id === draft.assignment.studentId)?.name ?? 'Не выбран';
  const groupTitle = assignment?.groupTitle ?? groups.find((item) => item.id === draft.assignment.groupId)?.title ?? 'Без группы';
  const templateTitle =
    assignment?.templateTitle ?? templates.find((item) => item.id === draft.assignment.sourceTemplateId)?.title ?? 'Без базовой домашки';
  const estimatedMinutes = extractEstimatedMinutes(draft.template.level);
  const blocks = draft.blocks;
  const testBlock = blocks.find((block): block is HomeworkBlockTest => block.type === 'TEST') ?? null;
  const mediaBlock = blocks.find((block): block is HomeworkBlockMedia => block.type === 'MEDIA') ?? null;
  const responseBlock = blocks.find((block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE') ?? null;
  const descriptionBlock = blocks.find((block): block is HomeworkBlock & { type: 'TEXT'; content: string } => block.type === 'TEXT') ?? null;
  const summaryCards = useMemo(
    () => [
      {
        id: 'student',
        label: 'Ученик',
        value: studentName,
        icon: <HomeworkCircleInfoIcon size={14} />,
      },
      {
        id: 'deadline',
        label: 'Дедлайн',
        value: formatDateTime(draft.assignment.deadlineAt, timeZone),
        icon: <HomeworkCalendarDayIcon size={14} />,
      },
      {
        id: 'send_mode',
        label: 'Выдача',
        value:
          draft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'
            ? `Автоматически после урока${assignment?.lessonStartAt ? ` · ${formatDateTime(assignment.lessonStartAt, timeZone)}` : ''}`
            : draft.assignment.sendMode === 'SCHEDULED'
              ? `По расписанию${draft.assignment.scheduledFor ? ` · ${formatDateTime(draft.assignment.scheduledFor, timeZone)}` : ''}`
            : 'Вручную',
        icon: <HomeworkPaperPlaneIcon size={14} />,
      },
      {
        id: 'template',
        label: 'Источник',
        value: templateTitle,
        icon: <HomeworkFileLinesIcon size={14} />,
      },
      {
        id: 'group',
        label: 'Группа',
        value: groupTitle,
        icon: <HomeworkLayerGroupIcon size={14} />,
      },
      {
        id: 'time',
        label: 'Примерное время',
        value: estimatedMinutes ? `${estimatedMinutes} мин` : 'Не указано',
        icon: <HomeworkClockIcon size={14} />,
      },
    ],
    [
      assignment?.lessonStartAt,
      draft.assignment.deadlineAt,
      draft.assignment.scheduledFor,
      draft.assignment.sendMode,
      estimatedMinutes,
      groupTitle,
      studentName,
      templateTitle,
      timeZone,
    ],
  );

  return (
    <section className={styles.page}>
      <div className={styles.heroCard}>
        <div className={styles.heroMain}>
          <div className={styles.heroBadgeRow}>
            <span className={styles.statusBadge}>{assignment?.status ?? 'Выдана'}</span>
            {assignment?.lateState === 'LATE' ? <span className={styles.lateBadge}>Сдано после срока</span> : null}
          </div>
          <h1 className={styles.title}>{draft.title || 'Домашнее задание без названия'}</h1>
          <p className={styles.subtitle}>
            Домашка открыта в режиме просмотра. Пока она выдана ученику или находится в работе, её содержимое нельзя менять.
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.typeBadge}>{TYPE_LABELS[draft.template.selectedType] ?? 'Домашнее задание'}</span>
            {draft.template.subject ? <span className={styles.metaChip}>{draft.template.subject}</span> : null}
            {draft.template.tagsText
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
              .map((tag) => (
                <span key={tag} className={styles.metaChipMuted}>
                  {tag}
                </span>
              ))}
          </div>
        </div>

        <div className={styles.heroActions}>
          <button type="button" className={styles.secondaryButton} onClick={onBack}>
            Назад к списку
          </button>
          <button type="button" className={styles.previewButton} onClick={onOpenPreview} disabled={previewDisabled}>
            <HomeworkPlayIcon size={13} />
            Предпросмотр ученика
          </button>
          {showCancelIssueAction ? (
            <button
              type="button"
              className={styles.cancelIssueButton}
              onClick={onCancelIssue}
              disabled={cancelIssueSubmitting}
            >
              <HomeworkPaperPlaneIcon size={13} />
              {cancelIssueSubmitting ? 'Отменяю выдачу…' : 'Отменить выдачу'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>
                <HomeworkCircleInfoIcon size={15} />
              </span>
              <div>
                <h2>Описание задания</h2>
                <p>То, что увидит ученик при выполнении.</p>
              </div>
            </div>
            <div className={styles.copyBlock}>
              {descriptionBlock?.content?.trim() ? descriptionBlock.content : 'Описание не заполнено.'}
            </div>
          </section>

          {testBlock ? (
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <HomeworkListCheckIcon size={15} />
                </span>
                <div>
                  <h2>{testBlock.title || 'Вопросы'}</h2>
                  <p>{testBlock.questions.length} вопрос(ов) в задании.</p>
                </div>
              </div>
              <QuestionsSection block={testBlock} />
            </section>
          ) : null}

          {mediaBlock ? (
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <HomeworkBookOpenIcon size={15} />
                </span>
                <div>
                  <h2>Материалы</h2>
                  <p>Файлы и ссылки, прикреплённые к домашке.</p>
                </div>
              </div>
              <MaterialsSection block={mediaBlock} />
            </section>
          ) : null}

          {responseBlock ? (
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>
                  <HomeworkFileArrowUpIcon size={15} />
                </span>
                <div>
                  <h2>Формат ответа ученика</h2>
                  <p>Какие варианты ответа разрешены в этой домашке.</p>
                </div>
              </div>
              <ResponseSection block={responseBlock} />
            </section>
          ) : null}
        </div>

        <aside className={styles.sidebarColumn}>
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>
                <HomeworkCircleInfoIcon size={15} />
              </span>
              <div>
                <h2>Параметры выдачи</h2>
                <p>Текущие настройки assignment без режима редактирования.</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              {summaryCards.map((card) => (
                <div key={card.id} className={styles.summaryCard}>
                  <div className={styles.summaryCardLabel}>
                    {card.icon}
                    <span>{card.label}</span>
                  </div>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>
                <HomeworkAlignLeftIcon size={15} />
              </span>
              <div>
                <h2>Почему нельзя редактировать</h2>
                <p>Чтобы задание не менялось, пока ученик уже выполняет его.</p>
              </div>
            </div>
            <div className={styles.ruleList}>
              <p>Содержимое домашки фиксируется сразу после выдачи ученику.</p>
              <p>Так исключаются конфликты между уже начатой попыткой и новой версией задания.</p>
              <p>Если нужно изменить домашку, сначала верните её в черновик через «Отменить выдачу».</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};
