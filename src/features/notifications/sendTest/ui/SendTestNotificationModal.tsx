import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import { useToast } from '@/shared/lib/toast';
import { trackEvent } from '@/shared/lib/analytics';
import { renderNotificationTemplate } from '@/shared/lib/notificationTemplateRender';
import { STUDENT_TEMPLATE_MAX_LENGTH, TemplateExampleKey } from '@/shared/lib/notificationTemplates';
import { useFocusTrap } from '@/shared/lib/useFocusTrap';
import controls from '@/shared/styles/controls.module.css';
import modalStyles from '../../../modals/modal.module.css';
import styles from './SendTestNotificationModal.module.css';
import { useTestRecipients } from '../model/useTestRecipients';
import { api } from '@/shared/api/client';
import { Teacher } from '@/entities/types';

export type NotificationTemplateType = 'LESSON_REMINDER' | 'PAYMENT_REMINDER';
export type RecipientMode = 'SELF' | 'STUDENTS';
export type DataSource = 'PREVIEW_EXAMPLE_A' | 'PREVIEW_EXAMPLE_B';

type SendTestResponse = {
  status: 'ok' | 'partial' | 'error';
  rendered_text: string;
  missing_data: string[];
  results?: Array<{ student_id: number; status: 'ok' | 'error'; error_code?: string }>;
  channel?: string;
};

interface SendTestNotificationModalProps {
  open: boolean;
  variant?: 'modal' | 'sheet';
  onClose: () => void;
  templateType: NotificationTemplateType;
  templateLabel: string;
  templateText: string;
  isDirty: boolean;
  allowedVariables: readonly string[];
  exampleKey: TemplateExampleKey;
  onExampleChange: (value: TemplateExampleKey) => void;
  onSaveNow: (patch: Partial<Teacher>) => Promise<{ ok: boolean; error?: string }>;
  saveField: 'studentUpcomingLessonTemplate' | 'studentPaymentDueTemplate';
  examples: Record<TemplateExampleKey, Record<string, string>>;
}

const formatTokens = (tokens: string[]) => tokens.map((token) => `{{${token}}}`).join(', ');

const parseErrorCode = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message ?? error.message;
  } catch {
    return error.message;
  }
};

const resolveErrorMessage = (code: string | null) => {
  switch (code) {
    case 'no_channel':
      return 'Подключите Telegram, чтобы отправлять тест.';
    case 'empty_text':
      return 'Текст уведомления не может быть пустым.';
    case 'template_too_long':
      return `Текст уведомления не должен превышать ${STUDENT_TEMPLATE_MAX_LENGTH} символов.`;
    case 'student_required':
      return 'Выберите хотя бы одного ученика.';
    case 'too_many_students':
      return 'Можно выбрать не более 5 учеников.';
    case 'rate_limited':
      return 'Слишком часто. Попробуйте позже.';
    case 'student_not_eligible':
      return 'Ученик недоступен для отправки.';
    case 'invalid_template':
      return 'Исправьте неизвестные переменные, чтобы отправить тест.';
    default:
      return 'Не удалось отправить тест. Повторите попытку.';
  }
};

const resolveResultError = (code?: string) => {
  switch (code) {
    case 'NO_CHANNEL':
    case 'no_channel':
      return 'нет канала';
    case 'STUDENT_NOT_ELIGIBLE':
    case 'student_not_eligible':
      return 'ученик недоступен';
    case 'RATE_LIMITED':
    case 'rate_limited':
      return 'лимит';
    default:
      return 'ошибка';
  }
};

export const SendTestNotificationModal: FC<SendTestNotificationModalProps> = ({
  open,
  variant = 'modal',
  onClose,
  templateType,
  templateLabel,
  templateText,
  isDirty,
  allowedVariables,
  exampleKey,
  onExampleChange,
  onSaveNow,
  saveField,
  examples,
}) => {
  const { showToast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, containerRef);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('SELF');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>(
    exampleKey === 'A' ? 'PREVIEW_EXAMPLE_A' : 'PREVIEW_EXAMPLE_B',
  );
  const [textVersion, setTextVersion] = useState<'DRAFT' | 'SAVED'>(isDirty ? 'DRAFT' : 'SAVED');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sendResult, setSendResult] = useState<SendTestResponse | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const openedRef = useRef(false);
  const missingTrackedRef = useRef(false);
  const unknownTrackedRef = useRef(false);

  const { students, status: studentsStatus, refresh: refreshStudents } = useTestRecipients({
    open,
    type: templateType,
  });

  const studentsMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const selectedStudents = selectedStudentIds.map((id) => studentsMap.get(id)).filter(Boolean) as Array<
    (typeof students)[number]
  >;

  const exampleValues = examples[exampleKey];

  const previewValues = useMemo(() => {
    if (recipientMode !== 'STUDENTS') return exampleValues;
    const name = selectedStudents[0]?.name?.trim() || exampleValues.student_name || 'ученик';
    return { ...exampleValues, student_name: name };
  }, [exampleValues, recipientMode, selectedStudents]);

  const renderResult = useMemo(
    () =>
      renderNotificationTemplate({
        template: templateText,
        values: previewValues,
        allowedVariables,
      }),
    [templateText, previewValues, allowedVariables],
  );

  const validationError = useMemo(() => {
    if (!templateText.trim()) return 'Текст уведомления не может быть пустым';
    if (templateText.length > STUDENT_TEMPLATE_MAX_LENGTH) {
      return `Текст уведомления не должен превышать ${STUDENT_TEMPLATE_MAX_LENGTH} символов`;
    }
    return null;
  }, [templateText]);

  const unknownPlaceholders = renderResult.unknownPlaceholders;
  const missingData = renderResult.missingData;

  const isSending = sendStatus === 'sending';
  const canSend =
    !validationError &&
    unknownPlaceholders.length === 0 &&
    !isSending &&
    (recipientMode === 'SELF' || selectedStudentIds.length > 0);

  const closeRequest = () => {
    if (isSending) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRequest();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeRequest]);

  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      setRecipientMode('SELF');
      setSelectedStudentIds([]);
      setDataSource(exampleKey === 'A' ? 'PREVIEW_EXAMPLE_A' : 'PREVIEW_EXAMPLE_B');
      setTextVersion(isDirty ? 'DRAFT' : 'SAVED');
      setSendStatus('idle');
      setSendResult(null);
      setSendError(null);
      setHelpOpen(false);
      missingTrackedRef.current = false;
      unknownTrackedRef.current = false;
      trackEvent('notif_test_open', { type: templateType, isDirty, activePreviewExample: exampleKey });
    }
    if (!open) {
      openedRef.current = false;
    }
  }, [open, exampleKey, isDirty, templateType]);

  useEffect(() => {
    if (!open) return;
    setDataSource(exampleKey === 'A' ? 'PREVIEW_EXAMPLE_A' : 'PREVIEW_EXAMPLE_B');
  }, [exampleKey, open]);

  useEffect(() => {
    if (!open) return;
    if (!isDirty) {
      setTextVersion('SAVED');
    }
  }, [isDirty, open]);

  useEffect(() => {
    if (!open) return;
    if (unknownPlaceholders.length > 0 && !unknownTrackedRef.current) {
      unknownTrackedRef.current = true;
      trackEvent('notif_test_validation_error', { type: templateType, unknownCount: unknownPlaceholders.length });
    }
    if (unknownPlaceholders.length === 0) {
      unknownTrackedRef.current = false;
    }
  }, [open, templateType, unknownPlaceholders]);

  useEffect(() => {
    if (!open) return;
    if (missingData.length > 0 && !missingTrackedRef.current) {
      missingTrackedRef.current = true;
      trackEvent('notif_test_missing_data_warning_shown', { type: templateType, missingCount: missingData.length });
    }
    if (missingData.length === 0) {
      missingTrackedRef.current = false;
    }
  }, [open, templateType, missingData]);

  const handleRecipientChange = (mode: RecipientMode) => {
    setRecipientMode(mode);
    const count = mode === 'SELF' ? 1 : selectedStudentIds.length;
    trackEvent('notif_test_recipient_change', { type: templateType, mode, count });
  };

  const handleExampleChange = (next: TemplateExampleKey) => {
    onExampleChange(next);
    const source = next === 'A' ? 'PREVIEW_EXAMPLE_A' : 'PREVIEW_EXAMPLE_B';
    setDataSource(source);
    trackEvent('notif_test_datasource_change', { type: templateType, source });
  };

  const toggleStudent = (studentId: number) => {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      if (prev.length >= 5) {
        showToast({ message: 'Можно выбрать не более 5 учеников', variant: 'error' });
        return prev;
      }
      return [...prev, studentId];
    });
  };

  useEffect(() => {
    if (!open) return;
    if (recipientMode !== 'STUDENTS') return;
    trackEvent('notif_test_recipient_change', {
      type: templateType,
      mode: recipientMode,
      count: selectedStudentIds.length,
    });
  }, [open, recipientMode, selectedStudentIds.length, templateType]);

  const handleSend = async (overrideStudentIds?: number[]) => {
    const resolvedStudentIds = overrideStudentIds ?? selectedStudentIds;
    const hasRecipients = recipientMode === 'SELF' || resolvedStudentIds.length > 0;
    if (validationError || unknownPlaceholders.length > 0 || isSending || !hasRecipients) return;
    setSendStatus('sending');
    setSendError(null);
    trackEvent('notif_test_send_click', {
      type: templateType,
      mode: recipientMode,
      count: recipientMode === 'SELF' ? 1 : resolvedStudentIds.length,
      isDirty,
      saveBeforeSend: isDirty ? textVersion === 'SAVED' : false,
    });

    if (isDirty && textVersion === 'SAVED') {
      const saveResult = await onSaveNow({ [saveField]: templateText });
      if (!saveResult.ok) {
        setSendStatus('error');
        setSendError('Не удалось сохранить изменения');
        return;
      }
    }

    try {
      const payload = {
        type: templateType,
        template_text: templateText,
        recipient_mode: recipientMode,
        student_ids: recipientMode === 'STUDENTS' ? resolvedStudentIds : undefined,
        data_source: dataSource,
        text_version: isDirty ? textVersion : 'SAVED',
      };
      const response = await api.sendNotificationTest(payload);

      const totalCount = recipientMode === 'SELF' ? 1 : resolvedStudentIds.length;
      const okCount =
        response.status === 'partial'
          ? response.results?.filter((item) => item.status === 'ok').length ?? 0
          : response.status === 'ok'
            ? totalCount
            : 0;
      const failCount =
        response.status === 'partial'
          ? response.results?.filter((item) => item.status === 'error').length ?? 0
          : response.status === 'error'
            ? totalCount
            : 0;

      trackEvent('notif_test_send_result', {
        type: templateType,
        status: response.status,
        count_ok: okCount,
        count_fail: failCount,
      });

      if (response.status === 'error') {
        setSendStatus('error');
        setSendResult(null);
        setSendError('Не удалось отправить тест. Повторите попытку.');
        return;
      }

      setSendResult(response);
      setSendStatus('success');

      if (response.status === 'ok') {
        showToast({ message: 'Тест отправлен', variant: 'success' });
      }

      if (response.status === 'partial') {
        showToast({ message: 'Тест отправлен частично', variant: 'success' });
      }
    } catch (error) {
      const code = parseErrorCode(error);
      const message = resolveErrorMessage(code);
      setSendStatus('error');
      setSendError(message);
      trackEvent('notif_test_send_result', {
        type: templateType,
        status: 'error',
        error_code: code ?? 'unknown',
      });
    }
  };

  const handleSendAgain = () => {
    setSendStatus('idle');
    setSendResult(null);
    setSendError(null);
  };

  const handleRetryErrors = () => {
    if (!sendResult?.results) return;
    const errorIds = sendResult.results.filter((item) => item.status === 'error').map((item) => item.student_id);
    if (errorIds.length === 0) return;
    setSelectedStudentIds(errorIds);
    setSendStatus('idle');
    setSendResult(null);
    setSendError(null);
    void handleSend(errorIds);
  };

  const handleCopyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast({ message: 'Текст скопирован', variant: 'success' });
        return;
      }
      showToast({ message: 'Не удалось скопировать текст', variant: 'error' });
    } catch (error) {
      showToast({ message: 'Не удалось скопировать текст', variant: 'error' });
    }
  };

  const resultsView = sendResult || sendStatus === 'error';

  const content = (
    <div
      className={`${modalStyles.modal} ${variant === 'sheet' ? styles.sheetModal : ''}`}
      onClick={(event) => event.stopPropagation()}
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-test-title"
    >
      <div className={modalStyles.modalHeader}>
        <div>
          <div className={modalStyles.modalTitle} id="send-test-title">
            Тестовое уведомление: {templateLabel}
          </div>
        </div>
        <button className={modalStyles.closeButton} onClick={closeRequest} aria-label="Закрыть модалку">
          ×
        </button>
      </div>

      <div className={modalStyles.modalBody}>
        {resultsView ? (
          <div className={styles.resultView}>
            {sendStatus === 'error' && !sendResult && (
              <div className={styles.errorBlock}>
                <div className={styles.errorTitle}>Не удалось отправить тест</div>
                <div className={styles.errorText}>{sendError ?? 'Повторите попытку.'}</div>
              </div>
            )}

            {sendResult && (
              <>
                <div className={styles.resultHeader}>Готово</div>
                <div className={styles.resultMeta}>Тип: {templateLabel}</div>
                <div className={styles.resultMeta}>
                  Куда:{' '}
                  {recipientMode === 'SELF'
                    ? 'себе'
                    : selectedStudents.length > 1
                      ? `${selectedStudents.length} ученика`
                      : selectedStudents[0]?.name ?? 'ученик'}
                </div>
                <div className={styles.resultMeta}>Канал: Telegram</div>

                {sendResult.status === 'partial' && sendResult.results && (
                  <div className={styles.partialResults}>
                    <div className={styles.resultSubTitle}>
                      Отправлено: {sendResult.results.filter((item) => item.status === 'ok').length} из{' '}
                      {sendResult.results.length}
                    </div>
                    <div className={styles.resultList}>
                      {sendResult.results.map((item) => (
                        <div key={item.student_id} className={styles.resultRow}>
                          <span>{studentsMap.get(item.student_id)?.name ?? 'ученик'}</span>
                          <span className={item.status === 'ok' ? styles.resultOk : styles.resultFail}>
                            {item.status === 'ok' ? 'отправлено' : `ошибка: ${resolveResultError(item.error_code)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.previewCard}>
                  <div className={styles.previewTitle}>Отправленное сообщение</div>
                  <div className={styles.previewText}>{sendResult.rendered_text}</div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.form}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Кому отправить</div>
              <div className={styles.segmented} role="tablist" aria-label="Выбор получателя">
                <button
                  type="button"
                  role="tab"
                  aria-selected={recipientMode === 'SELF'}
                  className={`${styles.segmentButton} ${recipientMode === 'SELF' ? styles.segmentButtonActive : ''}`}
                  onClick={() => handleRecipientChange('SELF')}
                  disabled={isSending}
                >
                  Себе
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={recipientMode === 'STUDENTS'}
                  className={`${styles.segmentButton} ${recipientMode === 'STUDENTS' ? styles.segmentButtonActive : ''}`}
                  onClick={() => handleRecipientChange('STUDENTS')}
                  disabled={isSending}
                >
                  Ученику
                </button>
              </div>
            </div>

            {recipientMode === 'STUDENTS' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Выбор ученика</div>
                {studentsStatus === 'loading' && <div className={styles.helperText}>Загрузка…</div>}
                {studentsStatus === 'error' && (
                  <div className={styles.errorBlock}>
                    Не удалось загрузить список учеников.
                    <button type="button" className={styles.retryButton} onClick={refreshStudents}>
                      Повторить
                    </button>
                  </div>
                )}
                {studentsStatus === 'ready' && students.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyTitle}>Нет доступных учеников</div>
                    <div className={styles.emptyText}>
                      Ученик должен активировать уведомления, чтобы получать сообщения.
                    </div>
                    <AdaptivePopover
                      isOpen={helpOpen}
                      onClose={() => setHelpOpen(false)}
                      trigger={
                        <button
                          type="button"
                          className={styles.helpButton}
                          onClick={() => setHelpOpen((prev) => !prev)}
                        >
                          Как активировать?
                        </button>
                      }
                      side="top"
                      align="start"
                      className={styles.helpPopover}
                    >
                      <div className={styles.helpContent}>
                        <div>1) Откройте бот TeacherBot в Telegram</div>
                        <div>2) Нажмите “Старт”</div>
                        <div>3) Выбрать роль “Я ученик”</div>
                      </div>
                    </AdaptivePopover>
                  </div>
                ) : studentsStatus === 'ready' ? (
                  <>
                    <div className={styles.studentList}>
                      {students.map((student) => {
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <label key={student.id} className={styles.studentRow}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudent(student.id)}
                              disabled={isSending}
                              className={styles.optionInput}
                            />
                            <span className={styles.checkboxIndicator} aria-hidden />
                            <span>{student.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedStudentIds.length === 0 && (
                      <div className={styles.helperText}>Выберите хотя бы одного ученика.</div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Данные для подстановки</div>
              <div className={styles.segmented}>
                {(['A', 'B'] as TemplateExampleKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.segmentButton} ${exampleKey === key ? styles.segmentButtonActive : ''}`}
                    onClick={() => handleExampleChange(key)}
                    disabled={isSending}
                  >
                    Пример {key}
                  </button>
                ))}
              </div>
            </div>

            {isDirty && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Какой текст отправить?</div>
                <div className={styles.radioGroup}>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      checked={textVersion === 'DRAFT'}
                      onChange={() => setTextVersion('DRAFT')}
                      disabled={isSending}
                      className={styles.optionInput}
                    />
                    <span className={styles.radioIndicator} aria-hidden />
                    <span>Отправить черновик (не сохранит)</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      checked={textVersion === 'SAVED'}
                      onChange={() => setTextVersion('SAVED')}
                      disabled={isSending}
                      className={styles.optionInput}
                    />
                    <span className={styles.radioIndicator} aria-hidden />
                    <span>Сохранить и отправить</span>
                  </label>
                </div>
              </div>
            )}

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Что будет отправлено</div>
              <div className={styles.previewCard}>
                <div className={styles.previewText}>{renderResult.renderedText}</div>
              </div>
              {validationError && <div className={styles.errorBlock}>{validationError}</div>}
              {unknownPlaceholders.length > 0 && (
                <div className={styles.errorBlock}>
                  Неизвестная переменная: {formatTokens(unknownPlaceholders)}. Исправьте, чтобы отправить тест.
                </div>
              )}
              {missingData.length > 0 && (
                <div className={styles.warningBlock}>
                  Не хватает данных: {formatTokens(missingData)}. В сообщении будет “—”.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`${modalStyles.modalActions} ${variant === 'sheet' ? styles.sheetActions : ''}`}>
        {resultsView ? (
          sendStatus === 'error' && !sendResult ? (
            <>
              <button className={controls.secondaryButton} onClick={closeRequest} disabled={isSending}>
                Закрыть
              </button>
              <button
                className={controls.primaryButton}
                onClick={() => {
                  void handleSend();
                }}
                disabled={isSending}
              >
                Повторить
              </button>
            </>
          ) : (
            <>
              {sendResult?.status === 'partial' && (
                <button className={controls.secondaryButton} onClick={handleRetryErrors} disabled={isSending}>
                  Повторить только ошибки
                </button>
              )}
              <button className={controls.secondaryButton} onClick={handleSendAgain} disabled={isSending}>
                Отправить ещё раз
              </button>
              {sendResult && (
                <button
                  className={controls.secondaryButton}
                  onClick={() => handleCopyText(sendResult.rendered_text)}
                  disabled={isSending}
                >
                  Скопировать текст
                </button>
              )}
              <button className={controls.primaryButton} onClick={closeRequest} disabled={isSending}>
                Закрыть
              </button>
            </>
          )
        ) : (
          <>
            <button className={controls.secondaryButton} onClick={closeRequest} disabled={isSending}>
              Отмена
            </button>
            <button
              className={controls.primaryButton}
              onClick={() => {
                void handleSend();
              }}
              disabled={!canSend || isSending}
            >
              {isSending ? 'Отправляем…' : 'Отправить тест'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (!open) return null;

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={closeRequest}>
        {content}
      </BottomSheet>
    );
  }

  return (
    <div className={modalStyles.modalOverlay} onClick={closeRequest}>
      {content}
    </div>
  );
};
