import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'teacherbot_student_welcome_seen_v1';

const buildKey = (userId: number) => `${STORAGE_PREFIX}:${userId}`;

const readSeen = (userId: number): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildKey(userId));
    if (raw === null) return false;
    return raw === '1';
  } catch {
    return true;
  }
};

const writeSeen = (userId: number, value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildKey(userId), value ? '1' : '0');
  } catch {
    // ignore quota / privacy mode failures
  }
};

export const useStudentWelcomeFlag = (userId: number | null) => {
  const [seen, setSeenState] = useState<boolean | null>(null);

  useEffect(() => {
    if (userId === null) {
      setSeenState(null);
      return;
    }
    setSeenState(readSeen(userId));
  }, [userId]);

  const setSeen = useCallback(
    (value: boolean) => {
      if (userId === null) return;
      setSeenState(value);
      writeSeen(userId, value);
    },
    [userId],
  );

  return { seen, setSeen, isReady: seen !== null };
};
