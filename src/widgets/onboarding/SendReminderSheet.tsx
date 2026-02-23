import { type FC } from 'react';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { Modal } from '../../shared/ui/Modal/Modal';
import controls from '../../shared/styles/controls.module.css';
import styles from './SendReminderSheet.module.css';
import {
  ONBOARDING_REMINDER_TEMPLATES,
  type OnboardingReminderTemplate,
} from '../../shared/lib/onboardingReminder';

interface SendReminderSheetProps {
  open: boolean;
  onClose: () => void;
  template: OnboardingReminderTemplate;
  onTemplateChange: (template: OnboardingReminderTemplate) => void;
  previewText: string;
  onSend: () => void;
  isSending: boolean;
  variant?: 'modal' | 'sheet';
}

export const SendReminderSheet: FC<SendReminderSheetProps> = ({
  open,
  onClose,
  template,
  onTemplateChange,
  previewText,
  onSend,
  isSending,
  variant = 'modal',
}) => {
  const content = (
    <div className={styles.content}>
      <div className={styles.templateList}>
        {ONBOARDING_REMINDER_TEMPLATES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.template} ${template === item.id ? styles.templateActive : ''}`}
            onClick={() => onTemplateChange(item.id)}
          >
            <div className={styles.templateTitle}>{item.title}</div>
            <div className={styles.templateHint}>{item.hint}</div>
          </button>
        ))}
      </div>
      <div className={styles.preview}>
        <div className={styles.previewTitle}>Предпросмотр</div>
        <div className={styles.previewText}>{previewText}</div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={controls.secondaryButton} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={controls.primaryButton} onClick={onSend} disabled={isSending}>
          {isSending ? 'Отправляем…' : 'Отправить'}
        </button>
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={onClose}>
        <div className={styles.sheetTitle}>Напоминание</div>
        {content}
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <Modal open={open} title="Напоминание" onClose={onClose}>
      {content}
    </Modal>
  );
};
