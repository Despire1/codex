import { type FC } from 'react';
import { BottomSheet } from '../../shared/ui/BottomSheet/BottomSheet';
import { Modal } from '../../shared/ui/Modal/Modal';
import controls from '../../shared/styles/controls.module.css';
import styles from './ConnectTelegramSheet.module.css';

interface ConnectTelegramSheetProps {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  studentUsername?: string | null;
  variant?: 'modal' | 'sheet';
}

export const ConnectTelegramSheet: FC<ConnectTelegramSheetProps> = ({
  open,
  onClose,
  onContinue,
  studentUsername,
  variant = 'modal',
}) => {
  const handleOpenChat = () => {
    const username = studentUsername?.trim();
    if (!username) return;
    const sanitized = username.replace(/^@/, '');
    window.location.href = `tg://resolve?domain=${sanitized}`;
  };

  const content = (
    <div className={styles.content}>
      <p className={styles.text}>
        Чтобы напоминания доходили, ученик должен нажать кнопку /start в Telegram‑боте.
      </p>
      {studentUsername && (
        <button type="button" className={controls.secondaryButton} onClick={handleOpenChat}>
          Открыть чат с @{studentUsername.replace(/^@/, '')}
        </button>
      )}
      <div className={styles.actions}>
        <button type="button" className={controls.secondaryButton} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={controls.primaryButton} onClick={onContinue}>
          Я попросил ученика
        </button>
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={onClose}>
        <div className={styles.sheetTitle}>Подключение Telegram</div>
        {content}
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <Modal open={open} title="Подключение Telegram" onClose={onClose}>
      {content}
    </Modal>
  );
};
