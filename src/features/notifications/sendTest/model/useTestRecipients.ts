import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/shared/api/client';

export type TestRecipient = {
  id: number;
  name: string;
};

type RecipientsState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  students: TestRecipient[];
};

const TTL_MS = 2 * 60 * 1000;

export const useTestRecipients = (params: { open: boolean; type: 'LESSON_REMINDER' | 'PAYMENT_REMINDER' }) => {
  const { open, type } = params;
  const [state, setState] = useState<RecipientsState>({ status: 'idle', students: [] });
  const lastFetchedAt = useRef(0);
  const lastType = useRef<string | null>(null);

  const fetchRecipients = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const data = await api.listNotificationTestRecipients(type);
      lastFetchedAt.current = Date.now();
      lastType.current = type;
      setState({ status: 'ready', students: data.students });
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', students: [] }));
    }
  }, [type]);

  useEffect(() => {
    if (!open) return;
    const isFresh =
      lastType.current === type && Date.now() - lastFetchedAt.current < TTL_MS && state.students.length > 0;
    if (isFresh) return;
    fetchRecipients();
  }, [open, type, fetchRecipients, state.students.length]);

  return { ...state, refresh: fetchRecipients };
};
