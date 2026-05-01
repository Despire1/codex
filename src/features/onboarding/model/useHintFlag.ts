import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'teacherbot_hint_seen_v1';

const buildKey = (area: string, userId: number | string) => `${STORAGE_PREFIX}:${area}:${userId}`;

const readSeen = (area: string, userId: number | string): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(buildKey(area, userId)) === '1';
  } catch {
    return true;
  }
};

const writeSeen = (area: string, userId: number | string, value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(buildKey(area, userId), '1');
    } else {
      window.localStorage.removeItem(buildKey(area, userId));
    }
  } catch {
    // ignore quota / privacy mode failures
  }
};

export const useHintFlag = (area: string, userId: number | string | null, resetTick = 0) => {
  const [seen, setSeenState] = useState<boolean | null>(null);

  useEffect(() => {
    if (userId === null) {
      setSeenState(null);
      return;
    }
    setSeenState(readSeen(area, userId));
  }, [area, userId, resetTick]);

  const setSeen = useCallback(
    (value: boolean) => {
      if (userId === null) return;
      setSeenState(value);
      writeSeen(area, userId, value);
    },
    [area, userId],
  );

  return { seen, setSeen, isReady: seen !== null };
};

export const resetAllHints = () => {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
};
