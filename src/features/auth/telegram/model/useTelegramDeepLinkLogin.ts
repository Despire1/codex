import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type TelegramDeepLinkConfig } from '../../../../shared/api/client';

export type DeepLinkLoginState =
  | 'loading'
  | 'unavailable'
  | 'idle'
  | 'starting'
  | 'awaiting'
  | 'expired'
  | 'error'
  | 'success';

const POLL_INTERVAL_MS = 1500;

const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
};

const buildTgAppLink = (botUsername: string | null | undefined, httpsDeepLink: string) => {
  if (!botUsername) return null;
  try {
    const url = new URL(httpsDeepLink);
    const startParam = url.searchParams.get('start');
    if (!startParam) return null;
    const handle = botUsername.replace(/^@+/, '');
    return `tg://resolve?domain=${encodeURIComponent(handle)}&start=${encodeURIComponent(startParam)}`;
  } catch {
    return null;
  }
};

const resolvePlatformDeepLink = (botUsername: string | null | undefined, httpsDeepLink: string) => {
  if (!isMobileDevice()) return httpsDeepLink;
  return buildTgAppLink(botUsername, httpsDeepLink) ?? httpsDeepLink;
};

type UseTelegramDeepLinkLoginOptions = {
  onSuccess: () => Promise<void> | void;
};

export const useTelegramDeepLinkLogin = ({ onSuccess }: UseTelegramDeepLinkLoginOptions) => {
  const [state, setState] = useState<DeepLinkLoginState>('loading');
  const [config, setConfig] = useState<TelegramDeepLinkConfig | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const pollRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    cancelledRef.current = false;

    const init = async () => {
      let configResponse: TelegramDeepLinkConfig;
      try {
        configResponse = await api.getTelegramDeepLinkConfig();
      } catch {
        if (cancelledRef.current) return;
        setState('error');
        setErrorMessage('Не удалось подготовить вход через Telegram. Обновите страницу.');
        return;
      }

      if (cancelledRef.current) return;
      setConfig(configResponse);

      if (!configResponse.enabled) {
        setState('unavailable');
        return;
      }

      try {
        const pollResponse = await api.pollTelegramDeepLinkLogin();
        if (cancelledRef.current) return;

        if (pollResponse.status === 'claimed') {
          setState('success');
          await onSuccess();
          return;
        }

        if (pollResponse.status === 'pending') {
          setState('awaiting');
          if (tickTimer.current) clearInterval(tickTimer.current);
          tickTimer.current = setInterval(() => setNow(Date.now()), 1000);
          schedulePoll();
          return;
        }

        setState('idle');
      } catch {
        if (!cancelledRef.current) setState('idle');
      }
    };

    void init();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimers = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopTimers(), [stopTimers]);

  const schedulePoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => {
      void pollRef.current();
    }, POLL_INTERVAL_MS);
  }, []);

  const poll = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const response = await api.pollTelegramDeepLinkLogin();
      if (cancelledRef.current) return;

      if (response.status === 'claimed') {
        stopTimers();
        setState('success');
        await onSuccess();
        return;
      }

      if (response.status === 'expired' || response.status === 'no_attempt') {
        stopTimers();
        setState('expired');
        return;
      }

      if (expiresAt && expiresAt < Date.now()) {
        stopTimers();
        setState('expired');
        return;
      }

      schedulePoll();
    } catch (_error) {
      if (cancelledRef.current) return;
      setErrorMessage('Соединение нестабильно. Пробуем ещё раз…');
      schedulePoll();
    }
  }, [expiresAt, onSuccess, schedulePoll, stopTimers]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const start = useCallback(async () => {
    if (state === 'starting' || state === 'awaiting') return;
    setErrorMessage(null);
    setState('starting');

    try {
      const response = await api.startTelegramDeepLinkLogin();
      const expiresAtMs = new Date(response.expiresAt).getTime();
      const platformLink = resolvePlatformDeepLink(response.botUsername, response.deepLink);
      setDeepLink(platformLink);
      setExpiresAt(Number.isFinite(expiresAtMs) ? expiresAtMs : null);
      setNow(Date.now());
      setState('awaiting');

      stopTimers();
      tickTimer.current = setInterval(() => setNow(Date.now()), 1000);
      schedulePoll();

      if (typeof window !== 'undefined') {
        window.location.href = platformLink;
      }
    } catch (_error) {
      setState('error');
      setErrorMessage('Не удалось запустить вход. Попробуйте ещё раз.');
    }
  }, [schedulePoll, state, stopTimers]);

  const cancel = useCallback(async () => {
    stopTimers();
    setDeepLink(null);
    setExpiresAt(null);
    setErrorMessage(null);
    setState(config?.enabled ? 'idle' : 'unavailable');
    try {
      await api.cancelTelegramDeepLinkLogin();
    } catch (_error) {
      // noop
    }
  }, [config?.enabled, stopTimers]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;

  return {
    state,
    config,
    deepLink,
    errorMessage,
    remainingMs,
    start,
    cancel,
  };
};
