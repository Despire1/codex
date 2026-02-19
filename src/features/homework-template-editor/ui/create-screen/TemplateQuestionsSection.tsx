import { FC, ReactNode, useEffect, useMemo, useState } from 'react';
import { HomeworkBlockTest, HomeworkTestQuestion, HomeworkTestTableConfig } from '../../../../entities/types';
import { pathToKey } from '../../../../shared/lib/form-validation/path';
import { FormValidationIssue, FormValidationPath } from '../../../../shared/lib/form-validation/types';
import { createHomeworkBlockId } from '../../model/lib/blocks';
import {
  CreateQuestionKind,
  createQuestionByKind,
  getQuestionKind,
  isQuestionMultipleChoice,
  setQuestionRequired,
  toggleQuestionMultipleChoice,
} from '../../model/lib/createTemplateScreen';
import {
  HomeworkAlignLeftIcon,
  HomeworkArrowDown19Icon,
  HomeworkArrowsLeftRightIcon,
  HomeworkCheckIcon,
  HomeworkChevronDownIcon,
  HomeworkCopyIcon,
  HomeworkFileArrowUpIcon,
  HomeworkGripVerticalIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPlusIcon,
  HomeworkSpellCheckIcon,
  HomeworkTableCellsIcon,
  HomeworkTextWidthIcon,
  HomeworkTrashIcon,
  HomeworkXMarkIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './TemplateQuestionsSection.module.css';

interface TemplateQuestionsSectionProps {
  testBlock: HomeworkBlockTest | null;
  testBlockPath: FormValidationPath | null;
  getIssueForPath: (path: FormValidationPath) => FormValidationIssue | null;
  onFieldEdit: (path: FormValidationPath) => void;
  onEnsureTestBlock: () => void;
  onTestBlockChange: (nextBlock: HomeworkBlockTest) => void;
}

type QuestionCreateOption = {
  id: CreateQuestionKind;
  title: string;
  description: string;
  icon: ReactNode;
  tone: 'blue' | 'purple' | 'indigo' | 'green' | 'orange' | 'amber' | 'cyan' | 'rose' | 'violet';
};

const QUESTION_CREATE_OPTIONS_PRIMARY: QuestionCreateOption[] = [
  {
    id: 'CHOICE',
    title: 'Множественный выбор',
    description: 'Один или несколько вариантов',
    icon: <HomeworkListCheckIcon size={15} />,
    tone: 'blue',
  },
  {
    id: 'SHORT_TEXT',
    title: 'Короткий ответ',
    description: 'Текстовое поле для ввода',
    icon: <HomeworkTextWidthIcon size={15} />,
    tone: 'purple',
  },
  {
    id: 'LONG_TEXT',
    title: 'Эссе / Длинный текст',
    description: 'Развернутый ответ',
    icon: <HomeworkAlignLeftIcon size={15} />,
    tone: 'indigo',
  },
  {
    id: 'AUDIO',
    title: 'Аудио запись',
    description: 'Голосовой ответ ученика',
    icon: <HomeworkMicrophoneIcon size={15} />,
    tone: 'green',
  },
  {
    id: 'FILE',
    title: 'Загрузка файла',
    description: 'Документ, фото или видео',
    icon: <HomeworkFileArrowUpIcon size={15} />,
    tone: 'orange',
  },
];

const QUESTION_CREATE_OPTIONS_ADVANCED: QuestionCreateOption[] = [
  {
    id: 'FILL_WORD',
    title: 'Вставить слово',
    description: 'Fill in the blank',
    icon: <HomeworkSpellCheckIcon size={15} />,
    tone: 'amber',
  },
  {
    id: 'MATCHING',
    title: 'Сопоставление',
    description: 'Matching pairs',
    icon: <HomeworkArrowsLeftRightIcon size={15} />,
    tone: 'cyan',
  },
  {
    id: 'ORDERING',
    title: 'Упорядочивание',
    description: 'Расставить по порядку',
    icon: <HomeworkArrowDown19Icon size={15} />,
    tone: 'rose',
  },
  {
    id: 'TABLE',
    title: 'Таблица',
    description: 'Заполнить таблицу',
    icon: <HomeworkTableCellsIcon size={15} />,
    tone: 'violet',
  },
];

const QUESTION_CREATE_OPTIONS: QuestionCreateOption[] = [
  ...QUESTION_CREATE_OPTIONS_PRIMARY,
  ...QUESTION_CREATE_OPTIONS_ADVANCED,
];

const resolveDropdownIconToneClass = (tone: QuestionCreateOption['tone']) => {
  if (tone === 'blue') return styles.dropdownIconBlue;
  if (tone === 'purple') return styles.dropdownIconPurple;
  if (tone === 'indigo') return styles.dropdownIconIndigo;
  if (tone === 'green') return styles.dropdownIconGreen;
  if (tone === 'orange') return styles.dropdownIconOrange;
  if (tone === 'amber') return styles.dropdownIconAmber;
  if (tone === 'cyan') return styles.dropdownIconCyan;
  if (tone === 'rose') return styles.dropdownIconRose;
  return styles.dropdownIconViolet;
};

const countFillInBlanks = (value: string) => Array.from(value.matchAll(/\[___\]/g)).length;

const normalizeAnswersLength = (answers: string[] | undefined, length: number): string[] =>
  Array.from({ length }, (_, index) => answers?.[index] ?? '');

const normalizeTableConfig = (table: HomeworkTestTableConfig): HomeworkTestTableConfig => {
  const answerColumns = Math.max(1, table.answerHeaders?.length ?? 0);
  return {
    ...table,
    answerHeaders: Array.from({ length: answerColumns }, (_, index) => table.answerHeaders?.[index] ?? ''),
    rows: (table.rows ?? []).map((row) => ({
      ...row,
      answers: normalizeAnswersLength(row.answers, answerColumns),
    })),
  };
};

const createDefaultTableConfig = (): HomeworkTestTableConfig => ({
  leadHeader: 'Левая колонка',
  answerHeaders: ['Колонка 1', 'Колонка 2'],
  rows: [
    { id: createHomeworkBlockId(), lead: '', answers: ['', ''] },
    { id: createHomeworkBlockId(), lead: '', answers: ['', ''] },
  ],
  partialCredit: true,
});

const resolveQuestionKindTitle = (kind: CreateQuestionKind) =>
  QUESTION_CREATE_OPTIONS.find((option) => option.id === kind)?.title ?? 'Вопрос';

const enforceQuestionInvariants = (question: HomeworkTestQuestion): HomeworkTestQuestion => {
  let nextQuestion = question;

  if (question.uiRequired !== true) {
    nextQuestion = setQuestionRequired(nextQuestion, true);
  }

  if (nextQuestion.type === 'MATCHING' && nextQuestion.shuffleOptions !== true) {
    nextQuestion = {
      ...nextQuestion,
      shuffleOptions: true,
    };
  }

  return nextQuestion;
};

const cloneQuestion = (question: HomeworkTestQuestion): HomeworkTestQuestion => {
  const kind = getQuestionKind(question);
  let cloned = createQuestionByKind(kind);
  cloned = {
    ...cloned,
    prompt: question.prompt,
    explanation: question.explanation ?? null,
    points: question.points ?? null,
    allowPartialCredit: question.allowPartialCredit ?? cloned.allowPartialCredit,
    caseSensitive: question.caseSensitive ?? cloned.caseSensitive,
    shuffleOptions: question.shuffleOptions ?? cloned.shuffleOptions,
  };

  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const options = (question.options ?? []).map((option) => ({
      id: createHomeworkBlockId(),
      text: option.text,
    }));
    const previousById = new Map((question.options ?? []).map((option, index) => [option.id, index]));
    const remappedCorrectOptionIds = (question.correctOptionIds ?? [])
      .map((id) => previousById.get(id))
      .filter((index): index is number => typeof index === 'number')
      .map((index) => options[index]?.id)
      .filter((id): id is string => typeof id === 'string');

    cloned = {
      ...cloned,
      options,
      correctOptionIds: remappedCorrectOptionIds,
    };
    cloned = toggleQuestionMultipleChoice(cloned, isQuestionMultipleChoice(question));
  }

  if (kind === 'FILL_WORD') {
    cloned = {
      ...cloned,
      fillInTheBlankText: question.fillInTheBlankText ?? '',
      acceptedAnswers: [...(question.acceptedAnswers ?? [])],
      caseSensitive: question.caseSensitive ?? false,
      allowPartialCredit: question.allowPartialCredit ?? true,
    };
  }

  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT') {
    cloned = {
      ...cloned,
      acceptedAnswers: [...(question.acceptedAnswers ?? [])],
    };
  }

  if (kind === 'ORDERING') {
    cloned = {
      ...cloned,
      orderingItems: (question.orderingItems ?? []).map((item) => ({
        id: createHomeworkBlockId(),
        text: item.text,
      })),
      shuffleOptions: question.shuffleOptions ?? true,
      allowPartialCredit: question.allowPartialCredit ?? false,
    };
  }

  if (kind === 'TABLE') {
    const table = normalizeTableConfig(question.table ?? createDefaultTableConfig());
    cloned = {
      ...cloned,
      table: {
        ...table,
        rows: table.rows.map((row) => ({
          id: createHomeworkBlockId(),
          lead: row.lead,
          answers: [...row.answers],
        })),
      },
      caseSensitive: question.caseSensitive ?? false,
      allowPartialCredit: question.allowPartialCredit ?? (question.table?.partialCredit ?? true),
    };
  }

  if (question.type === 'MATCHING') {
    cloned = {
      ...cloned,
      matchingPairs: (question.matchingPairs ?? []).map((pair) => ({
        id: createHomeworkBlockId(),
        left: pair.left,
        right: pair.right,
      })),
      shuffleOptions: true,
    };
  }

  return enforceQuestionInvariants({
    ...cloned,
    id: createHomeworkBlockId(),
  });
};

export const TemplateQuestionsSection: FC<TemplateQuestionsSectionProps> = ({
  testBlock,
  testBlockPath,
  getIssueForPath,
  onFieldEdit,
  onEnsureTestBlock,
  onTestBlockChange,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dragQuestionIndex, setDragQuestionIndex] = useState<number | null>(null);
  const [dragOrderingState, setDragOrderingState] = useState<{ questionId: string; itemIndex: number } | null>(null);

  const questions = testBlock?.questions ?? [];
  const questionsRootPath: FormValidationPath = [...(testBlockPath ?? ['blocks', 0]), 'questions'];
  const resolveQuestionPath = (questionIndex: number): FormValidationPath => [
    ...(testBlockPath ?? ['blocks', 0]),
    'questions',
    questionIndex,
  ];
  const resolveFieldPath = (questionIndex: number, ...segments: Array<string | number>) => [
    ...resolveQuestionPath(questionIndex),
    ...segments,
  ];
  const renderFieldError = (path: FormValidationPath) => {
    const issue = getIssueForPath(path);
    if (!issue) return null;
    return <span className={styles.fieldErrorText}>{issue.message}</span>;
  };
  const hasFieldError = (path: FormValidationPath) => Boolean(getIssueForPath(path));
  const getFieldClassName = (baseClassName: string, path: FormValidationPath) =>
    `${baseClassName} ${hasFieldError(path) ? styles.inputError : ''}`;

  useEffect(() => {
    if (!testBlock) return;
    const normalizedQuestions = testBlock.questions.map((question) => enforceQuestionInvariants(question));
    const hasChanges = normalizedQuestions.some((question, index) => question !== testBlock.questions[index]);
    if (!hasChanges) return;

    onTestBlockChange({
      ...testBlock,
      questions: normalizedQuestions,
    });
  }, [onTestBlockChange, testBlock]);

  const pointsSummary = useMemo(
    () =>
      questions.reduce((sum, question) => {
        const points = Number(question.points);
        if (!Number.isFinite(points) || points <= 0) return sum + 1;
        return sum + points;
      }, 0),
    [questions],
  );

  const updateQuestion = (questionIndex: number, updater: (question: HomeworkTestQuestion) => HomeworkTestQuestion) => {
    if (!testBlock) return;
    const nextQuestions = testBlock.questions.map((question, index) => {
      const nextQuestion = index === questionIndex ? updater(question) : question;
      return enforceQuestionInvariants(nextQuestion);
    });
    onTestBlockChange({
      ...testBlock,
      questions: nextQuestions,
    });
  };

  const reorderQuestions = (sourceIndex: number, targetIndex: number) => {
    if (!testBlock) return;
    if (sourceIndex === targetIndex) return;
    if (sourceIndex < 0 || targetIndex < 0) return;
    if (sourceIndex >= testBlock.questions.length || targetIndex >= testBlock.questions.length) return;

    const nextQuestions = [...testBlock.questions];
    const [movedQuestion] = nextQuestions.splice(sourceIndex, 1);
    nextQuestions.splice(targetIndex, 0, movedQuestion);
    onTestBlockChange({
      ...testBlock,
      questions: nextQuestions.map((question) => enforceQuestionInvariants(question)),
    });
  };

  const addQuestion = (kind: CreateQuestionKind) => {
    if (!testBlock) {
      onEnsureTestBlock();
      setDropdownOpen(false);
      return;
    }

    onFieldEdit(questionsRootPath);
    onTestBlockChange({
      ...testBlock,
      questions: [...testBlock.questions, enforceQuestionInvariants(createQuestionByKind(kind))],
    });
    setDropdownOpen(false);
  };

  const removeQuestion = (questionIndex: number) => {
    if (!testBlock) return;
    onTestBlockChange({
      ...testBlock,
      questions: testBlock.questions.filter((_, index) => index !== questionIndex),
    });
  };

  const duplicateQuestion = (questionIndex: number) => {
    if (!testBlock) return;
    const question = testBlock.questions[questionIndex];
    if (!question) return;
    const cloned = cloneQuestion(question);
    const nextQuestions = [...testBlock.questions];
    nextQuestions.splice(questionIndex + 1, 0, cloned);
    onTestBlockChange({
      ...testBlock,
      questions: nextQuestions.map((item) => enforceQuestionInvariants(item)),
    });
  };

  const toggleCorrectOption = (
    question: HomeworkTestQuestion,
    optionId: string,
    checked: boolean,
  ): HomeworkTestQuestion => {
    if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return question;

    if (question.type === 'SINGLE_CHOICE') {
      return {
        ...question,
        correctOptionIds: checked ? [optionId] : [],
      };
    }

    const previous = question.correctOptionIds ?? [];
    const next = checked ? [...previous, optionId] : previous.filter((id) => id !== optionId);
    return {
      ...question,
      correctOptionIds: next,
    };
  };

  const addChoiceOption = (question: HomeworkTestQuestion): HomeworkTestQuestion => {
    if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return question;
    return {
      ...question,
      options: [...(question.options ?? []), { id: createHomeworkBlockId(), text: '' }],
    };
  };

  const removeChoiceOption = (question: HomeworkTestQuestion, optionIndex: number): HomeworkTestQuestion => {
    if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return question;
    const options = question.options ?? [];
    if (options.length <= 2) return question;
    const removedOptionId = options[optionIndex]?.id;
    const nextOptions = options.filter((_, index) => index !== optionIndex);
    return {
      ...question,
      options: nextOptions,
      correctOptionIds: (question.correctOptionIds ?? []).filter((id) => id !== removedOptionId),
    };
  };

  const renderQuestionSpecificFields = (question: HomeworkTestQuestion, questionIndex: number) => {
    const questionKind = getQuestionKind(question);

    if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
      const isMultipleChoice = isQuestionMultipleChoice(question);
      const options = question.options ?? [];
      const canRemoveOptions = options.length > 2;
      return (
        <div
          className={styles.choiceOptionsList}
          data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'options'))}
        >
          {options.map((option, optionIndex) => {
            const isCorrect = (question.correctOptionIds ?? []).includes(option.id);
            const optionTextPath = resolveFieldPath(questionIndex, 'options', optionIndex, 'text');
            return (
              <div
                key={option.id}
                className={`${styles.choiceOptionRow} ${canRemoveOptions ? '' : styles.choiceOptionRowLocked}`}
              >
                <label className={styles.choiceControl}>
                  <input
                    type={isMultipleChoice ? 'checkbox' : 'radio'}
                    checked={isCorrect}
                    onChange={(event) =>
                      {
                        onFieldEdit(resolveFieldPath(questionIndex, 'correctOptionIds'));
                        updateQuestion(questionIndex, (previousQuestion) =>
                          toggleCorrectOption(previousQuestion, option.id, event.target.checked),
                        );
                      }
                    }
                  />
                  <span className={styles.choiceMarker} />
                </label>

                <input
                  type="text"
                  className={getFieldClassName(styles.choiceInput, optionTextPath)}
                  placeholder={`Вариант ${optionIndex + 1}`}
                  value={option.text}
                  data-validation-path={pathToKey(optionTextPath)}
                  onChange={(event) =>
                    {
                      onFieldEdit(optionTextPath);
                      updateQuestion(questionIndex, (previousQuestion) => {
                        if (previousQuestion.type !== 'SINGLE_CHOICE' && previousQuestion.type !== 'MULTIPLE_CHOICE') {
                          return previousQuestion;
                        }
                        const nextOptions = [...(previousQuestion.options ?? [])];
                        nextOptions[optionIndex] = {
                          ...nextOptions[optionIndex],
                          text: event.target.value,
                        };
                        return {
                          ...previousQuestion,
                          options: nextOptions,
                        };
                      });
                    }
                  }
                />
                {renderFieldError(optionTextPath)}

                {isCorrect ? (
                  <span className={styles.correctBadge}>
                    <HomeworkCheckIcon size={10} />
                    <span>Верно</span>
                  </span>
                ) : null}

                {canRemoveOptions && !isCorrect ? (
                  <button
                    type="button"
                    className={styles.removeOptionButton}
                    onClick={() =>
                      updateQuestion(questionIndex, (previousQuestion) =>
                        removeChoiceOption(previousQuestion, optionIndex),
                      )
                    }
                  >
                    <HomeworkXMarkIcon size={11} />
                  </button>
                ) : null}
              </div>
            );
          })}
          <span
            className={styles.validationAnchor}
            data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'correctOptionIds'))}
            aria-hidden
          />
          {renderFieldError(resolveFieldPath(questionIndex, 'options'))}
          {renderFieldError(resolveFieldPath(questionIndex, 'correctOptionIds'))}

          <button
            type="button"
            className={styles.addOptionButton}
            onClick={() => {
              onFieldEdit(resolveFieldPath(questionIndex, 'options'));
              updateQuestion(questionIndex, addChoiceOption);
            }}
          >
            <HomeworkPlusIcon size={11} /> Добавить вариант
          </button>
        </div>
      );
    }

    if (questionKind === 'SHORT_TEXT') {
      return <input className={styles.shortAnswerPreview} disabled value="Текстовое поле для короткого ответа" />;
    }

    if (questionKind === 'LONG_TEXT') {
      return <textarea className={styles.longTextPreview} disabled value="Поле для развернутого ответа (эссе)" />;
    }

    if (questionKind === 'AUDIO') {
      return (
        <div className={styles.answerStub}>
          <HomeworkMicrophoneIcon size={14} />
          <span>Ученик ответит голосовым сообщением</span>
        </div>
      );
    }

    if (questionKind === 'FILE') {
      return (
        <div className={styles.answerStub}>
          <HomeworkFileArrowUpIcon size={14} />
          <span>Ученик загрузит файл в ответе</span>
        </div>
      );
    }

    if (questionKind === 'FILL_WORD') {
      const fillText = question.fillInTheBlankText ?? '';
      const blankCount = countFillInBlanks(fillText);
      const answerCount = Math.max(1, blankCount, question.acceptedAnswers?.length ?? 0);
      const answers = normalizeAnswersLength(question.acceptedAnswers, answerCount);
      const fillTextPath = resolveFieldPath(questionIndex, 'fillInTheBlankText');

      return (
        <div className={styles.complexSection}>
          <label className={styles.formLabel}>
            Текст задания
            <textarea
              className={getFieldClassName(styles.longTextPreview, fillTextPath)}
              placeholder="Используйте [___] для обозначения пропуска"
              value={fillText}
              data-validation-path={pathToKey(fillTextPath)}
              onChange={(event) =>
                {
                  onFieldEdit(fillTextPath);
                  updateQuestion(questionIndex, (previousQuestion) => {
                    const nextText = event.target.value;
                    const nextBlankCount = countFillInBlanks(nextText);
                    const nextAnswerCount = Math.max(1, nextBlankCount);
                    return {
                      ...previousQuestion,
                      fillInTheBlankText: nextText,
                      acceptedAnswers: normalizeAnswersLength(previousQuestion.acceptedAnswers, nextAnswerCount),
                    };
                  });
                }
              }
            />
            {renderFieldError(fillTextPath)}
          </label>

          <div className={styles.inlineHint}>Пример: "I [___] playing tennis" → "like"</div>

          <div className={styles.innerPanel}>
            <label className={styles.formLabel}>Правильные ответы</label>
            <div className={styles.formStack}>
              {answers.map((answer, answerIndex) => {
                const answerPath = resolveFieldPath(questionIndex, 'acceptedAnswers', answerIndex);
                return (
                  <div key={`${question.id}_blank_${answerIndex}`} className={styles.numberedFieldRow}>
                    <span className={styles.numberBadge}>{answerIndex + 1}</span>
                    <div className={styles.fieldWithError}>
                      <input
                        type="text"
                        className={getFieldClassName(styles.choiceInput, answerPath)}
                        placeholder={`Ответ для пропуска ${answerIndex + 1}`}
                        value={answer}
                        data-validation-path={pathToKey(answerPath)}
                        onChange={(event) => {
                          onFieldEdit(answerPath);
                          updateQuestion(questionIndex, (previousQuestion) => {
                            const nextAnswers = normalizeAnswersLength(previousQuestion.acceptedAnswers, answerCount);
                            nextAnswers[answerIndex] = event.target.value;
                            return {
                              ...previousQuestion,
                              acceptedAnswers: nextAnswers,
                            };
                          });
                        }}
                      />
                      {renderFieldError(answerPath)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.questionSettingsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={Boolean(question.caseSensitive)}
                onChange={(event) =>
                  updateQuestion(questionIndex, (previousQuestion) => ({
                    ...previousQuestion,
                    caseSensitive: event.target.checked,
                  }))
                }
              />
              <span>Учитывать регистр</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={question.allowPartialCredit ?? true}
                onChange={(event) =>
                  updateQuestion(questionIndex, (previousQuestion) => ({
                    ...previousQuestion,
                    allowPartialCredit: event.target.checked,
                  }))
                }
              />
              <span>Частичный балл</span>
            </label>
          </div>
        </div>
      );
    }

    if (questionKind === 'MATCHING') {
      const pairs = question.matchingPairs ?? [];
      return (
        <div
          className={styles.complexSection}
          data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'matchingPairs'))}
        >
          <div className={styles.formStack}>
            {pairs.map((pair, pairIndex) => {
              const leftPath = resolveFieldPath(questionIndex, 'matchingPairs', pairIndex, 'left');
              const rightPath = resolveFieldPath(questionIndex, 'matchingPairs', pairIndex, 'right');

              return (
                <div key={pair.id} className={styles.twoColumnRow}>
                  <div className={styles.fieldWithLabel}>
                    {pairIndex === 0 ? <label className={styles.formLabel}>Левая колонка</label> : null}
                    <input
                      type="text"
                      className={getFieldClassName(styles.choiceInput, leftPath)}
                      placeholder={`Термин ${pairIndex + 1}`}
                      value={pair.left}
                      data-validation-path={pathToKey(leftPath)}
                      onChange={(event) => {
                        onFieldEdit(leftPath);
                        updateQuestion(questionIndex, (previousQuestion) => {
                          if (previousQuestion.type !== 'MATCHING') return previousQuestion;
                          const nextPairs = [...(previousQuestion.matchingPairs ?? [])];
                          nextPairs[pairIndex] = { ...nextPairs[pairIndex], left: event.target.value };
                          return {
                            ...previousQuestion,
                            matchingPairs: nextPairs,
                          };
                        });
                      }}
                    />
                    {renderFieldError(leftPath)}
                  </div>
                  <div className={styles.fieldWithLabel}>
                    {pairIndex === 0 ? <label className={styles.formLabel}>Правая колонка</label> : null}
                    <input
                      type="text"
                      className={getFieldClassName(styles.choiceInput, rightPath)}
                      placeholder={`Определение ${pairIndex + 1}`}
                      value={pair.right}
                      data-validation-path={pathToKey(rightPath)}
                      onChange={(event) => {
                        onFieldEdit(rightPath);
                        updateQuestion(questionIndex, (previousQuestion) => {
                          if (previousQuestion.type !== 'MATCHING') return previousQuestion;
                          const nextPairs = [...(previousQuestion.matchingPairs ?? [])];
                          nextPairs[pairIndex] = { ...nextPairs[pairIndex], right: event.target.value };
                          return {
                            ...previousQuestion,
                            matchingPairs: nextPairs,
                          };
                        });
                      }}
                    />
                    {renderFieldError(rightPath)}
                  </div>
                <button
                  type="button"
                  className={styles.removeOptionButton}
                  onClick={() =>
                    updateQuestion(questionIndex, (previousQuestion) => {
                      if (previousQuestion.type !== 'MATCHING') return previousQuestion;
                      const nextPairs = (previousQuestion.matchingPairs ?? []).filter((_, index) => index !== pairIndex);
                      if (nextPairs.length < 2) return previousQuestion;
                      return {
                        ...previousQuestion,
                        matchingPairs: nextPairs,
                      };
                    })
                  }
                >
                  <HomeworkXMarkIcon size={11} />
                </button>
                </div>
              );
            })}
          </div>
          {renderFieldError(resolveFieldPath(questionIndex, 'matchingPairs'))}

          <button
            type="button"
            className={styles.addOptionButton}
            onClick={() => {
              onFieldEdit(resolveFieldPath(questionIndex, 'matchingPairs'));
              updateQuestion(questionIndex, (previousQuestion) => {
                if (previousQuestion.type !== 'MATCHING') return previousQuestion;
                return {
                  ...previousQuestion,
                  matchingPairs: [...(previousQuestion.matchingPairs ?? []), { id: createHomeworkBlockId(), left: '', right: '' }],
                };
              });
            }}
          >
            <HomeworkPlusIcon size={11} /> Добавить пару
          </button>

        </div>
      );
    }

    if (questionKind === 'ORDERING') {
      const items = question.orderingItems ?? [];
      return (
        <div
          className={styles.complexSection}
          data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'orderingItems'))}
        >
          <div className={styles.formStack}>
            {items.map((item, itemIndex) => (
              <div
                key={item.id}
                className={`${styles.sortableRow} ${
                  dragOrderingState?.questionId === question.id && dragOrderingState.itemIndex === itemIndex
                    ? styles.sortableRowDragging
                    : ''
                }`}
                onDragOver={(event) => {
                  if (!dragOrderingState || dragOrderingState.questionId !== question.id) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!dragOrderingState || dragOrderingState.questionId !== question.id) return;
                  event.preventDefault();
                  updateQuestion(questionIndex, (previousQuestion) => {
                    const previousItems = [...(previousQuestion.orderingItems ?? [])];
                    if (
                      dragOrderingState.itemIndex < 0 ||
                      dragOrderingState.itemIndex >= previousItems.length ||
                      itemIndex < 0 ||
                      itemIndex >= previousItems.length
                    ) {
                      return previousQuestion;
                    }
                    const [movedItem] = previousItems.splice(dragOrderingState.itemIndex, 1);
                    previousItems.splice(itemIndex, 0, movedItem);
                    return {
                      ...previousQuestion,
                      orderingItems: previousItems,
                    };
                  });
                  setDragOrderingState(null);
                }}
              >
                <span className={styles.numberBadge}>{itemIndex + 1}</span>
                <button
                  type="button"
                  className={styles.dragHandleButton}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setDragOrderingState({ questionId: question.id, itemIndex });
                  }}
                  onDragEnd={() => setDragOrderingState(null)}
                  aria-label="Перетащить шаг"
                >
                  <HomeworkGripVerticalIcon size={12} />
                </button>
                <input
                  type="text"
                  className={getFieldClassName(
                    styles.choiceInput,
                    resolveFieldPath(questionIndex, 'orderingItems', itemIndex, 'text'),
                  )}
                  placeholder={`Шаг ${itemIndex + 1}`}
                  value={item.text}
                  data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'orderingItems', itemIndex, 'text'))}
                  onChange={(event) =>
                    {
                      onFieldEdit(resolveFieldPath(questionIndex, 'orderingItems', itemIndex, 'text'));
                      updateQuestion(questionIndex, (previousQuestion) => {
                        const nextItems = [...(previousQuestion.orderingItems ?? [])];
                        nextItems[itemIndex] = {
                          ...nextItems[itemIndex],
                          text: event.target.value,
                        };
                        return {
                          ...previousQuestion,
                          orderingItems: nextItems,
                        };
                      });
                    }
                  }
                />
                {renderFieldError(resolveFieldPath(questionIndex, 'orderingItems', itemIndex, 'text'))}
                <button
                  type="button"
                  className={styles.removeOptionButton}
                  onClick={() =>
                    updateQuestion(questionIndex, (previousQuestion) => {
                      const nextItems = (previousQuestion.orderingItems ?? []).filter((_, index) => index !== itemIndex);
                      if (nextItems.length < 2) return previousQuestion;
                      return {
                        ...previousQuestion,
                        orderingItems: nextItems,
                      };
                    })
                  }
                >
                  <HomeworkXMarkIcon size={11} />
                </button>
              </div>
            ))}
          </div>
          {renderFieldError(resolveFieldPath(questionIndex, 'orderingItems'))}

          <button
            type="button"
            className={styles.addOptionButton}
            onClick={() => {
              onFieldEdit(resolveFieldPath(questionIndex, 'orderingItems'));
              updateQuestion(questionIndex, (previousQuestion) => ({
                ...previousQuestion,
                orderingItems: [...(previousQuestion.orderingItems ?? []), { id: createHomeworkBlockId(), text: '' }],
              }));
            }}
          >
            <HomeworkPlusIcon size={11} /> Добавить шаг
          </button>

          <div className={styles.questionSettingsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={question.shuffleOptions ?? true}
                onChange={(event) =>
                  updateQuestion(questionIndex, (previousQuestion) => ({
                    ...previousQuestion,
                    shuffleOptions: event.target.checked,
                  }))
                }
              />
              <span>Показать в случайном порядке</span>
            </label>
          </div>
        </div>
      );
    }

    if (questionKind === 'TABLE') {
      const table = normalizeTableConfig(question.table ?? createDefaultTableConfig());
      const leadHeaderPath = resolveFieldPath(questionIndex, 'table', 'leadHeader');
      return (
        <div
          className={styles.complexSection}
          data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'table'))}
        >
          {renderFieldError(resolveFieldPath(questionIndex, 'table'))}
          <div className={styles.tableToolbar}>
            <button
              type="button"
              className={styles.tableToolbarButton}
              onClick={() => {
                onFieldEdit(resolveFieldPath(questionIndex, 'table', 'answerHeaders'));
                updateQuestion(questionIndex, (previousQuestion) => {
                  const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                  const nextHeaders = [...currentTable.answerHeaders, `Колонка ${currentTable.answerHeaders.length + 1}`];
                  return {
                    ...previousQuestion,
                    table: {
                      ...currentTable,
                      answerHeaders: nextHeaders,
                      rows: currentTable.rows.map((row) => ({
                        ...row,
                        answers: [...row.answers, ''],
                      })),
                    },
                  };
                });
              }}
            >
              <HomeworkPlusIcon size={11} /> Колонка
            </button>
            <button
              type="button"
              className={styles.tableToolbarButton}
              onClick={() =>
                updateQuestion(questionIndex, (previousQuestion) => {
                  const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                  if (currentTable.answerHeaders.length <= 1) return previousQuestion;
                  const nextHeaders = currentTable.answerHeaders.slice(0, -1);
                  return {
                    ...previousQuestion,
                    table: {
                      ...currentTable,
                      answerHeaders: nextHeaders,
                      rows: currentTable.rows.map((row) => ({
                        ...row,
                        answers: row.answers.slice(0, nextHeaders.length),
                      })),
                    },
                  };
                })
              }
            >
              Убрать колонку
            </button>
          </div>
          <span
            className={styles.validationAnchor}
            data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'table', 'answerHeaders'))}
            aria-hidden
          />
          {renderFieldError(resolveFieldPath(questionIndex, 'table', 'answerHeaders'))}
          <span
            className={styles.validationAnchor}
            data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'table', 'rows'))}
            aria-hidden
          />
          {renderFieldError(resolveFieldPath(questionIndex, 'table', 'rows'))}

          <div className={styles.tableWrap}>
            <table className={styles.editorTable}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="text"
                      className={getFieldClassName(styles.tableHeaderInput, leadHeaderPath)}
                      value={table.leadHeader}
                      data-validation-path={pathToKey(leadHeaderPath)}
                      onChange={(event) => {
                        onFieldEdit(leadHeaderPath);
                        updateQuestion(questionIndex, (previousQuestion) => {
                          const currentTable = normalizeTableConfig(
                            previousQuestion.table ?? createDefaultTableConfig(),
                          );
                          return {
                            ...previousQuestion,
                            table: {
                              ...currentTable,
                              leadHeader: event.target.value,
                            },
                          };
                        });
                      }}
                    />
                    {renderFieldError(leadHeaderPath)}
                  </th>
                  {table.answerHeaders.map((header, headerIndex) => {
                    const headerPath = resolveFieldPath(questionIndex, 'table', 'answerHeaders', headerIndex);
                    return (
                      <th key={`${question.id}_header_${headerIndex}`}>
                        <input
                          type="text"
                          className={getFieldClassName(styles.tableHeaderInput, headerPath)}
                          value={header}
                          data-validation-path={pathToKey(headerPath)}
                          onChange={(event) =>
                            {
                              onFieldEdit(headerPath);
                              updateQuestion(questionIndex, (previousQuestion) => {
                                const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                                const nextHeaders = [...currentTable.answerHeaders];
                                nextHeaders[headerIndex] = event.target.value;
                                return {
                                  ...previousQuestion,
                                  table: {
                                    ...currentTable,
                                    answerHeaders: nextHeaders,
                                  },
                                };
                              });
                            }
                          }
                        />
                        {renderFieldError(headerPath)}
                      </th>
                    );
                  })}
                  <th className={styles.tableActionCell} />
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => {
                  const leadPath = resolveFieldPath(questionIndex, 'table', 'rows', rowIndex, 'lead');
                  return (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="text"
                          className={getFieldClassName(styles.tableCellInput, leadPath)}
                          value={row.lead}
                          data-validation-path={pathToKey(leadPath)}
                          onChange={(event) =>
                            {
                              onFieldEdit(leadPath);
                              updateQuestion(questionIndex, (previousQuestion) => {
                                const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                                const nextRows = [...currentTable.rows];
                                nextRows[rowIndex] = {
                                  ...nextRows[rowIndex],
                                  lead: event.target.value,
                                };
                                return {
                                  ...previousQuestion,
                                  table: {
                                    ...currentTable,
                                    rows: nextRows,
                                  },
                                };
                              });
                            }
                          }
                        />
                        {renderFieldError(leadPath)}
                      </td>
                      {table.answerHeaders.map((_, answerIndex) => {
                        const answerPath = resolveFieldPath(questionIndex, 'table', 'rows', rowIndex, 'answers', answerIndex);
                        return (
                          <td key={`${row.id}_answer_${answerIndex}`}>
                            <input
                              type="text"
                              className={getFieldClassName(styles.tableCellInput, answerPath)}
                              placeholder="Правильный ответ"
                              value={row.answers[answerIndex] ?? ''}
                              data-validation-path={pathToKey(answerPath)}
                              onChange={(event) =>
                                {
                                  onFieldEdit(answerPath);
                                  updateQuestion(questionIndex, (previousQuestion) => {
                                    const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                                    const nextRows = [...currentTable.rows];
                                    const nextAnswers = normalizeAnswersLength(nextRows[rowIndex]?.answers, currentTable.answerHeaders.length);
                                    nextAnswers[answerIndex] = event.target.value;
                                    nextRows[rowIndex] = {
                                      ...nextRows[rowIndex],
                                      answers: nextAnswers,
                                    };
                                    return {
                                      ...previousQuestion,
                                      table: {
                                        ...currentTable,
                                        rows: nextRows,
                                      },
                                    };
                                  });
                                }
                              }
                            />
                            {renderFieldError(answerPath)}
                          </td>
                        );
                      })}
                    <td className={styles.tableActionCell}>
                      <button
                        type="button"
                        className={styles.removeOptionButton}
                        onClick={() =>
                          updateQuestion(questionIndex, (previousQuestion) => {
                            const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                            if (currentTable.rows.length <= 1) return previousQuestion;
                            return {
                              ...previousQuestion,
                              table: {
                                ...currentTable,
                                rows: currentTable.rows.filter((_, index) => index !== rowIndex),
                              },
                            };
                          })
                        }
                      >
                        <HomeworkXMarkIcon size={11} />
                      </button>
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className={styles.addOptionButton}
            onClick={() => {
              onFieldEdit(resolveFieldPath(questionIndex, 'table', 'rows'));
              updateQuestion(questionIndex, (previousQuestion) => {
                const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                return {
                  ...previousQuestion,
                  table: {
                    ...currentTable,
                    rows: [
                      ...currentTable.rows,
                      {
                        id: createHomeworkBlockId(),
                        lead: '',
                        answers: Array.from({ length: currentTable.answerHeaders.length }, () => ''),
                      },
                    ],
                  },
                };
              });
            }}
          >
            <HomeworkPlusIcon size={11} /> Добавить строку
          </button>

          <div className={styles.questionSettingsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={question.allowPartialCredit ?? (question.table?.partialCredit ?? true)}
                onChange={(event) =>
                  updateQuestion(questionIndex, (previousQuestion) => {
                    const currentTable = normalizeTableConfig(previousQuestion.table ?? createDefaultTableConfig());
                    return {
                      ...previousQuestion,
                      allowPartialCredit: event.target.checked,
                      table: {
                        ...currentTable,
                        partialCredit: event.target.checked,
                      },
                    };
                  })
                }
              />
              <span>Частичный балл за строку</span>
            </label>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Вопросы</h2>
          <p className={styles.sectionSubtitle}>Добавьте вопросы для теста</p>
        </div>
        <div className={styles.dropdownWrap}>
          <button
            id="add-question-btn"
            type="button"
            className={styles.addQuestionButton}
            onClick={() => {
              if (!testBlock) {
                onEnsureTestBlock();
              }
              setDropdownOpen((prev) => !prev);
            }}
          >
            <HomeworkPlusIcon size={12} />
            <span>Добавить вопрос</span>
            <HomeworkChevronDownIcon size={11} />
          </button>

          {dropdownOpen ? (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>Выберите тип вопроса</div>
              {QUESTION_CREATE_OPTIONS_PRIMARY.map((option) => (
                <button key={option.id} type="button" className={styles.dropdownItem} onClick={() => addQuestion(option.id)}>
                  <span className={`${styles.dropdownIcon} ${resolveDropdownIconToneClass(option.tone)}`}>{option.icon}</span>
                  <span>
                    <span className={styles.dropdownTitle}>{option.title}</span>
                    <span className={styles.dropdownDescription}>{option.description}</span>
                  </span>
                </button>
              ))}
              <div className={styles.dropdownDivider} />
              {QUESTION_CREATE_OPTIONS_ADVANCED.map((option) => (
                <button key={option.id} type="button" className={styles.dropdownItem} onClick={() => addQuestion(option.id)}>
                  <span className={`${styles.dropdownIcon} ${resolveDropdownIconToneClass(option.tone)}`}>{option.icon}</span>
                  <span>
                    <span className={styles.dropdownTitle}>{option.title}</span>
                    <span className={styles.dropdownDescription}>{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {questions.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.validationAnchor} data-validation-path={pathToKey(questionsRootPath)} aria-hidden />
          <p>Пока нет вопросов. Добавьте первый вопрос из меню сверху.</p>
          {renderFieldError(questionsRootPath)}
        </div>
      ) : (
        <div className={styles.questionsList}>
          {questions.map((question, questionIndex) => {
            const questionKind = getQuestionKind(question);

            return (
              <article
                key={question.id}
                className={`${styles.questionCard} ${dragQuestionIndex === questionIndex ? styles.questionCardDragging : ''}`}
                onDragOver={(event) => {
                  if (dragQuestionIndex === null || dragQuestionIndex === questionIndex) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (dragQuestionIndex === null) return;
                  event.preventDefault();
                  reorderQuestions(dragQuestionIndex, questionIndex);
                  setDragQuestionIndex(null);
                }}
              >
                <div className={styles.questionHeader}>
                  <div className={styles.questionHeaderLeft}>
                    <button
                      type="button"
                      className={styles.dragHandleButton}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDragQuestionIndex(questionIndex);
                      }}
                      onDragEnd={() => setDragQuestionIndex(null)}
                      aria-label="Перетащить вопрос"
                    >
                      <HomeworkGripVerticalIcon size={12} />
                    </button>
                    <span className={styles.questionIndex}>
                      Вопрос {questionIndex + 1} • {resolveQuestionKindTitle(questionKind)}
                    </span>
                  </div>

                  <div className={styles.questionActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => duplicateQuestion(questionIndex)}
                      aria-label="Дублировать вопрос"
                    >
                      <HomeworkCopyIcon size={12} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => removeQuestion(questionIndex)}
                      aria-label="Удалить вопрос"
                    >
                      <HomeworkTrashIcon size={12} />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  className={getFieldClassName(styles.questionPrompt, resolveFieldPath(questionIndex, 'prompt'))}
                  placeholder="Введите текст вопроса..."
                  value={question.prompt}
                  data-validation-path={pathToKey(resolveFieldPath(questionIndex, 'prompt'))}
                  onChange={(event) => {
                    onFieldEdit(resolveFieldPath(questionIndex, 'prompt'));
                    updateQuestion(questionIndex, (previousQuestion) => ({
                      ...previousQuestion,
                      prompt: event.target.value,
                    }));
                  }}
                />
                {renderFieldError(resolveFieldPath(questionIndex, 'prompt'))}

                {renderQuestionSpecificFields(question, questionIndex)}

                <div className={styles.questionFooter}>
                  {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') ? (
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={isQuestionMultipleChoice(question)}
                        onChange={(event) =>
                          updateQuestion(questionIndex, (previousQuestion) =>
                            toggleQuestionMultipleChoice(previousQuestion, event.target.checked),
                          )
                        }
                      />
                      <span>Несколько верных ответов</span>
                    </label>
                  ) : null}
                  <label className={styles.pointsField}>
                    Баллы:
                    <input
                      type="number"
                      min={1}
                      className={styles.pointsInput}
                      value={question.points ?? 1}
                      onChange={(event) =>
                        updateQuestion(questionIndex, (previousQuestion) => ({
                          ...previousQuestion,
                          points: event.target.value ? Number(event.target.value) : 1,
                        }))
                      }
                    />
                  </label>
                </div>
              </article>
            );
          })}

          <button type="button" className={styles.bottomAddButton} onClick={() => setDropdownOpen(true)}>
            <HomeworkPlusIcon size={12} />
            <span>Добавить еще вопрос</span>
          </button>
        </div>
      )}

      <div className={styles.summary}>Максимум баллов: {pointsSummary}</div>
    </section>
  );
};
