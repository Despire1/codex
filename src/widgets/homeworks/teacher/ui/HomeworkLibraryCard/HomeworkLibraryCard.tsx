import { FC, KeyboardEvent, MouseEvent, ReactNode, useMemo, useState } from 'react';
import {
  canTeacherEditHomeworkTemplate,
  canTeacherDeleteHomeworkTemplate,
} from '../../../../../entities/homework-template/model/lib/workflow';
import { HomeworkTemplate } from '../../../../../entities/types';
import { AnchoredPopover } from '../../../../../shared/ui/AnchoredPopover/AnchoredPopover';
import {
  HomeworkClockIcon,
  HomeworkCopyIcon,
  HomeworkEllipsisVerticalIcon,
  HomeworkFileLinesIcon,
  HomeworkFolderIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPaperclipIcon,
  HomeworkPenIcon,
  HomeworkRotateRightIcon,
  HomeworkStarIcon,
  HomeworkStarRegularIcon,
  HomeworkTrashIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { UserGroupIcon } from '../../../../../icons/MaterialIcons';
import {
  HomeworkLibraryMetric,
  isHomeworkLibraryFavorite,
  resolveHomeworkLibraryBadges,
  resolveHomeworkLibraryCategoryLabel,
  resolveHomeworkLibraryCategoryTone,
  resolveHomeworkLibraryDescription,
  resolveHomeworkLibraryIssuedCount,
  resolveHomeworkLibraryMetrics,
  resolveHomeworkLibraryUpdatedLabel,
  resolveHomeworkLibraryUpdatedTooltip,
} from '../../model/lib/homeworkLibraryPresentation';
import styles from './HomeworkLibraryCard.module.css';

interface HomeworkLibraryCardProps {
  template: HomeworkTemplate;
  viewMode: 'grid' | 'list';
  onOpen: (template: HomeworkTemplate) => void;
  onEdit: (template: HomeworkTemplate) => void;
  onIssue: (template: HomeworkTemplate) => void;
  onToggleFavorite: (template: HomeworkTemplate) => void;
  onDuplicate: (template: HomeworkTemplate) => void;
  onArchive: (template: HomeworkTemplate) => void;
  onRestore: (template: HomeworkTemplate) => void;
  onCreateCollection: (template: HomeworkTemplate) => void;
  onDelete: (template: HomeworkTemplate) => void;
}

type HomeworkTemplateMenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

const renderMetricIcon = (metric: HomeworkLibraryMetric): ReactNode => {
  switch (metric.icon) {
    case 'questions':
      return <HomeworkListCheckIcon size={11} />;
    case 'paperclip':
      return <HomeworkPaperclipIcon size={11} />;
    case 'microphone':
      return <HomeworkMicrophoneIcon size={11} />;
    case 'file':
      return <HomeworkFileLinesIcon size={11} />;
    case 'clock':
    default:
      return <HomeworkClockIcon size={11} />;
  }
};

export const HomeworkLibraryCard: FC<HomeworkLibraryCardProps> = ({
  template,
  viewMode,
  onOpen,
  onEdit,
  onIssue,
  onToggleFavorite,
  onDuplicate,
  onArchive,
  onRestore,
  onCreateCollection,
  onDelete,
}) => {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const favorite = isHomeworkLibraryFavorite(template);
  const canEdit = canTeacherEditHomeworkTemplate(template);
  const canDelete = canTeacherDeleteHomeworkTemplate(template);
  const categoryTone = resolveHomeworkLibraryCategoryTone(template);
  const categoryLabel = resolveHomeworkLibraryCategoryLabel(template);
  const description = resolveHomeworkLibraryDescription(template);
  const badges = resolveHomeworkLibraryBadges(template);
  const metrics = resolveHomeworkLibraryMetrics(template);
  const issuedCount = resolveHomeworkLibraryIssuedCount(template);
  const updatedLabel = resolveHomeworkLibraryUpdatedLabel(template.updatedAt);
  const updatedTooltip = resolveHomeworkLibraryUpdatedTooltip(template.updatedAt);

  const actionLabel = template.isArchived ? 'Вернуть' : 'Выдать';
  const actionAriaLabel = template.isArchived ? 'Вернуть задание в библиотеку' : 'Выдать домашнее задание';

  const menuItems = useMemo(() => {
    const items: Array<HomeworkTemplateMenuAction | null> = [
      canEdit
        ? {
            id: 'edit',
            label: 'Редактировать',
            icon: <HomeworkPenIcon size={12} />,
            onSelect: () => onEdit(template),
          }
        : null,
      {
        id: 'duplicate',
        label: 'Дублировать',
        icon: <HomeworkCopyIcon size={12} />,
        onSelect: () => onDuplicate(template),
      },
      {
        id: 'collection',
        label: 'В коллекцию',
        icon: <HomeworkFolderIcon size={12} />,
        onSelect: () => onCreateCollection(template),
      },
      template.isArchived
        ? {
            id: 'restore',
            label: 'Вернуть из архива',
            icon: <HomeworkRotateRightIcon size={12} />,
            onSelect: () => onRestore(template),
          }
        : {
            id: 'archive',
            label: 'Архивировать',
            icon: <HomeworkFolderIcon size={12} />,
            onSelect: () => onArchive(template),
          },
      canDelete
        ? {
            id: 'delete',
            label: 'Удалить',
            icon: <HomeworkTrashIcon size={12} />,
            danger: true,
            onSelect: () => onDelete(template),
          }
        : null,
    ];

    return items.filter((item): item is HomeworkTemplateMenuAction => item !== null);
  }, [canDelete, canEdit, onArchive, onCreateCollection, onDelete, onDuplicate, onEdit, onRestore, template]);

  const handleOpen = () => {
    onOpen(template);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(template);
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleFavorite(template);
  };

  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (template.isArchived) {
      onRestore(template);
      return;
    }
    onIssue(template);
  };

  return (
    <article
      className={`${styles.card} ${viewMode === 'list' ? styles.cardList : ''}`}
      tabIndex={0}
      role="button"
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Открыть задание "${template.title}"`}
      data-hint="homework-template-card"
    >
      <div className={styles.cardBody}>
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <span
              className={`${styles.categoryBadge} ${styles[`categoryBadge${categoryTone[0].toUpperCase()}${categoryTone.slice(1)}`]}`}
            >
              {categoryLabel}
            </span>
            <button
              type="button"
              className={`${styles.favoriteButton} ${favorite ? styles.favoriteButtonActive : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Переключить избранное"
            >
              {favorite ? <HomeworkStarIcon size={12} /> : <HomeworkStarRegularIcon size={12} />}
            </button>
          </div>

          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.issueButton}
              onClick={handleActionClick}
              aria-label={actionAriaLabel}
            >
              <span>{actionLabel}</span>
            </button>

            <button
              type="button"
              className={styles.menuButton}
              onClick={handleMenuClick}
              aria-label="Открыть меню задания"
            >
              <HomeworkEllipsisVerticalIcon size={12} />
            </button>
          </div>
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>{template.title}</h3>
          <p className={styles.description}>{description}</p>

          {badges.length > 0 ? (
            <div className={styles.badgesRow}>
              {badges.map((badge) => (
                <span
                  key={badge.id}
                  className={`${styles.metaBadge} ${styles[`metaBadge${badge.tone[0].toUpperCase()}${badge.tone.slice(1)}`]}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.metricsRow}>
            {metrics.map((metric) => (
              <span key={metric.id} className={styles.metric}>
                {renderMetricIcon(metric)}
                <span>{metric.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.updatedLabel} title={updatedTooltip}>
            {updatedLabel}
          </span>
          <span className={styles.issuedMeta}>
            <UserGroupIcon width={12} height={12} />
            <span>{issuedCount}</span>
          </span>
        </div>
      </div>

      <AnchoredPopover
        isOpen={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={() => setMenuAnchorEl(null)}
        side="bottom"
        align="end"
        offset={8}
        className={styles.menuPopover}
        preventCloseOnOtherPopoverClick
      >
        <div
          className={styles.menuList}
          role="menu"
          aria-label={`Действия для ${template.title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ''}`}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setMenuAnchorEl(null);
                item.onSelect();
              }}
            >
              <span className={styles.menuItemIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </AnchoredPopover>
    </article>
  );
};
