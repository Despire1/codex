import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Teacher } from '../../../entities/types';
import { MoreHorizIcon } from '../../../icons/MaterialIcons';
import { SendTestNotificationModal, useNotificationChannelStatus } from '../../../features/notifications/sendTest';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { useToast } from '../../../shared/lib/toast';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import { useIsMobile } from '../../../shared/lib/useIsMobile';
import { useUnsavedChanges } from '../../../shared/lib/unsavedChanges';
import controls from '../../../shared/styles/controls.module.css';
import {
  DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
  DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE,
  STUDENT_LESSON_TEMPLATE_VARIABLES,
  STUDENT_PAYMENT_TEMPLATE_VARIABLES,
  STUDENT_LESSON_TEMPLATE_EXAMPLES,
  STUDENT_PAYMENT_TEMPLATE_EXAMPLES,
  STUDENT_TEMPLATE_MAX_LENGTH,
  TemplateExampleKey,
} from '../../../shared/lib/notificationTemplates';
import styles from './StudentNotificationTemplates.module.css';

interface StudentNotificationTemplatesProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  onSaveNow: (patch: Partial<Teacher>) => Promise<{ ok: boolean; error?: string }>;
}

type TemplateId = 'lesson' | 'payment';

type TemplateConfig = {
  id: TemplateId;
  label: string;
  description: string;
  defaultValue: string;
  field: 'studentUpcomingLessonTemplate' | 'studentPaymentDueTemplate';
  templateType: 'LESSON_REMINDER' | 'PAYMENT_REMINDER';
  allowedVariables: readonly string[];
};

type EmojiMartSelection = {
  native?: string;
};

const variableLabels: Record<string, { label: string; code: string }> = {
  student_name: { label: 'Имя ученика', code: '{{student_name}}' },
  lesson_date: { label: 'Дата', code: '{{lesson_date}}' },
  lesson_time: { label: 'Время', code: '{{lesson_time}}' },
  lesson_datetime: { label: 'Дата и время', code: '{{lesson_datetime}}' },
  lesson_price: { label: 'Цена занятия', code: '{{lesson_price}}' },
  lesson_link: { label: 'Ссылка на занятие', code: '{{lesson_link}}' },
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
  if (value.length > STUDENT_TEMPLATE_MAX_LENGTH) {
    return `Текст уведомления не должен превышать ${STUDENT_TEMPLATE_MAX_LENGTH} символов`;
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
    templateType: 'LESSON_REMINDER',
    allowedVariables: STUDENT_LESSON_TEMPLATE_VARIABLES,
  },
  {
    id: 'payment',
    label: 'Напоминание об оплате',
    description: 'Автоматическое или ручное напоминание о неоплаченном занятии.',
    defaultValue: DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
    field: 'studentPaymentDueTemplate',
    templateType: 'PAYMENT_REMINDER',
    allowedVariables: STUDENT_PAYMENT_TEMPLATE_VARIABLES,
  },
];

const TemplateEditor: FC<{
  config: TemplateConfig;
  value: string;
  onValueChange: (value: string) => void;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
  isDirty: boolean;
  previewExample: Record<string, string>;
  example: TemplateExampleKey;
  onExampleChange: (value: TemplateExampleKey) => void;
  onSendTest: () => void;
  sendTestDisabled: boolean;
  sendTestHint: string;
  isMobile: boolean;
}> = ({
  config,
  value,
  onValueChange,
  error,
  onSave,
  onReset,
  isDirty,
  previewExample,
  example,
  onExampleChange,
  onSendTest,
  sendTestDisabled,
  sendTestHint,
  isMobile,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const hasSelectionRef = useRef(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [popoverTick, setPopoverTick] = useState(0);

  useEffect(() => {
    if (!isEmojiOpen) return undefined;
    setPopoverTick((prev) => prev + 1);
    const timeoutId = window.setTimeout(() => {
      setPopoverTick((prev) => prev + 1);
    }, 60);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEmojiOpen]);

  const insertAtCursor = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { start, end } = selectionRef.current;
      const fallbackPos = value.length;
      const resolvedStart = hasSelectionRef.current ? start : fallbackPos;
      const resolvedEnd = hasSelectionRef.current ? end : fallbackPos;
      const safeStart = Number.isFinite(resolvedStart)
        ? Math.min(Math.max(resolvedStart, 0), value.length)
        : value.length;
      const safeEnd = Number.isFinite(resolvedEnd) ? Math.min(Math.max(resolvedEnd, 0), value.length) : value.length;
      const nextValue = `${value.slice(0, safeStart)}${insertion}${value.slice(safeEnd)}`;
      onValueChange(nextValue);
      requestAnimationFrame(() => {
        textarea.focus();
        const nextPos = safeStart + insertion.length;
        textarea.setSelectionRange(nextPos, nextPos);
        selectionRef.current = { start: nextPos, end: nextPos };
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

  const handleSelectionUpdate = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    hasSelectionRef.current = true;
    selectionRef.current = {
      start: textarea.selectionStart ?? value.length,
      end: textarea.selectionEnd ?? value.length,
    };
  };

  return (
    <div className={styles.editorCard}>
      <div className={styles.editorHeader}>
        <div>
          <div className={styles.editorTitle}>{config.label}</div>
          <div className={styles.editorDescription}>{config.description}</div>
        </div>
        {isMobile && (
          <AdaptivePopover
            isOpen={isOverflowOpen}
            onClose={() => setIsOverflowOpen(false)}
            trigger={
              <button
                type="button"
                className={`${controls.iconButton} ${styles.overflowButton}`}
                onClick={() => setIsOverflowOpen((prev) => !prev)}
                aria-label="Дополнительные действия"
              >
                <MoreHorizIcon width={18} height={18} />
              </button>
            }
            side="bottom"
            align="end"
            className={styles.overflowPopover}
          >
            <button
              type="button"
              className={styles.overflowAction}
              onClick={() => {
                onReset();
                setIsOverflowOpen(false);
              }}
            >
              Сбросить по умолчанию
            </button>
          </AdaptivePopover>
        )}
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
                side="bottom"
                className={styles.emojiPopover}
              >
                <div className={styles.emojiPickerWrapper} data-popover-tick={popoverTick}>
                  <Picker
                    data={data}
                    theme="light"
                    previewPosition="none"
                    onEmojiSelect={(emoji: EmojiMartSelection) => {
                      if (!emoji.native) return;
                      insertAtCursor(emoji.native);
                      setIsEmojiOpen(false);
                    }}
                  />
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
            onClick={handleSelectionUpdate}
            onKeyUp={handleSelectionUpdate}
            onSelect={handleSelectionUpdate}
            onFocus={handleSelectionUpdate}
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
              {(['A', 'B'] as TemplateExampleKey[]).map((key) => (
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
              {renderPreview(value, previewExample, config.allowedVariables)}
            </div>
          </div>
        </div>
      </div>

      {!isMobile && (
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
            className={`${controls.primaryButton} ${styles.saveButton}`}
            onClick={onSave}
            disabled={!isDirty}
            data-testid={`student-notification-${config.id}-save`}
          >
            Сохранить
          </button>
        </div>
      )}

      {isMobile && (
        <div className={styles.mobileActions}>
          <Tooltip content={sendTestHint} className={styles.sendTestWrapper}>
            <button
              type="button"
              className={`${controls.secondaryButton} ${styles.mobileActionButton}`}
              onClick={onSendTest}
              disabled={sendTestDisabled}
              data-testid={`student-notification-${config.id}-send-test`}
            >
              Тест
            </button>
          </Tooltip>
          <button
            type="button"
            className={`${controls.primaryButton} ${styles.mobileActionButton} ${styles.saveButton}`}
            onClick={onSave}
            disabled={!isDirty}
            data-testid={`student-notification-${config.id}-save`}
          >
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
};

export const StudentNotificationTemplates: FC<StudentNotificationTemplatesProps> = ({
  teacher,
  onChange,
  onSaveNow,
}) => {
  const { showToast } = useToast();
  const { setEntry, clearEntry } = useUnsavedChanges();
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>('lesson');
  const isMobile = useIsMobile(720);
  const channelStatus = useNotificationChannelStatus();

  const resolvedValues = useMemo(
    () => ({
      lesson: resolveTemplateValue(teacher.studentUpcomingLessonTemplate, DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE),
      payment: resolveTemplateValue(teacher.studentPaymentDueTemplate, DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE),
    }),
    [teacher.studentPaymentDueTemplate, teacher.studentUpcomingLessonTemplate],
  );

  const [values, setValues] = useState<Record<TemplateId, string>>(resolvedValues);
  const [errors, setErrors] = useState<Record<TemplateId, string | null>>({ lesson: null, payment: null });
  const [examples, setExamples] = useState<Record<TemplateId, TemplateExampleKey>>({ lesson: 'A', payment: 'A' });
  const [isSendTestOpen, setIsSendTestOpen] = useState(false);
  const dirtyById = useMemo(
    () => ({
      lesson: values.lesson !== resolvedValues.lesson,
      payment: values.payment !== resolvedValues.payment,
    }),
    [resolvedValues.lesson, resolvedValues.payment, values.lesson, values.payment],
  );
  const hasUnsavedChanges = dirtyById.lesson || dirtyById.payment;

  const sendTestDisabled = channelStatus.status !== 'ready' || !channelStatus.configured;
  const sendTestHint = sendTestDisabled
    ? 'Выберите и подключите канал отправки, чтобы отправлять тест.'
    : 'Отправит тестовое сообщение по текущему шаблону для проверки.';

  useEffect(() => {
    setValues(resolvedValues);
  }, [resolvedValues]);

  const saveDirtyTemplates = useCallback(async () => {
    const patch: Partial<Teacher> = {};
    let hasValidationError = false;

    templateConfigs.forEach((config) => {
      if (!dirtyById[config.id]) return;
      const nextValue = values[config.id];
      const validationError = validateTemplate(nextValue, config.allowedVariables);
      if (validationError) {
        hasValidationError = true;
        setErrors((prev) => ({ ...prev, [config.id]: validationError }));
        return;
      }
      patch[config.field] = nextValue;
    });

    if (hasValidationError) {
      showToast({ message: 'Исправьте ошибки перед сохранением', variant: 'error' });
      return false;
    }

    if (Object.keys(patch).length === 0) return true;
    const result = await onSaveNow(patch);
    return result.ok;
  }, [dirtyById, onSaveNow, setErrors, showToast, values]);

  const discardDirtyTemplates = useCallback(() => {
    setValues(resolvedValues);
    setErrors({ lesson: null, payment: null });
  }, [resolvedValues]);

  useEffect(() => {
    setEntry('student-notification-templates', {
      isDirty: hasUnsavedChanges,
      onSave: saveDirtyTemplates,
      onDiscard: discardDirtyTemplates,
      message: 'Вы изменили тексты уведомлений. Сохранить перед выходом?',
    });
    return () => clearEntry('student-notification-templates');
  }, [clearEntry, discardDirtyTemplates, hasUnsavedChanges, saveDirtyTemplates, setEntry]);

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
        <div className={styles.tabButtons}>
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
        {!isMobile && (
          <Tooltip content={sendTestHint} className={`${styles.sendTestWrapper} ${styles.tabAction}`}>
            <button
              type="button"
              className={`${controls.secondaryButton} ${styles.sendTestButton}`}
              onClick={() => {
                if (sendTestDisabled) return;
                setIsSendTestOpen(true);
              }}
              disabled={sendTestDisabled}
              data-testid={`student-notification-${activeTemplate}-send-test`}
            >
              Отправить тестовое уведомление
            </button>
          </Tooltip>
        )}
      </div>

      {templateConfigs
        .filter((config) => config.id === activeTemplate)
        .map((config) => (
          <div key={config.id}>
          <TemplateEditor
            config={config}
            value={values[config.id]}
            onValueChange={(nextValue) => updateValue(config.id, nextValue)}
            error={errors[config.id]}
            onSave={() => handleSave(config)}
            onReset={() => handleReset(config)}
            isDirty={dirtyById[config.id]}
            previewExample={
              config.id === 'lesson'
                ? STUDENT_LESSON_TEMPLATE_EXAMPLES[examples[config.id]]
                : STUDENT_PAYMENT_TEMPLATE_EXAMPLES[examples[config.id]]
            }
            example={examples[config.id]}
            onExampleChange={(value) => setExamples((prev) => ({ ...prev, [config.id]: value }))}
            onSendTest={() => {
              if (sendTestDisabled) return;
              setIsSendTestOpen(true);
            }}
            sendTestDisabled={sendTestDisabled}
            sendTestHint={sendTestHint}
            isMobile={isMobile}
          />
          <SendTestNotificationModal
            open={isSendTestOpen}
            variant={isMobile ? 'sheet' : 'modal'}
            onClose={() => setIsSendTestOpen(false)}
            templateType={config.templateType}
            templateLabel={config.label}
            templateText={values[config.id]}
            isDirty={values[config.id] !== resolvedValues[config.id]}
            allowedVariables={config.allowedVariables}
            exampleKey={examples[config.id]}
            onExampleChange={(value) => setExamples((prev) => ({ ...prev, [config.id]: value }))}
            onSaveNow={onSaveNow}
            saveField={config.field}
            examples={
              config.id === 'lesson' ? STUDENT_LESSON_TEMPLATE_EXAMPLES : STUDENT_PAYMENT_TEMPLATE_EXAMPLES
            }
          />
          </div>
        ))}
    </div>
  );
};
