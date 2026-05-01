import { type FC, type SVGProps, useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './StudentModal.module.css';
import modalStyles from '../modal.module.css';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { isValidEmail, normalizeEmail } from '../../../shared/lib/email';
import { type StudentModalFocusField } from './types';

type StudentModalErrors = {
  customName?: string;
  pricePerLesson?: string;
  email?: string;
};

interface StudentModalDraft {
  customName: string;
  username: string;
  pricePerLesson: string;
  email: string;
  phone: string;
  studentLevel: string;
  learningGoal: string;
  notes: string;
}

interface StudentModalProps {
  open: boolean;
  onClose: () => void;
  draft: StudentModalDraft;
  emailSuggestions: string[];
  isEditing: boolean;
  isSubmitting?: boolean;
  focusField?: StudentModalFocusField | null;
  onDraftChange: (draft: StudentModalDraft) => void;
  onSubmit: () => void;
  variant?: 'modal' | 'sheet';
}

const sanitizeTelegramUsername = (value: string) => {
  const withoutAt = value.replace(/^@+/, '');
  return withoutAt.replace(/[^a-zA-Z0-9_]/g, '');
};

const formatPhoneInput = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length <= 11) {
    digits = '7' + digits.slice(1);
  }
  if (!digits) return '';
  if (!digits.startsWith('7')) {
    digits = '7' + digits;
  }
  digits = digits.slice(0, 11);
  const parts = ['+7'];
  if (digits.length > 1) parts.push(' (' + digits.slice(1, Math.min(4, digits.length)));
  if (digits.length >= 4) parts[parts.length - 1] += ')';
  if (digits.length > 4) parts.push(' ' + digits.slice(4, Math.min(7, digits.length)));
  if (digits.length > 7) parts.push('-' + digits.slice(7, Math.min(9, digits.length)));
  if (digits.length > 9) parts.push('-' + digits.slice(9, 11));
  return parts.join('');
};

const UserPlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 640 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3zM504 312V248H440c-13.3 0-24-10.7-24-24s10.7-24 24-24h64V136c0-13.3 10.7-24 24-24s24 10.7 24 24v64h64c13.3 0 24 10.7 24 24s-10.7 24-24 24H552v64c0 13.3-10.7 24-24 24s-24-10.7-24-24z" />
  </svg>
);

const TelegramIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 496 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm114.95 168.66c-3.73 39.21-19.88 134.37-28.1 178.3-3.47 18.58-10.32 24.81-16.95 25.42-14.39 1.33-25.33-9.51-39.28-18.66-21.83-14.31-34.16-23.21-55.35-37.18-24.49-16.13-8.61-24.99 5.34-39.49 3.65-3.8 67.11-61.51 68.34-66.75.15-.65.3-3.1-1.16-4.38-1.45-1.28-3.59-.85-5.13-.5q-3.28.75-104.61 69.14-14.83 10.2-26.89 9.94c-8.85-.19-25.89-5.01-38.55-9.12-15.53-5.05-27.88-7.72-26.8-16.29q.84-6.7 18.45-13.7 108.45-47.25 144.63-62.3c68.87-28.64 83.18-33.62 92.51-33.79 2.05-.03 6.64.47 9.61 2.89a10.4 10.4 0 0 1 3.53 6.71 43.6 43.6 0 0 1 .33 9.77z" />
  </svg>
);

const RubleSignIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M96 32C78.3 32 64 46.3 64 64V256H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H64v32H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H64v32c0 17.7 14.3 32 32 32s32-14.3 32-32V416H288c17.7 0 32-14.3 32-32s-14.3-32-32-32H128V320H240c79.5 0 144-64.5 144-144s-64.5-144-144-144H96zM240 256H128V96H240c44.2 0 80 35.8 80 80s-35.8 80-80 80z" />
  </svg>
);

const EnvelopeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4 0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z" />
  </svg>
);

const PhoneIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64 0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z" />
  </svg>
);

const XMarkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
  </svg>
);

const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z" />
  </svg>
);

export const StudentModal: FC<StudentModalProps> = ({
  open,
  onClose,
  draft,
  emailSuggestions,
  isEditing,
  isSubmitting = false,
  focusField = null,
  onDraftChange,
  onSubmit,
  variant = 'modal',
}) => {
  const emailSuggestionsId = useId();
  const customNameInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const levelInputRef = useRef<HTMLInputElement | null>(null);
  const [highlightedField, setHighlightedField] = useState<StudentModalFocusField | null>(null);
  const [usernameSanitizedNotice, setUsernameSanitizedNotice] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitAttempted(false);
      setUsernameSanitizedNotice(false);
    }
  }, [open]);

  const validationErrors = useMemo<StudentModalErrors>(() => {
    const errors: StudentModalErrors = {};
    if (!draft.customName.trim()) {
      errors.customName = 'Укажите имя ученика';
    }
    const trimmedPrice = draft.pricePerLesson.trim();
    if (!trimmedPrice) {
      errors.pricePerLesson = 'Укажите цену занятия';
    } else {
      const numericPrice = Number(trimmedPrice);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        errors.pricePerLesson = 'Цена должна быть положительной';
      }
    }
    const normalizedEmail = normalizeEmail(draft.email);
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      errors.email = 'Введите корректный email';
    }
    return errors;
  }, [draft.customName, draft.email, draft.pricePerLesson]);

  const showError = (field: keyof StudentModalErrors) => submitAttempted && Boolean(validationErrors[field]);

  const handleFormSubmit = () => {
    setSubmitAttempted(true);
    if (Object.keys(validationErrors).length > 0) {
      const fieldOrder: Array<keyof StudentModalErrors> = ['customName', 'pricePerLesson', 'email'];
      const firstInvalid = fieldOrder.find((field) => validationErrors[field]);
      if (firstInvalid === 'customName') {
        customNameInputRef.current?.focus();
      } else if (firstInvalid === 'pricePerLesson') {
        priceInputRef.current?.focus();
      } else if (firstInvalid === 'email') {
        emailInputRef.current?.focus();
      }
      return;
    }
    onSubmit();
  };

  useEffect(() => {
    if (!open || !focusField || isSubmitting) {
      return;
    }

    const refByField: Record<StudentModalFocusField, typeof priceInputRef> = {
      price: priceInputRef,
      email: emailInputRef,
      phone: phoneInputRef,
      level: levelInputRef,
    };
    const targetRef = refByField[focusField];

    const focusTimer = window.setTimeout(() => {
      const input = targetRef.current;
      if (!input) return;
      input.focus();
      input.select();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedField(focusField);
    }, 80);

    const highlightTimer = window.setTimeout(() => {
      setHighlightedField((current) => (current === focusField ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [focusField, isSubmitting, open]);

  const modalContent = (
    <div
      className={`${styles.modalContent} ${variant === 'sheet' ? styles.sheetModalContent : ''}`}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Редактирование ученика' : 'Добавление ученика'}
    >
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerIcon} aria-hidden>
            <UserPlusIcon className={styles.headerIconSvg} />
          </div>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{isEditing ? 'Редактировать ученика' : 'Добавить ученика'}</h2>
            <p className={styles.subtitle}>
              {isEditing ? 'Обновите информацию об ученике' : 'Заполните информацию о новом ученике'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Закрыть"
          disabled={isSubmitting}
        >
          <XMarkIcon className={styles.closeButtonIcon} />
        </button>
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          handleFormSubmit();
        }}
        noValidate
      >
        <div className={styles.mainGrid}>
          <div className={`${styles.field} ${styles.fieldFull} ${showError('customName') ? styles.fieldInvalid : ''}`}>
            <label className={styles.label} htmlFor="student-custom-name">
              Имя <span className={styles.requiredMark}>*</span>
            </label>
            <input
              id="student-custom-name"
              ref={customNameInputRef}
              className={styles.input}
              type="text"
              autoComplete="name"
              placeholder="Введите имя ученика"
              value={draft.customName}
              disabled={isSubmitting}
              aria-invalid={showError('customName') || undefined}
              aria-describedby={showError('customName') ? 'student-custom-name-error' : undefined}
              onChange={(event) => onDraftChange({ ...draft, customName: event.target.value })}
            />
            {showError('customName') ? (
              <p id="student-custom-name-error" className={styles.fieldError}>
                {validationErrors.customName}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="student-telegram-username">
              Telegram username
            </label>
            <div className={styles.inputWithIcon}>
              <span className={styles.leadingIcon} aria-hidden>
                <TelegramIcon className={styles.leadingIconSvg} />
              </span>
              <span className={styles.telegramPrefix} aria-hidden>
                @
              </span>
              <input
                id="student-telegram-username"
                className={`${styles.input} ${styles.inputWithLeadingIcon} ${styles.telegramInput}`}
                type="text"
                autoComplete="off"
                inputMode="text"
                placeholder="username (необязательно)"
                value={draft.username}
                disabled={isSubmitting}
                onChange={(event) => {
                  const raw = event.target.value;
                  const sanitized = sanitizeTelegramUsername(raw);
                  if (sanitized.length < raw.replace(/^@+/, '').length && raw.replace(/^@+/, '').length > 0) {
                    setUsernameSanitizedNotice(true);
                  } else if (!sanitized) {
                    setUsernameSanitizedNotice(false);
                  }
                  onDraftChange({ ...draft, username: sanitized });
                }}
              />
            </div>
            {usernameSanitizedNotice ? (
              <p className={`${styles.fieldHint} ${styles.fieldHintWarning}`}>
                Пробелы и спецсимволы недопустимы — удалены автоматически.
              </p>
            ) : (
              <p className={styles.fieldHint}>Необязательно. Используется для Telegram-уведомлений.</p>
            )}
          </div>

          <div
            className={`${styles.field} ${highlightedField === 'price' ? styles.fieldHighlighted : ''} ${
              showError('pricePerLesson') ? styles.fieldInvalid : ''
            }`}
          >
            <label className={styles.label} htmlFor="student-price">
              Цена занятия <span className={styles.requiredMark}>*</span>
            </label>
            <div className={styles.inputWithIcon}>
              <span className={styles.leadingIcon} aria-hidden>
                <RubleSignIcon className={styles.leadingIconSvg} />
              </span>
              <input
                id="student-price"
                ref={priceInputRef}
                className={`${styles.input} ${styles.inputWithLeadingIcon}`}
                type="number"
                min={0}
                placeholder="например, 1500"
                value={draft.pricePerLesson}
                disabled={isSubmitting}
                aria-invalid={showError('pricePerLesson') || undefined}
                aria-describedby={showError('pricePerLesson') ? 'student-price-error' : undefined}
                onChange={(event) => onDraftChange({ ...draft, pricePerLesson: event.target.value })}
              />
            </div>
            {showError('pricePerLesson') ? (
              <p id="student-price-error" className={styles.fieldError}>
                {validationErrors.pricePerLesson}
              </p>
            ) : null}
          </div>
        </div>

        <section className={styles.additionalSection}>
          <h3 className={styles.additionalTitle}>Дополнительная информация</h3>

          <div className={styles.additionalFields}>
            <div
              className={`${styles.field} ${highlightedField === 'email' ? styles.fieldHighlighted : ''} ${
                showError('email') ? styles.fieldInvalid : ''
              }`}
            >
              <label className={styles.secondaryLabel} htmlFor="student-email">
                Email
              </label>
              <div className={styles.inputWithIcon}>
                <span className={styles.leadingIcon} aria-hidden>
                  <EnvelopeIcon className={styles.leadingIconSvg} />
                </span>
                <input
                  id="student-email"
                  ref={emailInputRef}
                  className={`${styles.input} ${styles.inputWithLeadingIcon}`}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="student@example.com"
                  list={emailSuggestions.length > 0 ? emailSuggestionsId : undefined}
                  value={draft.email}
                  disabled={isSubmitting}
                  aria-invalid={showError('email') || undefined}
                  aria-describedby={showError('email') ? 'student-email-error' : undefined}
                  onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
                />
                {emailSuggestions.length > 0 ? (
                  <datalist id={emailSuggestionsId}>
                    {emailSuggestions.map((email) => (
                      <option key={email} value={email} />
                    ))}
                  </datalist>
                ) : null}
              </div>
              {showError('email') ? (
                <p id="student-email-error" className={styles.fieldError}>
                  {validationErrors.email}
                </p>
              ) : null}
            </div>

            <div className={`${styles.field} ${highlightedField === 'phone' ? styles.fieldHighlighted : ''}`}>
              <label className={styles.secondaryLabel} htmlFor="student-phone">
                Телефон
              </label>
              <div className={styles.inputWithIcon}>
                <span className={styles.leadingIcon} aria-hidden>
                  <PhoneIcon className={styles.leadingIconSvg} />
                </span>
                <input
                  id="student-phone"
                  ref={phoneInputRef}
                  className={`${styles.input} ${styles.inputWithLeadingIcon}`}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+7 (999) 123-45-67"
                  value={draft.phone}
                  disabled={isSubmitting}
                  onChange={(event) => onDraftChange({ ...draft, phone: formatPhoneInput(event.target.value) })}
                />
              </div>
            </div>

            <div className={`${styles.field} ${highlightedField === 'level' ? styles.fieldHighlighted : ''}`}>
              <label className={styles.secondaryLabel} htmlFor="student-level">
                Уровень ученика
              </label>
              <input
                id="student-level"
                ref={levelInputRef}
                className={styles.input}
                type="text"
                placeholder="Пока не указан"
                value={draft.studentLevel}
                disabled={isSubmitting}
                onChange={(event) => onDraftChange({ ...draft, studentLevel: event.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.secondaryLabel} htmlFor="student-goal">
                Цель обучения
              </label>
              <textarea
                id="student-goal"
                className={styles.textarea}
                rows={3}
                placeholder="Например: подготовка к экзамену, разговорная практика, бизнес-английский..."
                value={draft.learningGoal}
                disabled={isSubmitting}
                onChange={(event) => onDraftChange({ ...draft, learningGoal: event.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.secondaryLabel} htmlFor="student-notes">
                Заметки
              </label>
              <textarea
                id="student-notes"
                className={styles.textarea}
                rows={2}
                placeholder="Дополнительная информация об ученике..."
                value={draft.notes}
                disabled={isSubmitting}
                onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
              />
            </div>
          </div>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
            Отмена
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            <span className={styles.submitButtonContent}>
              {isSubmitting ? (
                <span className={styles.submitSpinner} aria-hidden />
              ) : (
                <CheckIcon className={styles.submitButtonIcon} />
              )}
              {isSubmitting
                ? isEditing
                  ? 'Сохраняем...'
                  : 'Добавляем...'
                : isEditing
                  ? 'Сохранить изменения'
                  : 'Добавить ученика'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet
        isOpen={open}
        onClose={() => {
          if (isSubmitting) return;
          onClose();
        }}
      >
        {modalContent}
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <div
      className={modalStyles.modalOverlay}
      onClick={() => {
        if (isSubmitting) return;
        onClose();
      }}
    >
      {modalContent}
    </div>
  );
};
