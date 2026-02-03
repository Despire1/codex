import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/api/client';
import { StudentListItem } from '../../../entities/types';

type StudentListCounts = { withDebt: number; overdue: number };
type LoadOptions = { offset?: number; append?: boolean };

interface UseStudentsListOptions {
  hasAccess: boolean;
  studentQuery: string;
  studentFilter: 'all' | 'debt' | 'overdue';
  selectedStudentId: number | null;
  setSelectedStudentId: Dispatch<SetStateAction<number | null>>;
  reloadKey?: number;
}

export const useStudentsList = ({
  hasAccess,
  studentQuery,
  studentFilter,
  setSelectedStudentId,
  reloadKey,
}: UseStudentsListOptions) => {
  const [items, setItems] = useState<StudentListItem[]>([]);
  const [counts, setCounts] = useState<StudentListCounts>({ withDebt: 0, overdue: 0 });
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const resetList = useCallback(() => {
    setItems([]);
    setCounts({ withDebt: 0, overdue: 0 });
    setTotal(0);
    setHasMore(false);
    setIsLoading(false);
  }, []);

  const load = useCallback(
    async (options: LoadOptions = {}) => {
      if (!hasAccess) {
        resetList();
        return;
      }
      const offset = options.offset ?? 0;
      const append = options.append ?? false;
      setIsLoading(true);
      try {
        const data = await api.listStudents({
          query: studentQuery || undefined,
          filter: studentFilter,
          limit: 15,
          offset,
        });
        setCounts(data.counts);
        setTotal(data.total);
        setHasMore(data.nextOffset !== null);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        if (!append) {
          setSelectedStudentId((prev) => {
            if (prev && data.items.some((item) => item.student.id === prev)) {
              return prev;
            }
            return data.items[0]?.student.id ?? null;
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load students list', error);
      } finally {
        setIsLoading(false);
      }
    },
    [hasAccess, resetList, setSelectedStudentId, studentFilter, studentQuery],
  );

  const reload = useCallback(() => {
    void load({ offset: 0, append: false });
  }, [load]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    void load({ offset: items.length, append: true });
  }, [hasMore, isLoading, items.length, load]);

  const updateItem = useCallback((studentId: number, updater: (item: StudentListItem) => StudentListItem) => {
    setItems((prev) => {
      let hasUpdates = false;
      const next = prev.map((item) => {
        if (item.student.id !== studentId) return item;
        const updated = updater(item);
        if (updated !== item) {
          hasUpdates = true;
        }
        return updated;
      });
      return hasUpdates ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!hasAccess) {
      resetList();
      return;
    }
    void load({ offset: 0, append: false });
  }, [hasAccess, load, reloadKey, resetList, studentFilter, studentQuery]);

  return {
    items,
    counts,
    total,
    hasMore,
    isLoading,
    loadMore,
    reload,
    updateItem,
  };
};
