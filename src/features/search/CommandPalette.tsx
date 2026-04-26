import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../shared/api/client';
import type { Student, TeacherStudent } from '../../entities/types';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ResultItem {
  studentId: number;
  name: string;
  username?: string | null;
  level?: string | null;
}

const SEARCH_DEBOUNCE_MS = 200;

export const CommandPalette: FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    const handle = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(handle);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.searchStudents({ query: query.trim() || undefined });
        if (cancelled) return;
        const linkByStudentId = new Map(response.links.map((link: TeacherStudent) => [link.studentId, link]));
        const items: ResultItem[] = response.students.map((student: Student) => {
          const link = linkByStudentId.get(student.id);
          return {
            studentId: student.id,
            name: link?.customName?.trim() || student.username || `Ученик #${student.id}`,
            username: student.username ?? null,
            level: link?.studentLevel ?? null,
          };
        });
        setResults(items);
        setActiveIndex(0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query]);

  const handleSelect = useCallback(
    (item: ResultItem) => {
      onClose();
      navigate(`/students/${item.studentId}`);
    },
    [navigate, onClose],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) handleSelect(target);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const placeholder = useMemo(() => 'Поиск по ученикам…', []);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Глобальный поиск">
      <button type="button" className={styles.backdrop} aria-label="Закрыть" onClick={onClose} />
      <div className={styles.panel}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <div className={styles.resultsList} role="listbox" aria-label="Результаты поиска">
          {loading && results.length === 0 ? (
            <div className={styles.empty}>Ищем…</div>
          ) : results.length === 0 ? (
            <div className={styles.empty}>{query.trim() ? 'Ничего не найдено' : 'Введите имя ученика'}</div>
          ) : (
            results.map((item, index) => (
              <button
                key={item.studentId}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`${styles.resultItem} ${index === activeIndex ? styles.resultItemActive : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(item)}
              >
                <span className={styles.resultName}>{item.name}</span>
                <span className={styles.resultMeta}>
                  {item.level ? <span className={styles.resultLevel}>{item.level}</span> : null}
                  {item.username ? <span className={styles.resultUsername}>@{item.username}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
        <div className={styles.footer}>
          <span>↑↓ навигация</span>
          <span>↵ открыть</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
};
