import { useEffect, useMemo, useState } from 'react';

type StudentFilterValue = 'all' | 'debt' | 'overdue';

type FiltersCache = {
  search: string;
  filter: StudentFilterValue;
};

const filtersCache: FiltersCache = {
  search: '',
  filter: 'all',
};

export const useStudentsFilters = () => {
  const [search, setSearch] = useState(filtersCache.search);
  const [filter, setFilter] = useState<StudentFilterValue>(filtersCache.filter);
  const [query, setQuery] = useState(() => filtersCache.search.trim());

  useEffect(() => {
    filtersCache.search = search;
  }, [search]);

  useEffect(() => {
    filtersCache.filter = filter;
  }, [filter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setQuery(search.trim());
    }, 350);

    return () => clearTimeout(handler);
  }, [search]);

  return useMemo(
    () => ({
      search,
      setSearch,
      filter,
      setFilter,
      query,
    }),
    [filter, query, search],
  );
};
