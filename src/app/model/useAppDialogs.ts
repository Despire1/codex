import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react';
import { type DialogState } from '../components/AppModals';

export type OpenConfirmDialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export type OpenRecurringDeleteDialogOptions = {
  title: string;
  message: string;
  applyToSeries?: boolean;
  onConfirm: (applyToSeries: boolean) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export type OpenPaymentCancelDialogOptions = {
  title: string;
  message: string;
  helperText?: string;
  refundText?: string;
  writeOffText?: string;
  onRefund: () => void | Promise<void>;
  onWriteOff: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export type OpenPaymentBalanceDialogOptions = {
  title: string;
  message: string;
  onWriteOff: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export type OpenLessonEditPaymentResetDialogOptions = {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
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
  openLessonEditPaymentResetDialog: (options: OpenLessonEditPaymentResetDialogOptions) => void;
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
        onConfirm: async () => {
          await options.onConfirm();
          closeDialog();
        },
        onCancel: async () => {
          await options.onCancel?.();
          closeDialog();
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
        onConfirm: async (applyToSeries) => {
          await options.onConfirm(applyToSeries);
          closeDialog();
        },
        onCancel: async () => {
          await options.onCancel?.();
          closeDialog();
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
        helperText: options.helperText,
        refundText: options.refundText,
        writeOffText: options.writeOffText,
        onRefund: async () => {
          await options.onRefund();
          closeDialog();
        },
        onWriteOff: async () => {
          await options.onWriteOff();
          closeDialog();
        },
        onCancel: async () => {
          await options.onCancel?.();
          closeDialog();
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
        onWriteOff: async () => {
          await options.onWriteOff();
          closeDialog();
        },
        onSkip: async () => {
          await options.onSkip();
          closeDialog();
        },
        onCancel: async () => {
          await options.onCancel?.();
          closeDialog();
        },
      });
    },
    [closeDialog],
  );

  const openLessonEditPaymentResetDialog = useCallback(
    (options: OpenLessonEditPaymentResetDialogOptions) => {
      setDialogState({
        type: 'lesson-edit-payment-reset',
        title: options.title,
        message: options.message,
        onConfirm: async () => {
          await options.onConfirm();
          closeDialog();
        },
        onCancel: async () => {
          await options.onCancel?.();
          closeDialog();
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
      openLessonEditPaymentResetDialog,
    }),
    [
      closeDialog,
      dialogState,
      openConfirmDialog,
      openLessonEditPaymentResetDialog,
      openPaymentBalanceDialog,
      openPaymentCancelDialog,
      openRecurringDeleteDialog,
      showInfoDialog,
    ],
  );
};
