import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react';
import { type DialogState } from '../components/AppModals';

export type OpenConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export type OpenRecurringDeleteDialogOptions = {
  title: string;
  message: string;
  applyToSeries?: boolean;
  onConfirm: (applyToSeries: boolean) => void;
  onCancel?: () => void;
};

export type OpenPaymentCancelDialogOptions = {
  title: string;
  message: string;
  onRefund: () => void;
  onWriteOff: () => void;
  onCancel?: () => void;
};

export type OpenPaymentBalanceDialogOptions = {
  title: string;
  message: string;
  onWriteOff: () => void;
  onSkip: () => void;
  onCancel?: () => void;
};

export type AppDialogsValue = {
  dialogState: DialogState;
  setDialogState: Dispatch<SetStateAction<DialogState>>;
  closeDialog: () => void;
  showInfoDialog: (title: string, message: string, confirmText?: string) => void;
  openConfirmDialog: (options: OpenConfirmDialogOptions) => void;
  openRecurringDeleteDialog: (options: OpenRecurringDeleteDialogOptions) => void;
  openPaymentCancelDialog: (options: OpenPaymentCancelDialogOptions) => void;
  openPaymentBalanceDialog: (options: OpenPaymentBalanceDialogOptions) => void;
};

export const useAppDialogs = (): AppDialogsValue => {
  const [dialogState, setDialogState] = useState<DialogState>(null);

  const closeDialog = useCallback(() => {
    setDialogState(null);
  }, []);

  const showInfoDialog = useCallback((title: string, message: string, confirmText?: string) => {
    setDialogState({ type: 'info', title, message, confirmText });
  }, []);

  const openConfirmDialog = useCallback(
    (options: OpenConfirmDialogOptions) => {
      setDialogState({
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        onConfirm: () => {
          closeDialog();
          options.onConfirm();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openRecurringDeleteDialog = useCallback(
    (options: OpenRecurringDeleteDialogOptions) => {
      setDialogState({
        type: 'recurring-delete',
        title: options.title,
        message: options.message,
        applyToSeries: options.applyToSeries ?? false,
        onConfirm: (applyToSeries) => {
          closeDialog();
          options.onConfirm(applyToSeries);
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openPaymentCancelDialog = useCallback(
    (options: OpenPaymentCancelDialogOptions) => {
      setDialogState({
        type: 'payment-cancel',
        title: options.title,
        message: options.message,
        onRefund: () => {
          closeDialog();
          options.onRefund();
        },
        onWriteOff: () => {
          closeDialog();
          options.onWriteOff();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openPaymentBalanceDialog = useCallback(
    (options: OpenPaymentBalanceDialogOptions) => {
      setDialogState({
        type: 'payment-balance',
        title: options.title,
        message: options.message,
        onWriteOff: () => {
          closeDialog();
          options.onWriteOff();
        },
        onSkip: () => {
          closeDialog();
          options.onSkip();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  return useMemo(
    () => ({
      dialogState,
      setDialogState,
      closeDialog,
      showInfoDialog,
      openConfirmDialog,
      openRecurringDeleteDialog,
      openPaymentCancelDialog,
      openPaymentBalanceDialog,
    }),
    [
      closeDialog,
      dialogState,
      openConfirmDialog,
      openPaymentBalanceDialog,
      openPaymentCancelDialog,
      openRecurringDeleteDialog,
      showInfoDialog,
    ],
  );
};
