import { FC, Fragment, ReactNode, useMemo } from 'react';
import { HomeworkBlockTest, HomeworkTestQuestion } from '../../../../entities/types';
import {
  HomeworkAlignLeftIcon,
  HomeworkArrowDown19Icon,
  HomeworkArrowsLeftRightIcon,
  HomeworkClipboardQuestionIcon,
  HomeworkFileArrowUpIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkSpellCheckIcon,
  HomeworkTableCellsIcon,
  HomeworkTextWidthIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { getQuestionKind } from '../../model/lib/createTemplateScreen';
import { resolveQuestionKindPresentation } from '../../model/lib/assignmentCreateScreen';
import styles from './AssignmentQuestionsReadOnlySection.module.css';

interface AssignmentQuestionsReadOnlySectionProps {
  testBlock: HomeworkBlockTest | null;
}

const QUESTION_KIND_ICONS: Record<string, ReactNode> = {
  CHOICE: <HomeworkListCheckIcon size={14} />,
  SHORT_TEXT: <HomeworkTextWidthIcon size={14} />,
  LONG_TEXT: <HomeworkAlignLeftIcon size={14} />,
  AUDIO: <HomeworkMicrophoneIcon size={14} />,
  FILE: <HomeworkFileArrowUpIcon size={14} />,
  FILL_WORD: <HomeworkSpellCheckIcon size={14} />,
  MATCHING: <HomeworkArrowsLeftRightIcon size={14} />,
  ORDERING: <HomeworkArrowDown19Icon size={14} />,
  TABLE: <HomeworkTableCellsIcon size={14} />,
};

const formatQuestionPoints = (value: number | null | undefined) => {
  // Если баллы не заданы явно — считаем дефолтный 1 балл, как в buildTemplateCreateStats
  // (TEA-21: без этого totalPoints в шапке и в списке показывают разные цифры).
  const resolved = Number.isFinite(value) && value !== null && value > 0 ? Math.round(value as number) : 1;
  const mod10 = resolved % 10;
  const mod100 = resolved % 100;
  if (mod10 === 1 && mod100 !== 11) return `${resolved} балл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${resolved} балла`;
  return `${resolved} баллов`;
};

const formatQuestionCount = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} вопроса`;
  return `${count} вопросов`;
};

const formatPointsSummary = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} балл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} балла`;
  return `${count} баллов`;
};

const countFillInBlanks = (value: string) => (value.match(/\[___\]/g) ?? []).length;

const renderFillWordPrompt = (value: string) => {
  const normalized = value.trim();
  const blanksCount = countFillInBlanks(normalized);
  const segments = normalized ? normalized.split('[___]') : [];

  if (!normalized || blanksCount === 0) {
    return <p className={styles.helperText}>{normalized || 'Текст с пропусками пока не заполнен.'}</p>;
  }

  return (
    <div className={styles.fillWordPrompt}>
      {segments.map((segment, index) => (
        <Fragment key={`fill_segment_${index}`}>
          {segment ? <span>{segment}</span> : null}
          {index < blanksCount ? <span className={styles.fillWordBlank}>......</span> : null}
        </Fragment>
      ))}
    </div>
  );
};

const renderQuestionBody = (question: HomeworkTestQuestion) => {
  const kind = getQuestionKind(question);

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const markerClassName =
      question.type === 'MULTIPLE_CHOICE' ? styles.choiceMarkerCheckbox : styles.choiceMarkerRadio;

    return (
      <div className={styles.choiceList}>
        {(question.options ?? []).map((option) => (
          <div key={option.id} className={styles.choiceRow}>
            <span className={`${styles.choiceMarker} ${markerClassName}`} aria-hidden />
            <span>{option.text.trim() || 'Вариант без текста'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'SHORT_TEXT') {
    return (
      <div className={styles.answerShell}>
        <span className={styles.answerShellLabel}>Ответ ученика</span>
        <div className={styles.answerShellInput}>Короткий текстовый ответ</div>
      </div>
    );
  }

  if (kind === 'LONG_TEXT') {
    return (
      <div className={styles.answerShell}>
        <span className={styles.answerShellLabel}>Ответ ученика</span>
        <div className={`${styles.answerShellInput} ${styles.answerShellTextarea}`}>
          Развернутый письменный ответ
        </div>
      </div>
    );
  }

  if (kind === 'AUDIO') {
    return (
      <div className={styles.answerShell}>
        <span className={styles.answerShellLabel}>Формат ответа</span>
        <div className={styles.answerShellInput}>Голосовое сообщение ученика</div>
      </div>
    );
  }

  if (kind === 'FILE') {
    return (
      <div className={styles.answerShell}>
        <span className={styles.answerShellLabel}>Формат ответа</span>
        <div className={styles.answerShellInput}>Загрузка файла, фото или документа</div>
      </div>
    );
  }

  if (kind === 'FILL_WORD') {
    return renderFillWordPrompt(question.fillInTheBlankText || question.prompt);
  }

  if (kind === 'MATCHING') {
    const pairs = question.matchingPairs ?? [];
    return (
      <div className={styles.matchingGrid}>
        <div className={styles.matchingColumn}>
          <span className={styles.matchingLabel}>Колонка A</span>
          {pairs.map((pair) => (
            <div key={`${pair.id}_left`} className={styles.matchingItem}>
              {pair.left.trim() || 'Пустой элемент'}
            </div>
          ))}
        </div>
        <div className={styles.matchingColumn}>
          <span className={styles.matchingLabel}>Колонка B</span>
          {pairs.map((pair) => (
            <div key={`${pair.id}_right`} className={styles.matchingItem}>
              {pair.right.trim() || 'Пустой элемент'}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'ORDERING') {
    return (
      <div className={styles.orderingList}>
        {(question.orderingItems ?? []).map((item, index) => (
          <div key={item.id} className={styles.orderingRow}>
            <span className={styles.orderingIndex}>{index + 1}</span>
            <span>{item.text.trim() || 'Элемент без текста'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'TABLE' && question.table) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
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
                <th>{row.lead || '—'}</th>
                {question.table?.answerHeaders.map((_, index) => (
                  <td key={`${row.id}_${index}`}>
                    <span className={styles.tableCellPlaceholder}>Ответ</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p className={styles.helperText}>Вопрос отображается в стандартном режиме ученика.</p>;
};

export const AssignmentQuestionsReadOnlySection: FC<AssignmentQuestionsReadOnlySectionProps> = ({
  testBlock,
}) => {
  const questions = useMemo(() => testBlock?.questions ?? [], [testBlock?.questions]);
  const totalPoints = useMemo(
    () =>
      questions.reduce((sum, question) => {
        const raw = Number(question.points);
        if (!Number.isFinite(raw) || raw <= 0) return sum + 1;
        return sum + raw;
      }, 0),
    [questions],
  );

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{testBlock?.title?.trim() || 'Вопросы'}</h2>
          <p className={styles.subtitle}>
            {formatQuestionCount(questions.length)} • {formatPointsSummary(totalPoints)}
          </p>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <HomeworkClipboardQuestionIcon size={16} />
          </span>
          <div>
            <strong>Вопросы пока не добавлены</strong>
            <p>Когда они появятся, здесь отобразится тот же поток, что увидит ученик.</p>
          </div>
        </div>
      ) : (
        <div className={styles.questionsList}>
          {questions.map((question, index) => {
            const presentation = resolveQuestionKindPresentation(question);
            const questionKind = getQuestionKind(question);

            return (
              <article key={question.id} className={styles.questionCard}>
                <div className={styles.questionMetaRow}>
                  <div className={styles.questionMetaLeft}>
                    <span className={styles.questionIndex}>Вопрос {index + 1}</span>
                    <span className={`${styles.kindBadge} ${styles[`tone_${presentation.tone}`]}`}>
                      <span className={styles.kindBadgeIcon}>{QUESTION_KIND_ICONS[questionKind]}</span>
                      <span>{presentation.label}</span>
                    </span>
                  </div>

                  <span className={styles.pointsBadge}>{formatQuestionPoints(question.points)}</span>
                </div>

                <h3 className={styles.questionPrompt}>{question.prompt.trim() || 'Вопрос без текста'}</h3>
                {renderQuestionBody(question)}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
