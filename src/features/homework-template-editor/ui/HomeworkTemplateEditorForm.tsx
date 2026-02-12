import { ChangeEvent, FC, FormEvent, useMemo } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import {
  HomeworkAttachment,
  HomeworkBlock,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkTestQuestion,
  HomeworkTestQuestionType,
} from '../../../entities/types';
import styles from './HomeworkTemplateEditorModal.module.css';
import { HomeworkTemplateEditorDraft, HomeworkTemplateEditorMode } from '../model/types';
import {
  createHomeworkBlockId,
  createMediaBlock,
  createStudentResponseBlock,
  createTestBlock,
  createTestQuestion,
  createTextBlock,
} from '../model/lib/blocks';
import {
  HOMEWORK_TEMPLATE_PRESETS,
  buildBlocksFromPreset,
  detectPresetByBlocks,
  validateTemplateDraft,
  type HomeworkTemplatePresetId,
} from '../model/lib/templateFlow';

interface HomeworkTemplateEditorFormProps {
  mode: HomeworkTemplateEditorMode;
  draft: HomeworkTemplateEditorDraft;
  submitting: boolean;
  onDraftChange: (draft: HomeworkTemplateEditorDraft) => void;
  onSubmit: () => Promise<boolean>;
  onCancel: () => void;
  onSubmitSuccess?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}

const BLOCK_TYPE_LABELS: Record<HomeworkBlock['type'], string> = {
  TEXT: 'Текст задания',
  MEDIA: 'Материалы',
  TEST: 'Тест',
  STUDENT_RESPONSE: 'Ответ ученика',
};

const BLOCK_TYPE_HINTS: Record<HomeworkBlock['type'], string> = {
  TEXT: 'Инструкции, критерии, пояснения',
  MEDIA: 'Ссылки на файлы, фото, PDF, видео',
  TEST: 'Встроенный тест с автопроверкой',
  STUDENT_RESPONSE: 'Каким способом ученик сдаст работу',
};

const QUESTION_TYPE_OPTIONS: Array<{ id: HomeworkTestQuestionType; label: string }> = [
  { id: 'SINGLE_CHOICE', label: 'Один правильный' },
  { id: 'MULTIPLE_CHOICE', label: 'Несколько правильных' },
  { id: 'SHORT_ANSWER', label: 'Короткий ответ' },
  { id: 'MATCHING', label: 'Сопоставление' },
];

type StudentResponsePresetId = 'TEXT' | 'TEXT_FILES' | 'VOICE_ONLY' | 'ALL';

const STUDENT_RESPONSE_PRESETS: Array<{ id: StudentResponsePresetId; label: string }> = [
  { id: 'TEXT', label: 'Только текст' },
  { id: 'TEXT_FILES', label: 'Текст + файлы' },
  { id: 'VOICE_ONLY', label: 'Только voice' },
  { id: 'ALL', label: 'Все форматы' },
];

const replaceQuestionType = (question: HomeworkTestQuestion, type: HomeworkTestQuestionType): HomeworkTestQuestion => {
  const template = createTestQuestion(type);
  return {
    ...template,
    id: question.id,
    prompt: question.prompt,
    explanation: question.explanation ?? null,
    points: question.points ?? null,
  };
};

const createEmptyAttachment = (): HomeworkAttachment => ({
  id: createHomeworkBlockId(),
  url: '',
  fileName: '',
  size: 0,
});

const applyStudentResponsePreset = (
  block: HomeworkBlockStudentResponse,
  presetId: StudentResponsePresetId,
): HomeworkBlockStudentResponse => {
  if (presetId === 'TEXT') {
    return {
      ...block,
      allowText: true,
      allowFiles: false,
      allowPhotos: false,
      allowDocuments: false,
      allowAudio: false,
      allowVideo: false,
      allowVoice: false,
    };
  }
  if (presetId === 'TEXT_FILES') {
    return {
      ...block,
      allowText: true,
      allowFiles: true,
      allowPhotos: true,
      allowDocuments: true,
      allowAudio: false,
      allowVideo: false,
      allowVoice: true,
    };
  }
  if (presetId === 'VOICE_ONLY') {
    return {
      ...block,
      allowText: false,
      allowFiles: false,
      allowPhotos: false,
      allowDocuments: false,
      allowAudio: false,
      allowVideo: false,
      allowVoice: true,
    };
  }
  return {
    ...block,
    allowText: true,
    allowFiles: true,
    allowPhotos: true,
    allowDocuments: true,
    allowAudio: true,
    allowVideo: true,
    allowVoice: true,
  };
};

export const HomeworkTemplateEditorForm: FC<HomeworkTemplateEditorFormProps> = ({
  mode,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onCancel,
  onSubmitSuccess,
  submitLabel,
  cancelLabel,
}) => {
  const validation = useMemo(() => validateTemplateDraft(draft), [draft]);
  const selectedPreset = useMemo(() => detectPresetByBlocks(draft.blocks), [draft.blocks]);
  const hasStudentResponseBlock = draft.blocks.some((block) => block.type === 'STUDENT_RESPONSE');

  const handleCancel = () => {
    if (submitting) return;
    onCancel();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation.errors.length > 0) return;
    const success = await onSubmit();
    if (success) onSubmitSuccess?.();
  };

  const updateBlocks = (blocks: HomeworkBlock[]) => {
    onDraftChange({
      ...draft,
      blocks,
    });
  };

  const updateBlock = (blockIndex: number, nextBlock: HomeworkBlock) => {
    updateBlocks(draft.blocks.map((block, index) => (index === blockIndex ? nextBlock : block)));
  };

  const removeBlock = (blockIndex: number) => {
    updateBlocks(draft.blocks.filter((_, index) => index !== blockIndex));
  };

  const moveBlock = (blockIndex: number, direction: -1 | 1) => {
    const nextIndex = blockIndex + direction;
    if (nextIndex < 0 || nextIndex >= draft.blocks.length) return;
    const reordered = [...draft.blocks];
    const [moved] = reordered.splice(blockIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    updateBlocks(reordered);
  };

  const addBlock = (type: HomeworkBlock['type']) => {
    if (type === 'STUDENT_RESPONSE' && hasStudentResponseBlock) return;
    const nextBlock =
      type === 'TEXT'
        ? createTextBlock()
        : type === 'MEDIA'
          ? createMediaBlock()
          : type === 'TEST'
            ? createTestBlock()
            : createStudentResponseBlock();
    updateBlocks([...draft.blocks, nextBlock]);
  };

  const applyPreset = (presetId: HomeworkTemplatePresetId) => {
    updateBlocks(buildBlocksFromPreset(presetId));
  };

  const handleDraftFieldChange =
    (field: 'title' | 'tagsText' | 'subject' | 'level') => (event: ChangeEvent<HTMLInputElement>) => {
      onDraftChange({
        ...draft,
        [field]: event.target.value,
      });
    };

  const handleStudentResponseToggle =
    (block: HomeworkBlockStudentResponse, field: keyof Omit<HomeworkBlockStudentResponse, 'id' | 'type'>) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...block, [field]: event.target.checked };
      const index = draft.blocks.findIndex((candidate) => candidate.id === block.id);
      if (index < 0) return;
      updateBlock(index, next);
    };

  const handleQuestionChange = (
    block: HomeworkBlockTest,
    questionIndex: number,
    updater: (question: HomeworkTestQuestion) => HomeworkTestQuestion,
  ) => {
    const nextQuestions = block.questions.map((question, index) => (index === questionIndex ? updater(question) : question));
    const blockIndex = draft.blocks.findIndex((candidate) => candidate.id === block.id);
    if (blockIndex < 0) return;
    updateBlock(blockIndex, { ...block, questions: nextQuestions });
  };

  const addQuestion = (block: HomeworkBlockTest, type: HomeworkTestQuestionType) => {
    const blockIndex = draft.blocks.findIndex((candidate) => candidate.id === block.id);
    if (blockIndex < 0) return;
    updateBlock(blockIndex, {
      ...block,
      questions: [...block.questions, createTestQuestion(type)],
    });
  };

  const removeQuestion = (block: HomeworkBlockTest, questionIndex: number) => {
    const blockIndex = draft.blocks.findIndex((candidate) => candidate.id === block.id);
    if (blockIndex < 0) return;
    updateBlock(blockIndex, {
      ...block,
      questions: block.questions.filter((_, index) => index !== questionIndex),
    });
  };

  const renderBlockBody = (block: HomeworkBlock, blockIndex: number) => {
    if (block.type === 'TEXT') {
      return (
        <label className={styles.fieldLabel}>
          Текст задания
          <textarea
            className={controls.textArea}
            value={block.content}
            onChange={(event) => updateBlock(blockIndex, { ...block, content: event.target.value })}
            placeholder="Опишите, что нужно сделать, критерии и что приложить"
          />
        </label>
      );
    }

    if (block.type === 'MEDIA') {
      return (
        <>
          {(block.attachments ?? []).map((attachment, attachmentIndex) => (
            <div key={attachment.id} className={styles.row}>
              <label className={styles.fieldLabel}>
                Подпись файла
                <input
                  className={controls.input}
                  value={attachment.fileName}
                  onChange={(event) => {
                    const nextAttachments = [...(block.attachments ?? [])];
                    nextAttachments[attachmentIndex] = { ...nextAttachments[attachmentIndex], fileName: event.target.value };
                    updateBlock(blockIndex, { ...block, attachments: nextAttachments });
                  }}
                  placeholder="Например: Текст для чтения"
                />
              </label>
              <label className={styles.fieldLabel}>
                Ссылка
                <input
                  className={controls.input}
                  value={attachment.url}
                  onChange={(event) => {
                    const nextAttachments = [...(block.attachments ?? [])];
                    nextAttachments[attachmentIndex] = { ...nextAttachments[attachmentIndex], url: event.target.value };
                    updateBlock(blockIndex, { ...block, attachments: nextAttachments });
                  }}
                  placeholder="https://..."
                />
              </label>
              <button
                type="button"
                className={controls.smallButton}
                onClick={() => {
                  const nextAttachments = (block.attachments ?? []).filter((_, index) => index !== attachmentIndex);
                  updateBlock(blockIndex, { ...block, attachments: nextAttachments });
                }}
              >
                Удалить
              </button>
            </div>
          ))}
          <button
            type="button"
            className={controls.secondaryButton}
            onClick={() => updateBlock(blockIndex, { ...block, attachments: [...(block.attachments ?? []), createEmptyAttachment()] })}
          >
            Добавить материал
          </button>
        </>
      );
    }

    if (block.type === 'TEST') {
      return (
        <>
          <label className={styles.fieldLabel}>
            Название теста
            <input
              className={controls.input}
              value={block.title ?? ''}
              onChange={(event) => updateBlock(blockIndex, { ...block, title: event.target.value })}
              placeholder="Например: Проверка по теме"
            />
          </label>

          <div className={styles.toolbar}>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={controls.smallButton}
                onClick={() => addQuestion(block, option.id)}
              >
                + {option.label}
              </button>
            ))}
          </div>

          {(block.questions ?? []).map((question, questionIndex) => (
            <div key={question.id} className={styles.questionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>Вопрос {questionIndex + 1}</div>
                <button
                  type="button"
                  className={controls.smallButton}
                  onClick={() => removeQuestion(block, questionIndex)}
                >
                  Удалить вопрос
                </button>
              </div>

              <div className={styles.questionMeta}>
                <label className={styles.fieldLabel}>
                  Тип
                  <select
                    className={controls.input}
                    value={question.type}
                    onChange={(event) =>
                      handleQuestionChange(block, questionIndex, (item) =>
                        replaceQuestionType(item, event.target.value as HomeworkTestQuestionType),
                      )
                    }
                  >
                    {QUESTION_TYPE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.fieldLabel}>
                  Баллы
                  <input
                    className={controls.input}
                    type="number"
                    min={1}
                    value={question.points ?? ''}
                    onChange={(event) =>
                      handleQuestionChange(block, questionIndex, (item) => ({
                        ...item,
                        points: event.target.value ? Number(event.target.value) : null,
                      }))
                    }
                  />
                </label>
              </div>

              <label className={styles.fieldLabel}>
                Формулировка вопроса
                <textarea
                  className={controls.textArea}
                  value={question.prompt}
                  onChange={(event) =>
                    handleQuestionChange(block, questionIndex, (item) => ({ ...item, prompt: event.target.value }))
                  }
                  placeholder="Например: Выберите правильный вариант"
                />
              </label>

              {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') && (
                <>
                  {(question.options ?? []).map((option, optionIndex) => (
                    <div key={option.id} className={styles.optionRow}>
                      <input
                        className={controls.input}
                        value={option.text}
                        placeholder={`Вариант ${optionIndex + 1}`}
                        onChange={(event) =>
                          handleQuestionChange(block, questionIndex, (item) => {
                            const nextOptions = [...(item.options ?? [])];
                            nextOptions[optionIndex] = { ...nextOptions[optionIndex], text: event.target.value };
                            return { ...item, options: nextOptions };
                          })
                        }
                      />
                      <label className={styles.checkboxRow}>
                        <input
                          type={question.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                          checked={(question.correctOptionIds ?? []).includes(option.id)}
                          onChange={(event) =>
                            handleQuestionChange(block, questionIndex, (item) => {
                              const previous = item.correctOptionIds ?? [];
                              if (question.type === 'SINGLE_CHOICE') {
                                return {
                                  ...item,
                                  correctOptionIds: event.target.checked ? [option.id] : [],
                                };
                              }
                              const next = event.target.checked
                                ? [...previous, option.id]
                                : previous.filter((id) => id !== option.id);
                              return { ...item, correctOptionIds: next };
                            })
                          }
                        />
                        Верный ответ
                      </label>
                    </div>
                  ))}
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() =>
                        handleQuestionChange(block, questionIndex, (item) => ({
                          ...item,
                          options: [...(item.options ?? []), { id: createHomeworkBlockId(), text: '' }],
                        }))
                      }
                    >
                      Добавить вариант
                    </button>
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() =>
                        handleQuestionChange(block, questionIndex, (item) => ({
                          ...item,
                          options: (item.options ?? []).slice(0, -1),
                          correctOptionIds: (item.correctOptionIds ?? []).filter((id) =>
                            (item.options ?? []).slice(0, -1).some((nextOption) => nextOption.id === id),
                          ),
                        }))
                      }
                      disabled={(question.options?.length ?? 0) <= 2}
                    >
                      Удалить вариант
                    </button>
                  </div>
                </>
              )}

              {question.type === 'SHORT_ANSWER' && (
                <label className={styles.fieldLabel}>
                  Допустимые ответы (опционально)
                  <input
                    className={controls.input}
                    value={(question.acceptedAnswers ?? []).join(', ')}
                    onChange={(event) =>
                      handleQuestionChange(block, questionIndex, (item) => ({
                        ...item,
                        acceptedAnswers: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="например: went, has gone"
                  />
                </label>
              )}

              {question.type === 'MATCHING' && (
                <>
                  {(question.matchingPairs ?? []).map((pair, pairIndex) => (
                    <div key={pair.id} className={styles.row}>
                      <label className={styles.fieldLabel}>
                        Левый элемент
                        <input
                          className={controls.input}
                          value={pair.left}
                          onChange={(event) =>
                            handleQuestionChange(block, questionIndex, (item) => {
                              const nextPairs = [...(item.matchingPairs ?? [])];
                              nextPairs[pairIndex] = { ...nextPairs[pairIndex], left: event.target.value };
                              return { ...item, matchingPairs: nextPairs };
                            })
                          }
                        />
                      </label>
                      <label className={styles.fieldLabel}>
                        Правый элемент
                        <input
                          className={controls.input}
                          value={pair.right}
                          onChange={(event) =>
                            handleQuestionChange(block, questionIndex, (item) => {
                              const nextPairs = [...(item.matchingPairs ?? [])];
                              nextPairs[pairIndex] = { ...nextPairs[pairIndex], right: event.target.value };
                              return { ...item, matchingPairs: nextPairs };
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() =>
                        handleQuestionChange(block, questionIndex, (item) => ({
                          ...item,
                          matchingPairs: [
                            ...(item.matchingPairs ?? []),
                            { id: createHomeworkBlockId(), left: '', right: '' },
                          ],
                        }))
                      }
                    >
                      Добавить пару
                    </button>
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() =>
                        handleQuestionChange(block, questionIndex, (item) => ({
                          ...item,
                          matchingPairs: (item.matchingPairs ?? []).slice(0, -1),
                        }))
                      }
                      disabled={(question.matchingPairs?.length ?? 0) <= 2}
                    >
                      Удалить пару
                    </button>
                  </div>
                </>
              )}

              <label className={styles.fieldLabel}>
                Пояснение после ответа (опционально)
                <textarea
                  className={controls.textArea}
                  value={question.explanation ?? ''}
                  onChange={(event) =>
                    handleQuestionChange(block, questionIndex, (item) => ({
                      ...item,
                      explanation: event.target.value || null,
                    }))
                  }
                />
              </label>
            </div>
          ))}
        </>
      );
    }

    return (
      <>
        <div className={styles.toolbar}>
          {STUDENT_RESPONSE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={controls.smallButton}
              onClick={() => updateBlock(blockIndex, applyStudentResponsePreset(block, preset.id))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className={styles.responseGrid}>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={block.allowText} onChange={handleStudentResponseToggle(block, 'allowText')} />
            Текстовый ответ
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={block.allowFiles} onChange={handleStudentResponseToggle(block, 'allowFiles')} />
            Любые файлы
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={block.allowPhotos}
              onChange={handleStudentResponseToggle(block, 'allowPhotos')}
            />
            Фото
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={block.allowDocuments}
              onChange={handleStudentResponseToggle(block, 'allowDocuments')}
            />
            Документы
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={block.allowAudio} onChange={handleStudentResponseToggle(block, 'allowAudio')} />
            Аудио
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={block.allowVideo} onChange={handleStudentResponseToggle(block, 'allowVideo')} />
            Видео
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={block.allowVoice} onChange={handleStudentResponseToggle(block, 'allowVoice')} />
            Voice (запись в Mini App)
          </label>
        </div>
      </>
    );
  };

  const baseSubmitLabel = mode === 'create' ? 'Сохранить шаблон' : 'Сохранить изменения';

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>1. Основная информация</h4>
        <label className={styles.fieldLabel}>
          Название шаблона
          <input
            className={controls.input}
            value={draft.title}
            onChange={handleDraftFieldChange('title')}
            placeholder="Например: Past Simple — мини-тест + voice"
            required
          />
        </label>
        <div className={styles.row}>
          <label className={styles.fieldLabel}>
            Теги (через запятую)
            <input
              className={controls.input}
              value={draft.tagsText}
              onChange={handleDraftFieldChange('tagsText')}
              placeholder="grammar, b1"
            />
          </label>
          <label className={styles.fieldLabel}>
            Предмет
            <input
              className={controls.input}
              value={draft.subject}
              onChange={handleDraftFieldChange('subject')}
              placeholder="Например: English"
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.fieldLabel}>
            Уровень
            <input
              className={controls.input}
              value={draft.level}
              onChange={handleDraftFieldChange('level')}
              placeholder="Например: B1"
            />
          </label>
          <div className={styles.fieldLabel}>
            <span>Подсказка</span>
            <div className={styles.inlineText}>
              Ты можешь оставить предмет и уровень пустыми, если они не важны для этого шаблона.
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>2. Быстрый старт</h4>
        <p className={styles.inlineText}>Выберите сценарий и донастройте детали ниже.</p>
        <div className={styles.presetGrid}>
          {HOMEWORK_TEMPLATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`${styles.presetCard} ${selectedPreset === preset.id ? styles.presetCardActive : ''}`}
              onClick={() => applyPreset(preset.id)}
            >
              <div className={styles.presetTitle}>{preset.title}</div>
              <div className={styles.presetDescription}>{preset.description}</div>
              <div className={styles.presetHint}>{preset.outcomeHint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>3. Структура шаблона</h4>
        <div className={styles.toolbar}>
          <button type="button" className={controls.smallButton} onClick={() => addBlock('TEXT')}>
            + Текст задания
          </button>
          <button type="button" className={controls.smallButton} onClick={() => addBlock('MEDIA')}>
            + Материалы
          </button>
          <button type="button" className={controls.smallButton} onClick={() => addBlock('TEST')}>
            + Тест
          </button>
          <button
            type="button"
            className={controls.smallButton}
            onClick={() => addBlock('STUDENT_RESPONSE')}
            disabled={hasStudentResponseBlock}
            title={hasStudentResponseBlock ? 'Блок ответа уже добавлен' : undefined}
          >
            + Ответ ученика
          </button>
        </div>

        <div className={styles.list}>
          {draft.blocks.map((block, blockIndex) => (
            <article key={block.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <div className={styles.cardTitle}>
                    {blockIndex + 1}. {BLOCK_TYPE_LABELS[block.type]}
                  </div>
                  <div className={styles.blockHint}>{BLOCK_TYPE_HINTS[block.type]}</div>
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className={controls.smallButton} onClick={() => moveBlock(blockIndex, -1)}>
                    ↑
                  </button>
                  <button type="button" className={controls.smallButton} onClick={() => moveBlock(blockIndex, 1)}>
                    ↓
                  </button>
                  <button type="button" className={controls.smallButton} onClick={() => removeBlock(blockIndex)}>
                    Удалить
                  </button>
                </div>
              </div>
              {renderBlockBody(block, blockIndex)}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>4. Что сможет сделать ученик</h4>
        <div className={styles.summaryChips}>
          {validation.summary.hasText ? <span className={styles.summaryChip}>Увидит текст задания</span> : null}
          {validation.summary.hasMedia ? <span className={styles.summaryChip}>Получит материалы</span> : null}
          {validation.summary.hasTest ? (
            <span className={styles.summaryChip}>
              Пройдет тест ({validation.summary.questionCount} вопросов)
            </span>
          ) : null}
          {validation.summary.responseFormats.map((format) => (
            <span key={format} className={styles.summaryChip}>
              Отправит: {format}
            </span>
          ))}
          {validation.summary.responseFormats.length === 0 && !validation.summary.hasTest ? (
            <span className={styles.summaryChipMuted}>Способ сдачи пока не задан</span>
          ) : null}
        </div>

        {validation.errors.length > 0 ? (
          <div className={styles.validationError}>
            {validation.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        {validation.warnings.length > 0 ? (
          <div className={styles.validationWarning}>
            {validation.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </section>

      <div className={styles.modalActions}>
        <button type="button" className={controls.secondaryButton} onClick={handleCancel} disabled={submitting}>
          {cancelLabel ?? 'Отмена'}
        </button>
        <button type="submit" className={controls.primaryButton} disabled={submitting || validation.errors.length > 0}>
          {submitting ? 'Сохраняю…' : submitLabel ?? baseSubmitLabel}
        </button>
      </div>
    </form>
  );
};
