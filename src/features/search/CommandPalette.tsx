import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../shared/api/client';
import type {
  GlobalSearchHomework,
  GlobalSearchLesson,
  GlobalSearchResponse,
  GlobalSearchScope,
  GlobalSearchStudent,
} from '../../shared/api/client';
import { tabPathById } from '../../app/tabs';
import { ASSIGNMENT_STATUS_LABELS } from '../../entities/homework-assignment/model/lib/assignmentBuckets';
import { highlightMatch } from './highlightMatch';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = GlobalSearchScope;

type FlatItem =
  | { kind: 'student'; data: GlobalSearchStudent }
  | { kind: 'lesson'; data: GlobalSearchLesson }
  | { kind: 'homework'; data: GlobalSearchHomework };

const SEARCH_DEBOUNCE_MS = 220;
const MIN_QUERY_LENGTH = 1;

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'students', label: 'Ученики' },
  { id: 'lessons', label: 'Уроки' },
  { id: 'homework', label: 'Домашки' },
];

const LESSON_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Запланирован',
  COMPLETED: 'Проведён',
  CANCELED: 'Отменён',
};

const HOMEWORK_STATUS_LABEL: Record<string, string> = {
  ...ASSIGNMENT_STATUS_LABELS,
  ASSIGNED: 'Выдана',
  IN_PROGRESS: 'В работе',
  DONE: 'Готово',
};

const formatLessonDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatHomeworkDeadline = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const flatten = (response: GlobalSearchResponse, tab: Tab): FlatItem[] => {
  if (tab === 'students') return response.students.map((data) => ({ kind: 'student', data }));
  if (tab === 'lessons') return response.lessons.map((data) => ({ kind: 'lesson', data }));
  if (tab === 'homework') return response.homework.map((data) => ({ kind: 'homework', data }));
  return [
    ...response.students.map<FlatItem>((data) => ({ kind: 'student', data })),
    ...response.lessons.map<FlatItem>((data) => ({ kind: 'lesson', data })),
    ...response.homework.map<FlatItem>((data) => ({ kind: 'homework', data })),
  ];
};

export const CommandPalette: FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [response, setResponse] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return undefined;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(handle);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    setQuery('');
    setActiveTab('all');
    setResponse(null);
    setActiveIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResponse(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.globalSearch({ query: trimmed, scope: 'all', limit: 8 });
        if (!cancelled) {
          setResponse(data);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setResponse(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query]);

  const flatItems = useMemo<FlatItem[]>(() => (response ? flatten(response, activeTab) : []), [response, activeTab]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeTab]);

  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(0);
  }, [flatItems, activeIndex]);

  useEffect(() => {
    const node = itemRefs.current[activeIndex];
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, flatItems.length]);

  const handleSelect = useCallback(
    (item: FlatItem) => {
      onClose();
      if (item.kind === 'student') {
        navigate(`${tabPathById.students}/${item.data.studentId}`);
        return;
      }
      if (item.kind === 'lesson') {
        navigate(`${tabPathById.students}/${item.data.studentId}?lessonId=${item.data.lessonId}`);
        return;
      }
      if (item.kind === 'homework') {
        if (item.data.kind === 'template') {
          navigate(`${tabPathById.homeworks}/${item.data.templateId}/edit`);
        } else {
          navigate(`${tabPathById.homeworks}/assignments/${item.data.assignmentId}`);
        }
      }
    },
    [navigate, onClose],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(flatItems.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = flatItems[activeIndex];
      if (target) handleSelect(target);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const order: Tab[] = ['all', 'students', 'lessons', 'homework'];
      const currentIndex = order.indexOf(activeTab);
      const direction = event.shiftKey ? -1 : 1;
      const next = order[(currentIndex + direction + order.length) % order.length];
      setActiveTab(next);
    }
  };

  const trimmed = query.trim();
  const totals = response?.totals;
  const totalCount = totals ? totals.students + totals.lessons + totals.homework : 0;

  if (!isOpen) return null;

  itemRefs.current = [];

  let runningIndex = -1;
  const renderItem = (item: FlatItem) => {
    runningIndex += 1;
    const itemIndex = runningIndex;
    const isActive = itemIndex === activeIndex;
    return (
      <button
        key={`${item.kind}-${itemKey(item)}`}
        type="button"
        role="option"
        aria-selected={isActive}
        ref={(node) => {
          itemRefs.current[itemIndex] = node;
        }}
        className={`${styles.resultItem} ${isActive ? styles.resultItemActive : ''}`}
        onMouseEnter={() => setActiveIndex(itemIndex)}
        onClick={() => handleSelect(item)}
      >
        {renderItemContent(item, trimmed)}
      </button>
    );
  };

  const showStudentsGroup = activeTab === 'all' || activeTab === 'students';
  const showLessonsGroup = activeTab === 'all' || activeTab === 'lessons';
  const showHomeworkGroup = activeTab === 'all' || activeTab === 'homework';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Глобальный поиск">
      <button type="button" className={styles.backdrop} aria-label="Закрыть" onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Поиск по ученикам, урокам и домашкам…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <div className={styles.tabs} role="tablist" aria-label="Категории поиска">
            {TABS.map((tab) => {
              const count =
                tab.id === 'all'
                  ? totalCount
                  : tab.id === 'students'
                    ? (totals?.students ?? 0)
                    : tab.id === 'lessons'
                      ? (totals?.lessons ?? 0)
                      : (totals?.homework ?? 0);
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {response && trimmed ? <span className={styles.tabCount}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.resultsList} role="listbox" aria-label="Результаты поиска">
          {!trimmed ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Что ищем?</div>
              <div className={styles.emptyHint}>Имя ученика, тема урока, название домашки или шаблона</div>
            </div>
          ) : loading && !response ? (
            <div className={styles.empty}>Ищем…</div>
          ) : flatItems.length === 0 ? (
            <div className={styles.empty}>Ничего не найдено</div>
          ) : (
            <>
              {showStudentsGroup && response && response.students.length > 0 ? (
                <div className={styles.group}>
                  <div className={styles.groupTitle}>
                    Ученики
                    <span className={styles.groupCount}>{totals?.students ?? response.students.length}</span>
                  </div>
                  {response.students.map((student) => renderItem({ kind: 'student', data: student }))}
                </div>
              ) : null}
              {showLessonsGroup && response && response.lessons.length > 0 ? (
                <div className={styles.group}>
                  <div className={styles.groupTitle}>
                    Уроки
                    <span className={styles.groupCount}>{totals?.lessons ?? response.lessons.length}</span>
                  </div>
                  {response.lessons.map((lesson) => renderItem({ kind: 'lesson', data: lesson }))}
                </div>
              ) : null}
              {showHomeworkGroup && response && response.homework.length > 0 ? (
                <div className={styles.group}>
                  <div className={styles.groupTitle}>
                    Домашки
                    <span className={styles.groupCount}>{totals?.homework ?? response.homework.length}</span>
                  </div>
                  {response.homework.map((homework) => renderItem({ kind: 'homework', data: homework }))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span>↑↓ навигация</span>
          <span>Tab переключить</span>
          <span>↵ открыть</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
};

const itemKey = (item: FlatItem) => {
  if (item.kind === 'student') return item.data.studentId;
  if (item.kind === 'lesson') return item.data.lessonId;
  if (item.data.kind === 'template') return `t-${item.data.templateId}`;
  return `a-${item.data.assignmentId}`;
};

const renderItemContent = (item: FlatItem, query: string) => {
  if (item.kind === 'student') {
    const { name, username, level } = item.data;
    return (
      <>
        <span className={styles.resultIcon} data-kind="student" aria-hidden>
          У
        </span>
        <span className={styles.resultBody}>
          <span className={styles.resultName}>{highlightMatch(name, query)}</span>
          <span className={styles.resultMeta}>
            <span className={styles.resultBadge}>Ученик</span>
            {level ? <span className={styles.resultLevel}>{level}</span> : null}
            {username ? <span className={styles.resultUsername}>@{highlightMatch(username, query)}</span> : null}
          </span>
        </span>
      </>
    );
  }
  if (item.kind === 'lesson') {
    const { title, startAt, status, isPaid } = item.data;
    const dateLabel = formatLessonDate(startAt);
    return (
      <>
        <span className={styles.resultIcon} data-kind="lesson" aria-hidden>
          Ур
        </span>
        <span className={styles.resultBody}>
          <span className={styles.resultName}>{highlightMatch(title, query)}</span>
          <span className={styles.resultMeta}>
            <span className={styles.resultBadge} data-kind="lesson">
              Урок
            </span>
            {dateLabel ? <span>{dateLabel}</span> : null}
            <span>{LESSON_STATUS_LABEL[status] ?? status}</span>
            {isPaid ? <span className={styles.resultPaid}>Оплачен</span> : null}
          </span>
        </span>
      </>
    );
  }
  if (item.data.kind === 'template') {
    const { title, subject, level, tags, isArchived } = item.data;
    return (
      <>
        <span className={styles.resultIcon} data-kind="template" aria-hidden>
          Шб
        </span>
        <span className={styles.resultBody}>
          <span className={styles.resultName}>{highlightMatch(title, query)}</span>
          <span className={styles.resultMeta}>
            <span className={styles.resultBadge} data-kind="template">
              Шаблон
            </span>
            {subject ? <span>{highlightMatch(subject, query)}</span> : null}
            {level ? <span className={styles.resultLevel}>{highlightMatch(level, query)}</span> : null}
            {tags
              .filter((tag) => !tag.startsWith('__'))
              .slice(0, 3)
              .map((tag) => (
                <span key={tag} className={styles.resultUsername}>
                  #{highlightMatch(tag, query)}
                </span>
              ))}
            {isArchived ? <span className={styles.resultUsername}>в архиве</span> : null}
          </span>
        </span>
      </>
    );
  }
  const { title, studentName, status, deadlineAt, templateTitle } = item.data;
  const deadlineLabel = formatHomeworkDeadline(deadlineAt);
  return (
    <>
      <span className={styles.resultIcon} data-kind="homework" aria-hidden>
        Дз
      </span>
      <span className={styles.resultBody}>
        <span className={styles.resultName}>{highlightMatch(title, query)}</span>
        <span className={styles.resultMeta}>
          <span className={styles.resultBadge} data-kind="homework">
            Домашка
          </span>
          {studentName ? <span>{highlightMatch(studentName, query)}</span> : null}
          <span>{HOMEWORK_STATUS_LABEL[status] ?? status}</span>
          {deadlineLabel ? <span>до {deadlineLabel}</span> : null}
          {templateTitle && templateTitle !== title ? (
            <span className={styles.resultUsername}>{highlightMatch(templateTitle, query)}</span>
          ) : null}
        </span>
      </span>
    </>
  );
};
