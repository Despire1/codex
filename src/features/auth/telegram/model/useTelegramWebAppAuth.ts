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

export const useTelegramWebAppAuth = () => {
  const { showToast } = useToast();
  const [state, setState] = useState<AuthState>('idle');

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    let cancelled = false;

    webApp.ready?.();
    setState('pending');

    api
      .telegramWebappAuth({ initData: webApp.initData })
      .then(() => {
        if (cancelled) return;
        setState('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
        showToast({
          message: 'Не удалось подтвердить вход через Telegram.',
          variant: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  return { state };
};
