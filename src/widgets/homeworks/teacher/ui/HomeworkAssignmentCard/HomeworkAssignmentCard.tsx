import { FC, KeyboardEvent, MouseEvent, ReactNode, useMemo, useState } from 'react';
import {
  canCancelHomeworkAssignmentIssue,
} from '../../../../../entities/homework-assignment/model/lib/assignmentIssuance';
import {
  canReissueHomeworkAssignment,
  resolveHomeworkAssignmentWorkflow,
} from '../../../../../entities/homework-assignment/model/lib/workflow';
import { HomeworkAssignment } from '../../../../../entities/types';
import { AnchoredPopover } from '../../../../../shared/ui/AnchoredPopover/AnchoredPopover';
import {
  HomeworkArrowUpRightFromSquareIcon,
  HomeworkClockIcon,
  HomeworkEllipsisVerticalIcon,
  HomeworkFileLinesIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPaperPlaneIcon,
  HomeworkPaperclipIcon,
  HomeworkPenIcon,
  HomeworkRotateRightIcon,
  HomeworkTrashIcon,
  HomeworkBellRegularIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { UserGroupIcon } from '../../../../../icons/MaterialIcons';
import {
  resolveHomeworkAssignmentActionLabel,
  resolveHomeworkAssignmentCardBadges,
  resolveHomeworkAssignmentCardCategoryLabel,
  resolveHomeworkAssignmentCardCategoryTone,
  resolveHomeworkAssignmentCardDescription,
  resolveHomeworkAssignmentCardMetrics,
  resolveHomeworkAssignmentCardUpdatedLabel,
} from '../../model/lib/homeworkAssignmentWorkspacePresentation';
import { HomeworkLibraryMetric } from '../../model/lib/homeworkLibraryPresentation';
import styles from './HomeworkAssignmentCard.module.css';

interface HomeworkAssignmentCardProps {
  assignment: HomeworkAssignment;
  viewMode: 'grid' | 'list';
  onOpen: (assignment: HomeworkAssignment) => void;
  onReview: (assignment: HomeworkAssignment) => void;
  onSendNow: (assignment: HomeworkAssignment) => void;
  onFixConfigError: (assignment: HomeworkAssignment) => void;
  onCancelIssue: (assignment: HomeworkAssignment) => void;
  onReissue: (assignment: HomeworkAssignment) => void;
  onRemind: (assignment: HomeworkAssignment) => void;
  onDelete: (assignment: HomeworkAssignment) => void;
}

type HomeworkAssignmentMenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

const renderMetricIcon = (metric: HomeworkLibraryMetric) => {
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

export const HomeworkAssignmentCard: FC<HomeworkAssignmentCardProps> = ({
  assignment,
  viewMode,
  onOpen,
  onReview,
  onSendNow,
  onFixConfigError,
  onCancelIssue,
  onReissue,
  onRemind,
  onDelete,
}) => {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const categoryTone = resolveHomeworkAssignmentCardCategoryTone(assignment);
  const categoryLabel = resolveHomeworkAssignmentCardCategoryLabel(assignment);
  const description = resolveHomeworkAssignmentCardDescription(assignment);
  const badges = resolveHomeworkAssignmentCardBadges(assignment);
  const metrics = resolveHomeworkAssignmentCardMetrics(assignment);
  const updatedLabel = resolveHomeworkAssignmentCardUpdatedLabel(assignment);
  const actionLabel = resolveHomeworkAssignmentActionLabel(assignment);

  const workflow = resolveHomeworkAssignmentWorkflow(assignment);
  const canReview = workflow.canTeacherReview;
  const canSendNow = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
  const canCancelIssue = canCancelHomeworkAssignmentIssue(assignment);
  const canReissue = canReissueHomeworkAssignment(assignment);
  const canRemind = assignment.status === 'SENT' || assignment.status === 'RETURNED' || assignment.status === 'OVERDUE';

  const menuItems = useMemo(
    () => {
      const items: Array<HomeworkAssignmentMenuAction | null> = [
        {
          id: 'open',
          label: 'Открыть',
          icon: <HomeworkPenIcon size={12} />,
          onSelect: () => onOpen(assignment),
        },
        canSendNow
          ? {
              id: 'send',
              label: 'Выдать сейчас',
              icon: <HomeworkPaperPlaneIcon size={12} />,
              onSelect: () => onSendNow(assignment),
            }
          : null,
        canCancelIssue
          ? {
              id: 'cancel',
              label: 'Отменить выдачу',
              icon: <HomeworkPaperPlaneIcon size={12} />,
              onSelect: () => onCancelIssue(assignment),
            }
          : null,
        canReissue
          ? {
              id: 'reissue',
              label: 'Переоткрыть домашку',
              icon: <HomeworkRotateRightIcon size={12} />,
              onSelect: () => onReissue(assignment),
            }
          : null,
        canRemind
          ? {
              id: 'remind',
              label: 'Напомнить ученику',
              icon: <HomeworkBellRegularIcon size={12} />,
              onSelect: () => onRemind(assignment),
            }
          : null,
        {
          id: 'delete',
          label: 'Удалить',
          icon: <HomeworkTrashIcon size={12} />,
          danger: true,
          onSelect: () => onDelete(assignment),
        },
      ];

      return items.filter((item): item is HomeworkAssignmentMenuAction => item !== null);
    },
    [assignment, canCancelIssue, canRemind, canReissue, canSendNow, onCancelIssue, onDelete, onOpen, onReissue, onRemind, onSendNow],
  );

  const handleOpen = () => {
    onOpen(assignment);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(assignment);
  };

  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (assignment.hasConfigError) {
      onFixConfigError(assignment);
      return;
    }
    if (canReview) {
      onReview(assignment);
      return;
    }
    if (canSendNow) {
      onSendNow(assignment);
      return;
    }
    onOpen(assignment);
  };

  return (
    <article
      className={`${styles.card} ${viewMode === 'list' ? styles.cardList : ''}`}
      tabIndex={0}
      role="button"
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Открыть домашнее задание "${assignment.title}"`}
    >
      <div className={styles.cardBody}>
        <div className={styles.head}>
          <div className={styles.headLeft}>
            <span className={`${styles.categoryBadge} ${styles[`categoryBadge${categoryTone[0].toUpperCase()}${categoryTone.slice(1)}`]}`}>
              {categoryLabel}
            </span>
          </div>

          <button
            type="button"
            className={styles.menuButton}
            onClick={handleMenuClick}
            aria-label="Открыть меню задания"
          >
            <HomeworkEllipsisVerticalIcon size={12} />
          </button>
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>{assignment.title}</h3>
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
                <span className={styles.metricIcon}>{renderMetricIcon(metric)}</span>
                <span>{metric.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.updatedLabel}>{updatedLabel}</span>
          <span className={styles.issuedMeta}>
            <UserGroupIcon width={12} height={12} />
            <span>1</span>
          </span>
        </div>
      </div>

      <div className={`${styles.hoverActions} ${viewMode === 'list' ? styles.hoverActionsList : ''}`}>
        <button type="button" className={styles.issueButton} onClick={handleActionClick}>
          <HomeworkArrowUpRightFromSquareIcon size={13} />
          <span>{actionLabel}</span>
        </button>
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
          aria-label={`Действия для ${assignment.title}`}
          onClick={(event) => event.stopPropagation()}
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.menuItem} ${'danger' in item && item.danger ? styles.menuItemDanger : ''}`}
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
