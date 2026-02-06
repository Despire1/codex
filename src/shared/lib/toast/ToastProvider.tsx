import { PropsWithChildren, ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, TaskAltIcon } from '../../../icons/MaterialIcons';
import { Toast } from '../../ui/Toast/Toast';
import { ToastController, ToastOptions, ToastVariant } from './types';

const ToastContext = createContext<ToastController | null>(null);

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
  icon?: ReactNode;
  durationMs: number;
  backgroundColor: string;
  textColor: string;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_DURATION_MS = 2000;
const TRANSITION_DURATION_MS = 300;

const defaultIcons: Record<ToastVariant, ReactNode> = {
  success: <TaskAltIcon width={22} height={22} />,
  error: <CloseIcon width={22} height={22} />,
};

const defaultStyles: Record<ToastVariant, { backgroundColor: string; textColor: string }> = {
  success: { backgroundColor: '#e8f6ef', textColor: '#0f5132' },
  error: { backgroundColor: '#fdecea', textColor: '#611a15' },
};

export const ToastProvider = ({ children }: PropsWithChildren) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const showToast = useCallback((options: ToastOptions) => {
    const variant = options.variant ?? 'success';
    const defaults = defaultStyles[variant];

    setToast({
      id: Date.now(),
      message: options.message,
      variant,
      icon: options.icon ?? defaultIcons[variant],
      durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
      backgroundColor: options.backgroundColor ?? defaults.backgroundColor,
      textColor: options.textColor ?? defaults.textColor,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    });
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;

    const hideTimer = setTimeout(() => setIsVisible(false), toast.durationMs);
    const cleanupTimer = setTimeout(() => setToast(null), toast.durationMs + TRANSITION_DURATION_MS);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(cleanupTimer);
    };
  }, [toast]);

  const contextValue = useMemo<ToastController>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toast &&
        createPortal(
          <Toast
            key={toast.id}
            message={toast.message}
            variant={toast.variant}
            icon={toast.icon}
            backgroundColor={toast.backgroundColor}
            textColor={toast.textColor}
            visible={isVisible}
            actionLabel={toast.actionLabel}
            onAction={() => {
              if (toast.onAction) {
                toast.onAction();
              }
              setIsVisible(false);
              setTimeout(() => setToast(null), TRANSITION_DURATION_MS);
            }}
          />,
          document.body,
        )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastController => {
  const context = useContext(ToastContext);

  if (!context) {
    return {
      showToast: () => {
        // noop fallback to prevent runtime crashes when provider is unavailable
      },
    };
  }

  return context;
};
