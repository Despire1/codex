import { ReactNode } from 'react';

export type ToastVariant = 'success' | 'error';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  icon?: ReactNode;
  durationMs?: number;
  backgroundColor?: string;
  textColor?: string;
}

export interface ToastController {
  showToast: (options: ToastOptions) => void;
}
