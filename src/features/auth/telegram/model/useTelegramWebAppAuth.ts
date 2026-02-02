import { useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';
import { useToast } from '../../../../shared/lib/toast';

type AuthState = 'idle' | 'pending' | 'authenticated' | 'error';

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export const useTelegramWebAppAuth = (onAuthenticated?: () => void, onAuthFailed?: () => void) => {
  const { showToast } = useToast();
  const [state, setState] = useState<AuthState>('idle');
  const hasInitData = typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp?.initData);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    document.body.classList.add('telegram-webapp');
    if (!webApp.initData) {
      return () => {
        document.body.classList.remove('telegram-webapp');
      };
    }
    let cancelled = false;

    webApp.ready?.();
    setState('pending');

    api
      .telegramWebappAuth({ initData: webApp.initData })
      .then((response) => {
        if (cancelled) return;
        if (response?.isNewUser) {
          showToast({
            message: 'Добро пожаловать!',
            variant: 'success',
            durationMs: 1600,
          });
        }
        setState('authenticated');
        onAuthenticated?.();
      })
      .catch(() => {
        if (cancelled) return;
        api
          .logout()
          .catch(() => undefined)
          .finally(() => {
            if (cancelled) return;
            setState('error');
            showToast({
              message: 'Не удалось подтвердить вход через Telegram.',
              variant: 'error',
            });
            onAuthFailed?.();
          });
      });

    return () => {
      cancelled = true;
      document.body.classList.remove('telegram-webapp');
    };
  }, [onAuthenticated, onAuthFailed, showToast]);

  return { state, hasInitData };
};
