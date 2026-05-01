import { Fragment, type ReactNode } from 'react';

const escapeRegExp = (raw: string) => raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const highlightMatch = (text: string | null | undefined, query: string): ReactNode => {
  const value = text ?? '';
  const normalized = query.trim();
  if (!normalized || !value) return value;

  const pattern = new RegExp(`(${escapeRegExp(normalized)})`, 'gi');
  const parts = value.split(pattern);
  if (parts.length === 1) return value;

  const lower = normalized.toLowerCase();
  return parts.map((part, index) =>
    part.toLowerCase() === lower ? (
      <mark key={index} data-search-mark="true">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
};
