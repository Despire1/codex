import { ChangeEvent, FC, FormEvent } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import { Modal } from '../../../shared/ui/Modal/Modal';
import {
  HomeworkAttachment,
  HomeworkBlock,
  HomeworkBlockMedia,
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
  ensureTemplateHasStudentResponseBlock,
} from '../model/lib/blocks';

interface HomeworkTemplateEditorModalProps {
  open: boolean;
  mode: HomeworkTemplateEditorMode;
  draft: HomeworkTemplateEditorDraft;
  submitting: boolean;
  onDraftChange: (draft: HomeworkTemplateEditorDraft) => void;
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
}

const BLOCK_TYPE_LABELS: Record<HomeworkBlock['type'], string> = {
  TEXT: 'Текст',
  MEDIA: 'Медиа',
  TEST: 'Тест',
  STUDENT_RESPONSE: 'Ответ ученика',
};

const QUESTION_TYPE_OPTIONS: Array<{ id: HomeworkTestQuestionType; label: string }> = [
  { id: 'SINGLE_CHOICE', label: 'Один правильный' },
  { id: 'MULTIPLE_CHOICE', label: 'Несколько правильных' },
  { id: 'SHORT_ANSWER', label: 'Короткий ответ' },
  { id: 'MATCHING', label: 'Сопоставление' },
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

export const HomeworkTemplateEditorModal: FC<HomeworkTemplateEditorModalProps> = ({
  open,
  mode,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onClose,
}) => {
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = await onSubmit();
    if (success) onClose();
  };

  const updateBlocks = (blocks: HomeworkBlock[]) => {
    onDraftChange({
      ...draft,
      blocks: ensureTemplateHasStudentResponseBlock(blocks),
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
          Контент
          <textarea
            className={controls.textArea}
            value={block.content}
            onChange={(event) => updateBlock(blockIndex, { ...block, content: event.target.value })}
            placeholder="Опишите задание"
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
                Название файла
                <input
                  className={controls.input}
                  value={attachment.fileName}
                  onChange={(event) => {
                    const nextAttachments = [...(block.attachments ?? [])];
                    nextAttachments[attachmentIndex] = { ...nextAttachments[attachmentIndex], fileName: event.target.value };
                    updateBlock(blockIndex, { ...block, attachments: nextAttachments });
                  }}
                />
              </label>
              <label className={styles.fieldLabel}>
                URL файла
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
            Добавить вложение
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
              placeholder="Промежуточный тест"
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
                        replaceQuestionType(
                          item,
                          event.target.value as HomeworkTestQuestionType,
                        ),
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
                Формулировка
                <textarea
                  className={controls.textArea}
                  value={question.prompt}
                  onChange={(event) =>
                    handleQuestionChange(block, questionIndex, (item) => ({ ...item, prompt: event.target.value }))
                  }
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
                        Верный
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
                            (item.options ?? []).slice(0, -1).some((option) => option.id === id),
                          ),
                        }))
                      }
                      disabled={(question.options?.length ?? 0) <= 1}
                    >
                      Удалить вариант
                    </button>
                  </div>
                </>
              )}

              {question.type === 'SHORT_ANSWER' && (
                <label className={styles.fieldLabel}>
                  Допустимые ответы (через запятую, опционально)
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
                      disabled={(question.matchingPairs?.length ?? 0) <= 1}
                    >
                      Удалить пару
                    </button>
                  </div>
                </>
              )}

              <label className={styles.fieldLabel}>
                Пояснение (опционально)
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
      <div className={styles.row}>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={block.allowText} onChange={handleStudentResponseToggle(block, 'allowText')} />
          Текст
        </label>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={block.allowFiles} onChange={handleStudentResponseToggle(block, 'allowFiles')} />
          Файлы
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
          Voice
        </label>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={handleClose} title={mode === 'create' ? 'Создать шаблон' : 'Редактировать шаблон'}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Основное</h4>
          <label className={styles.fieldLabel}>
            Название
            <input
              className={controls.input}
              value={draft.title}
              onChange={handleDraftFieldChange('title')}
              placeholder="Например: Past Simple + reading"
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
              Предмет / уровень
              <input
                className={controls.input}
                value={[draft.subject, draft.level].filter(Boolean).join(' / ')}
                onChange={(event) => {
                  const [subject = '', level = ''] = event.target.value.split('/').map((item) => item.trim());
                  onDraftChange({ ...draft, subject, level });
                }}
                placeholder="English / B1"
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Блоки шаблона</h4>
          <div className={styles.toolbar}>
            <button type="button" className={controls.smallButton} onClick={() => addBlock('TEXT')}>
              + Текст
            </button>
            <button type="button" className={controls.smallButton} onClick={() => addBlock('MEDIA')}>
              + Медиа
            </button>
            <button type="button" className={controls.smallButton} onClick={() => addBlock('TEST')}>
              + Тест
            </button>
            <button type="button" className={controls.smallButton} onClick={() => addBlock('STUDENT_RESPONSE')}>
              + Ответ ученика
            </button>
          </div>
          <div className={styles.list}>
            {draft.blocks.map((block, blockIndex) => (
              <article key={block.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    {blockIndex + 1}. {BLOCK_TYPE_LABELS[block.type]}
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
          <div className={styles.inlineText}>Блок «Ответ ученика» добавляется автоматически, если его удалить из списка.</div>
        </section>

        <div className={styles.modalActions}>
          <button type="button" className={controls.secondaryButton} onClick={handleClose} disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className={controls.primaryButton} disabled={submitting}>
            {submitting ? 'Сохраняю…' : mode === 'create' ? 'Создать шаблон' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

