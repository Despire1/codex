import { FC, useMemo, useState } from 'react';
import { HomeworkTemplate } from '../../../../../entities/types';
import {
  HomeworkAlignLeftIcon,
  HomeworkMagnifyingGlassIcon,
  HomeworkSlidersIcon,
  HomeworkStarIcon,
  HomeworkTableCellsIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import {
  isHomeworkLibraryFavorite,
  matchesHomeworkLibraryFormat,
  resolveHomeworkLibraryCollections,
  resolveHomeworkLibrarySearchText,
} from '../../model/lib/homeworkLibraryPresentation';
import { HomeworkLibraryCard } from '../HomeworkLibraryCard/HomeworkLibraryCard';
import { HomeworkLibraryFiltersPopover } from '../HomeworkLibraryFiltersPopover/HomeworkLibraryFiltersPopover';
import styles from './HomeworkLibraryWorkspace.module.css';

type HomeworkLibraryScope = 'all' | 'favorites' | 'archived';
type HomeworkLibrarySort = 'updated' | 'title' | 'issued';
type HomeworkLibraryViewMode = 'grid' | 'list';
type HomeworkLibraryFormatFilter = 'test' | 'media' | 'voice' | 'writing';

interface HomeworkLibraryWorkspaceProps {
  templates: HomeworkTemplate[];
  loading: boolean;
  error: string | null;
  onOpenTemplate: (template: HomeworkTemplate) => void;
  onEditTemplate: (template: HomeworkTemplate) => void;
  onIssueTemplate: (template: HomeworkTemplate) => void;
  onToggleFavorite: (template: HomeworkTemplate) => void;
  onDuplicateTemplate: (template: HomeworkTemplate) => void;
  onArchiveTemplate: (template: HomeworkTemplate) => void;
  onRestoreTemplate: (template: HomeworkTemplate) => void;
  onCreateCollection: (template?: HomeworkTemplate) => void;
  onDeleteTemplate: (template: HomeworkTemplate) => void;
}

const SORT_OPTIONS: Array<{ id: HomeworkLibrarySort; label: string }> = [
  { id: 'updated', label: 'По дате изменения' },
  { id: 'title', label: 'По названию' },
  { id: 'issued', label: 'По использованию' },
];

export const HomeworkLibraryWorkspace: FC<HomeworkLibraryWorkspaceProps> = ({
  templates,
  loading,
  error,
  onOpenTemplate,
  onEditTemplate,
  onIssueTemplate,
  onToggleFavorite,
  onDuplicateTemplate,
  onArchiveTemplate,
  onRestoreTemplate,
  onCreateCollection,
  onDeleteTemplate,
}) => {
  const [scope, setScope] = useState<HomeworkLibraryScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<HomeworkLibrarySort>('updated');
  const [viewMode, setViewMode] = useState<HomeworkLibraryViewMode>('grid');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedFormats, setSelectedFormats] = useState<HomeworkLibraryFormatFilter[]>([]);
  const [filtersAnchorEl, setFiltersAnchorEl] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const activeTemplates = useMemo(() => templates.filter((template) => !template.isArchived), [templates]);
  const favoriteTemplatesCount = useMemo(
    () => activeTemplates.filter((template) => isHomeworkLibraryFavorite(template)).length,
    [activeTemplates],
  );
  const archivedTemplatesCount = useMemo(
    () => templates.filter((template) => template.isArchived).length,
    [templates],
  );

  const availableCollections = useMemo(() => resolveHomeworkLibraryCollections(activeTemplates), [activeTemplates]);
  const availableLevels = useMemo(
    () =>
      Array.from(
        new Set(
          activeTemplates
            .map((template) => template.level?.trim())
            .filter((level): level is string => Boolean(level)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ru')),
    [activeTemplates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    let items = scope === 'archived' ? templates.filter((template) => template.isArchived) : activeTemplates;

    if (scope === 'favorites') {
      items = items.filter((template) => isHomeworkLibraryFavorite(template));
    }

    if (selectedCollection !== 'all') {
      items = items.filter((template) => (template.subject?.trim() ?? '') === selectedCollection);
    }

    if (selectedLevel !== 'all') {
      items = items.filter((template) => (template.level?.trim() ?? '') === selectedLevel);
    }

    if (selectedFormats.length > 0) {
      items = items.filter((template) => selectedFormats.every((format) => matchesHomeworkLibraryFormat(template, format)));
    }

    if (normalizedQuery) {
      items = items.filter((template) => resolveHomeworkLibrarySearchText(template).includes(normalizedQuery));
    }

    return items.slice().sort((left, right) => {
      if (sortBy === 'title') {
        return left.title.localeCompare(right.title, 'ru');
      }
      if (sortBy === 'issued') {
        return (right.issuedAssignmentsCount ?? 0) - (left.issuedAssignmentsCount ?? 0);
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [activeTemplates, scope, templates, searchQuery, selectedCollection, selectedLevel, selectedFormats, sortBy]);

  const toggleFormat = (value: HomeworkLibraryFormatFilter) => {
    setSelectedFormats((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const clearFilters = () => {
    setSelectedLevel('all');
    setSelectedFormats([]);
  };

  const handleSearchToggle = () => {
    if (searchOpen) {
      setSearchQuery('');
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  };

  return (
    <section className={styles.workspace}>
      <section className={styles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.scopeTabs}>
            <button
              type="button"
              className={`${styles.scopeTab} ${scope === 'all' ? styles.scopeTabActive : ''}`}
              onClick={() => setScope('all')}
            >
              <span>Все</span>
              <span className={`${styles.scopeCount} ${scope === 'all' ? styles.scopeCountActive : ''}`}>{activeTemplates.length}</span>
            </button>

            <button
              type="button"
              className={`${styles.scopeGhost} ${scope === 'favorites' ? styles.scopeGhostActive : ''}`}
              onClick={() => setScope('favorites')}
            >
              <HomeworkStarIcon size={11} className={styles.favoriteTabIcon} />
              <span>Избранное</span>
              {favoriteTemplatesCount > 0 ? <span className={styles.scopeGhostCount}>{favoriteTemplatesCount}</span> : null}
            </button>

            <button
              type="button"
              className={`${styles.scopeGhost} ${scope === 'archived' ? styles.scopeGhostActive : ''}`}
              onClick={() => setScope('archived')}
            >
              <span>Архив</span>
              {archivedTemplatesCount > 0 ? <span className={styles.scopeGhostCount}>{archivedTemplatesCount}</span> : null}
            </button>
          </div>

          <div className={styles.toolbarFilters}>
            <label className={styles.collectionField}>
              <span className={styles.collectionLabel}>Коллекции</span>
              <select
                className={styles.collectionSelect}
                value={selectedCollection}
                onChange={(event) => setSelectedCollection(event.target.value)}
              >
                <option value="all">Все коллекции</option>
                {availableCollections.map((collection) => (
                  <option key={collection} value={collection}>
                    {collection}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.sortField}>
              <span className={styles.sortLabel}>Сортировка</span>
              <select className={styles.sortSelect} value={sortBy} onChange={(event) => setSortBy(event.target.value as HomeworkLibrarySort)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.searchActions}>
            {searchOpen ? (
              <label className={`${styles.searchField} ${styles.searchFieldCompact}`}>
                <HomeworkMagnifyingGlassIcon size={14} className={styles.searchIcon} />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Поиск по названию, теме или коллекции..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
            ) : null}

            <button
              type="button"
              className={styles.iconButton}
              onClick={handleSearchToggle}
              aria-label={searchOpen ? 'Скрыть поиск' : 'Открыть поиск'}
            >
              <HomeworkMagnifyingGlassIcon size={13} />
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={(event) =>
                setFiltersAnchorEl((prev) => (prev ? null : event.currentTarget))
              }
              aria-label="Открыть фильтры"
            >
              <HomeworkSlidersIcon size={13} />
            </button>

            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.viewToggleButtonActive : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Показать сеткой"
              >
                <HomeworkTableCellsIcon size={13} />
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleButtonActive : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Показать списком"
              >
                <HomeworkAlignLeftIcon size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.librarySection}>
        <div className={styles.libraryHead}>
          <h2 className={styles.sectionTitle}>Библиотека заданий</h2>
        </div>

        {error ? <div className={styles.stateCard}>{error}</div> : null}
        {loading ? <div className={styles.stateCard}>Загрузка библиотеки заданий...</div> : null}

        {!loading && !error ? (
          filteredTemplates.length > 0 ? (
            <div className={`${styles.cardsGrid} ${viewMode === 'list' ? styles.cardsList : ''}`}>
              {filteredTemplates.map((template) => (
                <HomeworkLibraryCard
                  key={template.id}
                  template={template}
                  viewMode={viewMode}
                  onOpen={onOpenTemplate}
                  onEdit={onEditTemplate}
                  onIssue={onIssueTemplate}
                  onToggleFavorite={onToggleFavorite}
                  onDuplicate={onDuplicateTemplate}
                  onArchive={onArchiveTemplate}
                  onRestore={onRestoreTemplate}
                  onCreateCollection={(item) => onCreateCollection(item)}
                  onDelete={onDeleteTemplate}
                />
              ))}
            </div>
          ) : (
            <div className={styles.stateCard}>
              <p className={styles.stateTitle}>Ничего не найдено</p>
              <p className={styles.stateText}>Попробуйте изменить поиск или сбросить фильтры.</p>
              <button type="button" className={styles.stateButton} onClick={() => {
                setScope('all');
                setSearchQuery('');
                setSelectedCollection('all');
                clearFilters();
              }}>
                Сбросить параметры
              </button>
            </div>
          )
        ) : null}
      </section>

      <HomeworkLibraryFiltersPopover
        open={Boolean(filtersAnchorEl)}
        anchorEl={filtersAnchorEl}
        levels={availableLevels}
        selectedLevel={selectedLevel}
        selectedFormats={selectedFormats}
        onClose={() => setFiltersAnchorEl(null)}
        onLevelChange={setSelectedLevel}
        onToggleFormat={toggleFormat}
        onClear={clearFilters}
      />
    </section>
  );
};
