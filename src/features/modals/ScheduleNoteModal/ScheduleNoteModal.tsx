import { FC, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type SVGProps } from 'react';
import { ScheduleNoteType } from '../../../entities/types';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import modalStyles from '../modal.module.css';
import styles from './ScheduleNoteModal.module.css';

interface ScheduleNoteModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  dateKey: string;
  initialValue?: string;
  initialNoteType?: ScheduleNoteType;
  onClose: () => void;
  onSubmit: (payload: { content: string; noteType: ScheduleNoteType }) => Promise<void>;
  variant?: 'modal' | 'sheet';
}

const NOTE_MAX_LENGTH = 4000;

const ThumbtackIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M32 32C32 14.3 46.3 0 64 0H320c17.7 0 32 14.3 32 32s-14.3 32-32 32H290.5l11.4 148.2c36.7 19.9 65.7 53.2 79.5 94.7l1 3c3.3 9.8 1.6 20.5-4.4 28.8s-15.7 13.3-26 13.3H32c-10.3 0-19.9-4.9-26-13.3s-7.7-19.1-4.4-28.8l1-3c13.8-41.5 42.8-74.8 79.5-94.7L93.5 64H64C46.3 64 32 49.7 32 32zM160 384h64v96c0 17.7-14.3 32-32 32s-32-14.3-32-32V384z" />
  </svg>
);

const InfoCircleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z" />
  </svg>
);

const XMarkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 384 512" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
  </svg>
);

const NOTE_TYPE_OPTIONS: Array<{
  value: ScheduleNoteType;
  label: string;
  icon: FC<SVGProps<SVGSVGElement>>;
  activeClassName: string;
}> = [
  {
    value: 'IMPORTANT',
    label: 'Важная',
    icon: ThumbtackIcon,
    activeClassName: styles.typeButtonImportant,
  },
  {
    value: 'INFO',
    label: 'Информация',
    icon: InfoCircleIcon,
    activeClassName: styles.typeButtonInfo,
  },
];

export const ScheduleNoteModal: FC<ScheduleNoteModalProps> = ({
  open,
  mode,
  dateKey,
  initialValue = '',
  initialNoteType = 'IMPORTANT',
  onClose,
  onSubmit,
  variant = 'modal',
}) => {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState(initialValue);
  const [noteType, setNoteType] = useState<ScheduleNoteType>(initialNoteType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    setNoteType(initialNoteType);
    setIsSubmitting(false);
  }, [dateKey, initialNoteType, initialValue, mode, open]);

  const title = mode === 'edit' ? 'Редактировать заметку' : 'Добавить заметку';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedDraft = draft.trim();
    if (!trimmedDraft || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({ content: trimmedDraft, noteType });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!draft.trim() || isSubmitting) return;
    formRef.current?.requestSubmit();
  };

  const modalContent = (
    <div
      className={`${styles.modalContent} ${variant === 'sheet' ? styles.sheetModalContent : ''}`}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={styles.closeButton}
          disabled={isSubmitting}
          onClick={onClose}
          aria-label="Закрыть"
        >
          <XMarkIcon className={styles.closeButtonIcon} />
        </button>
      </div>

      <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.label}>Тип заметки</span>
            <div className={styles.typeGrid}>
              {NOTE_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = noteType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.typeButton} ${isActive ? option.activeClassName : ''}`}
                    disabled={isSubmitting}
                    onClick={() => setNoteType(option.value)}
                    aria-pressed={isActive}
                  >
                    <span className={styles.typeButtonIconWrap} aria-hidden>
                      <Icon className={styles.typeButtonIcon} />
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="schedule-note-content">
              Текст заметки
            </label>
            <textarea
              id="schedule-note-content"
              className={styles.textarea}
              rows={6}
              autoFocus
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Введите текст заметки..."
              value={draft}
              disabled={isSubmitting}
              onKeyDown={handleTextareaKeyDown}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting || !draft.trim()}>
            <span className={styles.submitButtonContent}>
              {isSubmitting ? <span className={styles.submitSpinner} aria-hidden /> : null}
              {isSubmitting ? (mode === 'edit' ? 'Сохраняем...' : 'Добавляем...') : mode === 'edit' ? 'Сохранить заметку' : 'Добавить заметку'}
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
        className={styles.bottomSheet}
        contentScrollable={false}
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
