import { FC, useMemo } from 'react';
import { HomeworkBlockTest, HomeworkTestQuestion } from '../../../../entities/types';
import { FormValidationIssue, FormValidationPath } from '../../../../shared/lib/form-validation/types';
import {
  HomeworkClipboardQuestionIcon,
  HomeworkCopyIcon,
  HomeworkGripVerticalIcon,
  HomeworkPlusIcon,
  HomeworkTrashIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { createHomeworkBlockId, createTestBlock } from '../../model/lib/blocks';
import {
  CreateQuestionKind,
  createQuestionByKind,
  getQuestionKind,
  isQuestionMultipleChoice,
  setQuestionKind,
  toggleQuestionMultipleChoice,
} from '../../model/lib/createTemplateScreen';
import { resolveQuestionKindPresentation } from '../../model/lib/assignmentCreateScreen';
import { pathToKey } from '../../../../shared/lib/form-validation/path';
import styles from './AssignmentQuestionsSection.module.css';

interface AssignmentQuestionsSectionProps {
  testBlock: HomeworkBlockTest | null;
  testBlockPath: FormValidationPath | null;
  getIssueForPath: (path: FormValidationPath) => FormValidationIssue | null;
  onFieldEdit: (path: FormValidationPath) => void;
  onTestBlockChange: (nextBlock: HomeworkBlockTest) => void;
}

const QUESTION_KIND_OPTIONS: Array<{ value: CreateQuestionKind; label: string }> = [
  { value: 'CHOICE', label: 'Выбор' },
  { value: 'SHORT_TEXT', label: 'Короткий текст' },
  { value: 'LONG_TEXT', label: 'Длинный текст' },
  { value: 'AUDIO', label: 'Аудио' },
  { value: 'FILE', label: 'Файл' },
  { value: 'FILL_WORD', label: 'Заполнить пропуски' },
  { value: 'MATCHING', label: 'Сопоставление' },
  { value: 'ORDERING', label: 'Порядок' },
  { value: 'TABLE', label: 'Таблица' },
];

const cloneQuestion = (question: HomeworkTestQuestion): HomeworkTestQuestion => {
  const kind = getQuestionKind(question);
  const cloned = JSON.parse(JSON.stringify(question)) as HomeworkTestQuestion;
  cloned.id = createHomeworkBlockId();

  if (cloned.options) {
    const previousToNext = new Map<string, string>();
    cloned.options = cloned.options.map((option) => {
      const nextId = createHomeworkBlockId();
      previousToNext.set(option.id, nextId);
      return { ...option, id: nextId };
    });
    cloned.correctOptionIds = (cloned.correctOptionIds ?? [])
      .map((optionId) => previousToNext.get(optionId) ?? null)
      .filter((value): value is string => Boolean(value));
  }

  if (cloned.matchingPairs) {
    cloned.matchingPairs = cloned.matchingPairs.map((pair) => ({ ...pair, id: createHomeworkBlockId() }));
  }

  if (cloned.orderingItems) {
    cloned.orderingItems = cloned.orderingItems.map((item) => ({ ...item, id: createHomeworkBlockId() }));
  }

  if (cloned.table?.rows) {
    cloned.table = {
      ...cloned.table,
      rows: cloned.table.rows.map((row) => ({ ...row, id: createHomeworkBlockId() })),
    };
  }

  return setQuestionKind(cloned, kind);
};

export const AssignmentQuestionsSection: FC<AssignmentQuestionsSectionProps> = ({
  testBlock,
  testBlockPath,
  getIssueForPath,
  onFieldEdit,
  onTestBlockChange,
}) => {
  const questions = useMemo(() => testBlock?.questions ?? [], [testBlock]);
  const totalPoints = useMemo(
    () => questions.reduce((sum, question) => sum + (Number.isFinite(Number(question.points)) ? Number(question.points) : 0), 0),
    [questions],
  );

  const commitQuestions = (nextQuestions: HomeworkTestQuestion[]) => {
    const base = testBlock ?? createTestBlock();
    onTestBlockChange({
      ...base,
      questions: nextQuestions,
    });
  };

  const updateQuestion = (questionIndex: number, updater: (question: HomeworkTestQuestion) => HomeworkTestQuestion) => {
    commitQuestions(questions.map((question, index) => (index === questionIndex ? updater(question) : question)));
  };

  const addQuestion = (kind: CreateQuestionKind = 'CHOICE') => {
    commitQuestions([...questions, createQuestionByKind(kind)]);
  };

  const promptPath = (index: number): FormValidationPath => (testBlockPath ? [...testBlockPath, 'questions', index, 'prompt'] : ['questions', index, 'prompt']);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Вопросы</h2>
          <p className={styles.subtitle}>
            {questions.length} вопроса • {totalPoints} баллов
          </p>
        </div>

        <button type="button" className={styles.addButton} onClick={() => addQuestion('CHOICE')}>
          <HomeworkPlusIcon size={12} />
          <span>Добавить</span>
        </button>
      </div>

      <div className={styles.questionsList}>
        {questions.map((question, index) => {
          const presentation = resolveQuestionKindPresentation(question);
          const currentPromptPath = promptPath(index);
          const promptError = getIssueForPath(currentPromptPath)?.message ?? null;

          return (
            <article key={question.id} className={styles.questionCard}>
              <div className={styles.questionTop}>
                <div className={styles.dragHandle}>
                  <HomeworkGripVerticalIcon size={14} />
                </div>

                <div className={styles.questionMain}>
                  <div className={styles.questionMetaRow}>
                    <div className={styles.questionMetaLeft}>
                      <span className={styles.questionIndex}>{index + 1}</span>
                      <select
                        className={`${styles.typeSelect} ${styles[`tone_${presentation.tone}`]}`}
                        value={presentation.kind}
                        onChange={(event) =>
                          updateQuestion(index, (currentQuestion) =>
                            setQuestionKind(currentQuestion, event.target.value as CreateQuestionKind),
                          )
                        }
                      >
                        {QUESTION_KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.questionActions}>
                      <label className={styles.pointsField}>
                        <input
                          type="number"
                          min={0}
                          value={question.points ?? ''}
                          onChange={(event) =>
                            updateQuestion(index, (currentQuestion) => ({
                              ...currentQuestion,
                              points: event.target.value ? Number(event.target.value) : null,
                            }))
                          }
                        />
                        <span>балла</span>
                      </label>

                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => commitQuestions(questions.filter((_, questionIndex) => questionIndex !== index))}
                        aria-label={`Удалить вопрос ${index + 1}`}
                      >
                        <HomeworkTrashIcon size={12} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() =>
                          commitQuestions([
                            ...questions.slice(0, index + 1),
                            cloneQuestion(question),
                            ...questions.slice(index + 1),
                          ])
                        }
                        aria-label={`Дублировать вопрос ${index + 1}`}
                      >
                        <HomeworkCopyIcon size={12} />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    className={`${styles.promptInput} ${promptError ? styles.promptInputError : ''}`}
                    value={question.prompt}
                    placeholder="Введите вопрос..."
                    data-validation-path={pathToKey(currentPromptPath)}
                    onChange={(event) => {
                      onFieldEdit(currentPromptPath);
                      updateQuestion(index, (currentQuestion) => ({
                        ...currentQuestion,
                        prompt: event.target.value,
                      }));
                    }}
                  />
                  {promptError ? <p className={styles.errorText}>{promptError}</p> : null}

                  {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && (
                    <div className={styles.choiceList}>
                      <label className={styles.inlineCheckbox}>
                        <input
                          type="checkbox"
                          checked={isQuestionMultipleChoice(question)}
                          onChange={(event) =>
                            updateQuestion(index, (currentQuestion) =>
                              toggleQuestionMultipleChoice(currentQuestion, event.target.checked),
                            )
                          }
                        />
                        Несколько правильных вариантов
                      </label>

                      {(question.options ?? []).map((option) => {
                        const checked = (question.correctOptionIds ?? []).includes(option.id);
                        return (
                          <div key={option.id} className={styles.choiceRow}>
                            <input
                              type={question.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                              checked={checked}
                              name={`question-${question.id}-correct`}
                              onChange={(event) =>
                                updateQuestion(index, (currentQuestion) => {
                                  const currentCorrect = currentQuestion.correctOptionIds ?? [];
                                  if (currentQuestion.type === 'MULTIPLE_CHOICE') {
                                    return {
                                      ...currentQuestion,
                                      correctOptionIds: event.target.checked
                                        ? [...currentCorrect, option.id]
                                        : currentCorrect.filter((item) => item !== option.id),
                                    };
                                  }
                                  return {
                                    ...currentQuestion,
                                    correctOptionIds: event.target.checked ? [option.id] : [],
                                  };
                                })
                              }
                            />
                            <input
                              type="text"
                              className={styles.choiceInput}
                              value={option.text}
                              placeholder="Вариант ответа"
                              onChange={(event) =>
                                updateQuestion(index, (currentQuestion) => ({
                                  ...currentQuestion,
                                  options: (currentQuestion.options ?? []).map((currentOption) =>
                                    currentOption.id === option.id ? { ...currentOption, text: event.target.value } : currentOption,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className={styles.optionDelete}
                              onClick={() =>
                                updateQuestion(index, (currentQuestion) => ({
                                  ...currentQuestion,
                                  options: (currentQuestion.options ?? []).filter((currentOption) => currentOption.id !== option.id),
                                  correctOptionIds: (currentQuestion.correctOptionIds ?? []).filter((item) => item !== option.id),
                                }))
                              }
                              aria-label="Удалить вариант"
                            >
                              <HomeworkTrashIcon size={11} />
                            </button>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          updateQuestion(index, (currentQuestion) => ({
                            ...currentQuestion,
                            options: [...(currentQuestion.options ?? []), { id: createHomeworkBlockId(), text: '' }],
                          }))
                        }
                      >
                        <HomeworkPlusIcon size={11} />
                        Добавить вариант
                      </button>
                    </div>
                  )}

                  {(presentation.kind === 'SHORT_TEXT' || presentation.kind === 'LONG_TEXT') && (
                    <div className={styles.answerPreview}>
                      <p>Пример ответа:</p>
                      <textarea readOnly rows={presentation.kind === 'LONG_TEXT' ? 4 : 3} placeholder="Ученик введет текст здесь..." />
                    </div>
                  )}

                  {(presentation.kind === 'AUDIO' || presentation.kind === 'FILE') && (
                    <div className={styles.answerPreview}>
                      <p>{presentation.kind === 'AUDIO' ? 'Ученик запишет голосовой ответ' : 'Ученик загрузит файл'}</p>
                    </div>
                  )}

                  {presentation.kind === 'FILL_WORD' && (
                    <>
                      <div className={styles.answerPreview}>
                        <textarea
                          rows={4}
                          value={question.fillInTheBlankText ?? ''}
                          placeholder="Например: She [___] to Paris twice."
                          onChange={(event) =>
                            updateQuestion(index, (currentQuestion) => ({
                              ...currentQuestion,
                              fillInTheBlankText: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className={styles.inlineChecks}>
                        <label className={styles.inlineCheckbox}>
                          <input
                            type="checkbox"
                            checked={Boolean(question.caseSensitive)}
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                caseSensitive: event.target.checked,
                              }))
                            }
                          />
                          Учитывать регистр
                        </label>
                        <label className={styles.inlineCheckbox}>
                          <input
                            type="checkbox"
                            checked={Boolean(question.allowPartialCredit)}
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                allowPartialCredit: event.target.checked,
                              }))
                            }
                          />
                          Частичный балл
                        </label>
                      </div>
                    </>
                  )}

                  {presentation.kind === 'MATCHING' && (
                    <div className={styles.simpleList}>
                      {(question.matchingPairs ?? []).map((pair) => (
                        <div key={pair.id} className={styles.matchRow}>
                          <input
                            type="text"
                            value={pair.left}
                            placeholder="Левая часть"
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                matchingPairs: (currentQuestion.matchingPairs ?? []).map((currentPair) =>
                                  currentPair.id === pair.id ? { ...currentPair, left: event.target.value } : currentPair,
                                ),
                              }))
                            }
                          />
                          <input
                            type="text"
                            value={pair.right}
                            placeholder="Правая часть"
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                matchingPairs: (currentQuestion.matchingPairs ?? []).map((currentPair) =>
                                  currentPair.id === pair.id ? { ...currentPair, right: event.target.value } : currentPair,
                                ),
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {presentation.kind === 'ORDERING' && (
                    <div className={styles.simpleList}>
                      {(question.orderingItems ?? []).map((item) => (
                        <input
                          key={item.id}
                          type="text"
                          value={item.text}
                          placeholder="Элемент порядка"
                          onChange={(event) =>
                            updateQuestion(index, (currentQuestion) => ({
                              ...currentQuestion,
                              orderingItems: (currentQuestion.orderingItems ?? []).map((currentItem) =>
                                currentItem.id === item.id ? { ...currentItem, text: event.target.value } : currentItem,
                              ),
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}

                  {presentation.kind === 'TABLE' && question.table ? (
                    <div className={styles.tableWrap}>
                      <div className={styles.tableHeaderRow}>
                        <input
                          type="text"
                          value={question.table.leadHeader}
                          placeholder="Левая колонка"
                          onChange={(event) =>
                            updateQuestion(index, (currentQuestion) => ({
                              ...currentQuestion,
                              table: currentQuestion.table
                                ? { ...currentQuestion.table, leadHeader: event.target.value }
                                : currentQuestion.table,
                            }))
                          }
                        />
                        {question.table.answerHeaders.map((header, headerIndex) => (
                          <input
                            key={`${question.id}-header-${headerIndex}`}
                            type="text"
                            value={header}
                            placeholder={`Колонка ${headerIndex + 1}`}
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                table: currentQuestion.table
                                  ? {
                                      ...currentQuestion.table,
                                      answerHeaders: currentQuestion.table.answerHeaders.map((currentHeader, currentIndex) =>
                                        currentIndex === headerIndex ? event.target.value : currentHeader,
                                      ),
                                    }
                                  : currentQuestion.table,
                              }))
                            }
                          />
                        ))}
                      </div>
                      {question.table.rows.map((row) => (
                        <div key={row.id} className={styles.tableHeaderRow}>
                          <input
                            type="text"
                            value={row.lead}
                            placeholder="Строка"
                            onChange={(event) =>
                              updateQuestion(index, (currentQuestion) => ({
                                ...currentQuestion,
                                table: currentQuestion.table
                                  ? {
                                      ...currentQuestion.table,
                                      rows: currentQuestion.table.rows.map((currentRow) =>
                                        currentRow.id === row.id ? { ...currentRow, lead: event.target.value } : currentRow,
                                      ),
                                    }
                                  : currentQuestion.table,
                              }))
                            }
                          />
                          {row.answers.map((answer, answerIndex) => (
                            <input
                              key={`${row.id}-${answerIndex}`}
                              type="text"
                              value={answer}
                              placeholder="Ответ"
                              onChange={(event) =>
                                updateQuestion(index, (currentQuestion) => ({
                                  ...currentQuestion,
                                  table: currentQuestion.table
                                    ? {
                                        ...currentQuestion.table,
                                        rows: currentQuestion.table.rows.map((currentRow) =>
                                          currentRow.id === row.id
                                            ? {
                                                ...currentRow,
                                                answers: currentRow.answers.map((currentAnswer, currentIndex) =>
                                                  currentIndex === answerIndex ? event.target.value : currentAnswer,
                                                ),
                                              }
                                            : currentRow,
                                        ),
                                      }
                                    : currentQuestion.table,
                                }))
                              }
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {questions.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <HomeworkClipboardQuestionIcon size={18} />
            </span>
            <p>Пока нет вопросов. Добавьте первый вопрос для домашнего задания.</p>
          </div>
        ) : null}

        <button type="button" className={styles.addGhostButton} onClick={() => addQuestion('CHOICE')}>
          <HomeworkPlusIcon size={12} />
          Добавить вопрос
        </button>
      </div>
    </section>
  );
};
