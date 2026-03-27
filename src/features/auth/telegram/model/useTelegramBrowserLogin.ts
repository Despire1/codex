import { useEffect, useRef, useState } from 'react';
import { api, type TelegramBrowserAuthConfig } from '../../../../shared/api/client';

type TelegramBrowserLoginState = 'loading' | 'ready' | 'unavailable' | 'error';

const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const resolveBrowserReturnTo = () => {
  if (typeof window === 'undefined') return '/dashboard';
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!currentPath || currentPath.startsWith('/auth/')) {
    return '/dashboard';
  }
  return currentPath;
};

const buildBrowserLoginUrl = () => {
  const authPath = `/auth/telegram/browser-login?return_to=${encodeURIComponent(resolveBrowserReturnTo())}`;
  if (!API_BASE) return authPath;
  return `${API_BASE.replace(/\/$/, '')}${authPath}`;
};

export const useTelegramBrowserLogin = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<TelegramBrowserAuthConfig | null>(null);
  const [state, setState] = useState<TelegramBrowserLoginState>('loading');

  useEffect(() => {
    let cancelled = false;

    api
      .getTelegramBrowserAuthConfig()
      .then((response) => {
        if (cancelled) return;
        setConfig(response);
        setState(response.enabled && response.botUsername ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !config?.botUsername || !containerRef.current) return undefined;

    const container = containerRef.current;
    container.innerHTML = '';
    let active = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = TELEGRAM_WIDGET_SRC;
    script.setAttribute('data-telegram-login', config.botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-auth-url', buildBrowserLoginUrl());
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-lang', 'ru');
    const handleError = () => {
      if (!active) return;
      setState('error');
    };
    script.addEventListener('error', handleError);
    container.appendChild(script);

    return () => {
      active = false;
      script.removeEventListener('error', handleError);
      container.innerHTML = '';
    };
  }, [config?.botUsername, state]);

  return { containerRef, config, state };
};
