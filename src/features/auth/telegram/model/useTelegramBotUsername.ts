import { useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';

let cachedUsername: string | null | undefined;
let inflight: Promise<string | null> | null = null;

const loadBotUsername = async (): Promise<string | null> => {
  if (cachedUsername !== undefined) return cachedUsername;
  if (inflight) return inflight;
  inflight = api
    .getTelegramBrowserAuthConfig()
    .then((response) => {
      const username = response.botUsername?.replace(/^@+/, '') || null;
      cachedUsername = username;
      inflight = null;
      return username;
    })
    .catch(() => {
      cachedUsername = null;
      inflight = null;
      return null;
    });
  return inflight;
};

/**
 * Загружает username Telegram-бота один раз на сессию (кеш в модуле).
 * Используется для ссылок `https://t.me/{bot}` в UI.
 */
export const useTelegramBotUsername = () => {
  const [username, setUsername] = useState<string | null>(
    cachedUsername === undefined ? null : cachedUsername,
  );

  useEffect(() => {
    if (cachedUsername !== undefined) {
      setUsername(cachedUsername ?? null);
      return;
    }
    let cancelled = false;
    loadBotUsername().then((value) => {
      if (!cancelled) setUsername(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return username;
};
