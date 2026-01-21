import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Teacher } from '../../../entities/types';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { useToast } from '../../../shared/lib/toast';
import controls from '../../../shared/styles/controls.module.css';
import {
  DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
  DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE,
  STUDENT_LESSON_TEMPLATE_VARIABLES,
  STUDENT_PAYMENT_TEMPLATE_VARIABLES,
} from '../../../shared/lib/notificationTemplates';
import styles from './StudentNotificationTemplates.module.css';

interface StudentNotificationTemplatesProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
}

type TemplateId = 'lesson' | 'payment';

type ExampleKey = 'A' | 'B';

type TemplateConfig = {
  id: TemplateId;
  label: string;
  description: string;
  defaultValue: string;
  field: 'studentUpcomingLessonTemplate' | 'studentPaymentDueTemplate';
  allowedVariables: readonly string[];
  examples: Record<ExampleKey, Record<string, string>>;
};

const TEMPLATE_MAX_LENGTH = 1000;

const emojiOptions = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😃',
  '😄',
  '😅',
  '😆',
  '😉',
  '😊',
  '😋',
  '😎',
  '😍',
  '😘',
  '🥰',
  '😗',
  '😙',
  '😚',
  '🙂',
  '🤗',
  '🤩',
  '🤔',
  '🤨',
  '😐',
  '😑',
  '😶',
  '🙄',
  '😏',
  '😣',
  '😥',
  '😮',
  '🤐',
  '😯',
  '😪',
  '😫',
  '🥱',
  '😴',
  '😌',
  '😛',
  '😜',
  '😝',
  '🤤',
  '😒',
  '😓',
  '😔',
  '😕',
  '🙃',
  '🫠',
  '🤑',
  '😲',
  '☹️',
  '🙁',
  '😖',
  '😞',
  '😟',
  '😤',
  '😢',
  '😭',
  '😦',
  '😧',
  '😨',
  '😩',
  '🤯',
  '😬',
  '😰',
  '😱',
  '🥵',
  '🥶',
  '😳',
  '🤪',
  '😵',
  '😵‍💫',
  '🥴',
  '😠',
  '😡',
  '🤬',
  '😷',
  '🤒',
  '🤕',
  '🤢',
  '🤮',
  '🤧',
  '😇',
  '🥳',
  '🥺',
  '🤠',
  '🤡',
  '🤥',
  '🫡',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '🔥',
  '✨',
  '⭐',
  '🎉',
  '🎊',
  '💯',
  '✅',
  '📚',
  '⏰',
  '📝',
  '💡',
  '💬',
  '📌',
  '📎',
  '📅',
  '💳',
  '💸',
  '💵',
  '📣',
];

const variableLabels: Record<string, { label: string; code: string }> = {
  student_name: { label: 'Имя ученика', code: '{{student_name}}' },
  lesson_date: { label: 'Дата', code: '{{lesson_date}}' },
  lesson_time: { label: 'Время', code: '{{lesson_time}}' },
  lesson_datetime: { label: 'Дата и время', code: '{{lesson_datetime}}' },
  lesson_price: { label: 'Цена занятия', code: '{{lesson_price}}' },
};

const resolveTemplateValue = (value: string | null, fallback: string) => (value?.trim() ? value : fallback);

const parseTemplateVariables = (value: string) => {
  const matches = value.matchAll(/{{\s*([^}]+)\s*}}/g);
  return Array.from(matches, (match) => match[1]?.trim() ?? '');
};

const validateTemplate = (value: string, allowedVariables: readonly string[]) => {
  if (!value.trim()) {
    return 'Текст уведомления не может быть пустым';
  }
  if (value.length > TEMPLATE_MAX_LENGTH) {
    return `Текст уведомления не должен превышать ${TEMPLATE_MAX_LENGTH} символов`;
  }
  const allowedSet = new Set(allowedVariables);
  const variables = parseTemplateVariables(value);
  const unknown = variables.find((variable) => !allowedSet.has(variable));
  if (unknown) {
    return `Неизвестная переменная: {{${unknown}}}`;
  }
  return null;
};

const renderPreview = (value: string, example: Record<string, string>, allowedVariables: readonly string[]) => {
  const nodes: Array<JSX.Element | string> = [];
  const regex = /{{\s*([^}]+)\s*}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    const variableName = match[1]?.trim() ?? '';
    if (!allowedVariables.includes(variableName)) {
      nodes.push(match[0]);
    } else {
      const replacement = example[variableName] ?? '';
      if (!replacement) {
        nodes.push(
          <span key={`${variableName}-${match.index}`} className={styles.previewMissing}>
            (не задано)
          </span>,
        );
      } else {
        nodes.push(replacement);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }
  if (nodes.length === 0) {
    return value;
  }
  return nodes.map((node, index) =>
    typeof node === 'string' ? <span key={`text-${index}`}>{node}</span> : node,
  );
};

const templateConfigs: TemplateConfig[] = [
  {
    id: 'lesson',
    label: 'Напоминание о занятии',
    description: 'Сообщение уходит ученику перед предстоящим занятием.',
    defaultValue: DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE,
    field: 'studentUpcomingLessonTemplate',
    allowedVariables: STUDENT_LESSON_TEMPLATE_VARIABLES,
    examples: {
      A: {
        student_name: 'Ирина',
        lesson_date: '5 сентября',
        lesson_time: '18:00',
        lesson_datetime: '5 сентября 18:00',
      },
      B: {
        student_name: '',
        lesson_date: '12 октября',
        lesson_time: '09:30',
        lesson_datetime: '12 октября 09:30',
      },
    },
  },
  {
    id: 'payment',
    label: 'Напоминание об оплате',
    description: 'Автоматическое или ручное напоминание о неоплаченном занятии.',
    defaultValue: DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
    field: 'studentPaymentDueTemplate',
    allowedVariables: STUDENT_PAYMENT_TEMPLATE_VARIABLES,
    examples: {
      A: {
        student_name: 'Илья',
        lesson_date: '7 сентября',
        lesson_time: '16:00',
        lesson_datetime: '7 сентября 16:00',
        lesson_price: '1500',
      },
      B: {
        student_name: 'София',
        lesson_date: '11 сентября',
        lesson_time: '10:00',
        lesson_datetime: '11 сентября 10:00',
        lesson_price: '900',
      },
    },
  },
];

const TemplateEditor: FC<{
  config: TemplateConfig;
  value: string;
  onValueChange: (value: string) => void;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
  example: ExampleKey;
  onExampleChange: (value: ExampleKey) => void;
  isMobile: boolean;
}> = ({
  config,
  value,
  onValueChange,
  error,
  onSave,
  onReset,
  example,
  onExampleChange,
  isMobile,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);

  const insertAtCursor = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const isFocused = document.activeElement === textarea;
      const start = isFocused ? textarea.selectionStart ?? value.length : value.length;
      const end = isFocused ? textarea.selectionEnd ?? value.length : value.length;
      const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
      onValueChange(nextValue);
      requestAnimationFrame(() => {
        textarea.focus();
        const nextPos = start + insertion.length;
        textarea.setSelectionRange(nextPos, nextPos);
      });
    },
    [onValueChange, value],
  );

  const handleBadgeClick = (variable: string) => {
    insertAtCursor(variableLabels[variable]?.code ?? `{{${variable}}}`);
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('text/plain');
    if (!data) return;
    insertAtCursor(data);
  };

  const handleDragOver = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
  };

  return (
    <div className={styles.editorCard}>
      <div className={styles.editorHeader}>
        <div>
          <div className={styles.editorTitle}>{config.label}</div>
          <div className={styles.editorDescription}>{config.description}</div>
        </div>
      </div>

      <div className={styles.variablePanel}>
        {config.allowedVariables.map((variable) => (
          <button
            key={variable}
            type="button"
            className={styles.variableBadge}
            onClick={() => handleBadgeClick(variable)}
            draggable={!isMobile}
            onDragStart={(event) => {
              if (isMobile) return;
              event.dataTransfer.setData('text/plain', variableLabels[variable]?.code ?? `{{${variable}}}`);
            }}
            data-testid={`student-notification-${config.id}-badge-${variable}`}
          >
            <span className={styles.variableLabel}>{variableLabels[variable]?.label ?? variable}</span>
            <span className={styles.variableCode}>{variableLabels[variable]?.code ?? `{{${variable}}}`}</span>
          </button>
        ))}
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabelRow}>
            <label className={styles.fieldLabel} htmlFor={`template-${config.id}`}>
              Текст уведомления
            </label>
            {!isMobile && (
              <AdaptivePopover
                isOpen={isEmojiOpen}
                onClose={() => setIsEmojiOpen(false)}
                trigger={
                  <button
                    type="button"
                    className={`${controls.iconButton} ${styles.emojiButton}`}
                    onClick={() => setIsEmojiOpen((prev) => !prev)}
                    aria-label="Добавить эмодзи"
                    data-testid={`student-notification-${config.id}-emoji`}
                  >
                    <span className={styles.emojiIcon} role="img" aria-hidden>
                      😊
                    </span>
                  </button>
                }
                className={styles.emojiPopover}
              >
                <div className={styles.emojiGrid}>
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={styles.emojiItem}
                      onClick={() => {
                        insertAtCursor(emoji);
                        setIsEmojiOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </AdaptivePopover>
            )}
          </div>
          <textarea
            id={`template-${config.id}`}
            ref={textareaRef}
            className={`${controls.textArea} ${styles.textArea} ${error ? styles.fieldError : ''}`}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-testid={`student-notification-${config.id}-textarea`}
          />
          {error && <div className={styles.errorText}>{error}</div>}
        </div>

        <div className={styles.previewGroup}>
          <div className={styles.previewHeader}>
            <div className={styles.previewTitle}>Предпросмотр</div>
            <div className={styles.exampleToggle} data-testid={`student-notification-${config.id}-example-toggle`}>
              {(['A', 'B'] as ExampleKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.exampleButton} ${example === key ? styles.exampleButtonActive : ''}`}
                  onClick={() => onExampleChange(key)}
                  data-testid={`student-notification-${config.id}-example-${key.toLowerCase()}`}
                >
                  Пример {key}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.previewBox} data-testid={`student-notification-${config.id}-preview`}>
            <div className={styles.previewText}>
              {renderPreview(value, config.examples[example], config.allowedVariables)}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={onReset}
          data-testid={`student-notification-${config.id}-reset`}
        >
          Сбросить по умолчанию
        </button>
        <button
          type="button"
          className={controls.primaryButton}
          onClick={onSave}
          data-testid={`student-notification-${config.id}-save`}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
};

export const StudentNotificationTemplates: FC<StudentNotificationTemplatesProps> = ({ teacher, onChange }) => {
  const { showToast } = useToast();
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>('lesson');
  const [isMobile, setIsMobile] = useState(false);

  const resolvedValues = useMemo(
    () => ({
      lesson: resolveTemplateValue(teacher.studentUpcomingLessonTemplate, DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE),
      payment: resolveTemplateValue(teacher.studentPaymentDueTemplate, DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE),
    }),
    [teacher.studentPaymentDueTemplate, teacher.studentUpcomingLessonTemplate],
  );

  const [values, setValues] = useState<Record<TemplateId, string>>(resolvedValues);
  const [errors, setErrors] = useState<Record<TemplateId, string | null>>({ lesson: null, payment: null });
  const [examples, setExamples] = useState<Record<TemplateId, ExampleKey>>({ lesson: 'A', payment: 'A' });

  useEffect(() => {
    setValues(resolvedValues);
  }, [resolvedValues]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const handleChange = () => setIsMobile(mediaQuery.matches);
    handleChange();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    return () => {
      if (mediaQuery.addEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  const updateValue = (id: TemplateId, nextValue: string) => {
    setValues((prev) => ({ ...prev, [id]: nextValue }));
    setErrors((prev) => ({ ...prev, [id]: null }));
  };

  const handleSave = (config: TemplateConfig) => {
    const nextValue = values[config.id];
    const validationError = validateTemplate(nextValue, config.allowedVariables);
    if (validationError) {
      setErrors((prev) => ({ ...prev, [config.id]: validationError }));
      return;
    }
    onChange({ [config.field]: nextValue } as Partial<Teacher>);
  };

  const handleReset = (config: TemplateConfig) => {
    updateValue(config.id, config.defaultValue);
    showToast({ message: 'Сброшено', variant: 'success' });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>Тексты уведомлений ученику</div>
      <div className={styles.tabRow}>
        {templateConfigs.map((config) => (
          <button
            key={config.id}
            type="button"
            className={`${styles.tabButton} ${activeTemplate === config.id ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTemplate(config.id)}
          >
            {config.label}
          </button>
        ))}
      </div>

      {templateConfigs
        .filter((config) => config.id === activeTemplate)
        .map((config) => (
          <TemplateEditor
            key={config.id}
            config={config}
            value={values[config.id]}
            onValueChange={(nextValue) => updateValue(config.id, nextValue)}
            error={errors[config.id]}
            onSave={() => handleSave(config)}
            onReset={() => handleReset(config)}
            example={examples[config.id]}
            onExampleChange={(value) => setExamples((prev) => ({ ...prev, [config.id]: value }))}
            isMobile={isMobile}
          />
        ))}
    </div>
  );
};
