import { FC, useState, type RefObject } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

import { Homework, HomeworkStatus } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import {
  AddOutlinedIcon,
  CheckCircleOutlineIcon,
  EditOutlinedIcon,
  MoreHorizIcon,
  FilterAltOutlinedIcon,
} from '../../../icons/MaterialIcons';
import styles from '../StudentsSection.module.css';

type HomeworkStatusInfo = { status: HomeworkStatus; isOverdue: boolean };

interface HomeworkTabProps {
  homeworkFilter: 'all' | HomeworkStatus | 'overdue';
  filteredHomeworks: Homework[];
  activeHomeworkId: number | null;
  openHomeworkMenuId: number | null;
  isLoading: boolean;
  hasMore: boolean;
  loadMoreRef: RefObject<HTMLDivElement>;
  isMobile: boolean;
  listRef: RefObject<HTMLDivElement>;
  onOpenCreateHomework: () => void;
  onChangeFilter: (filter: 'all' | HomeworkStatus | 'overdue') => void;
  onOpenHomework: (homeworkId: number) => void;
  onToggleHomeworkMenu: (homeworkId: number) => void;
  onToggleHomework: (homeworkId: number) => void;
  onHomeworkReminder: (homeworkId: number) => void;
  onEditHomework: (homeworkId: number) => void;
  onMoveToDraft: (homeworkId: number) => void;
  onDeleteHomework: (homeworkId: number) => void;
  getHomeworkStatusInfo: (homework: Homework) => HomeworkStatusInfo;
  getHomeworkTitle: (text: string) => string;
  formatTimeSpentMinutes: (minutes?: number | null) => string;
  formatCompletionMoment: (completedAt?: string | null) => string;
}

export const HomeworkTab: FC<HomeworkTabProps> = ({
  homeworkFilter,
  filteredHomeworks,
  activeHomeworkId,
  openHomeworkMenuId,
  isLoading,
  hasMore,
  loadMoreRef,
  isMobile,
  listRef,
  onOpenCreateHomework,
  onChangeFilter,
  onOpenHomework,
  onToggleHomeworkMenu,
  onToggleHomework,
  onHomeworkReminder,
  onEditHomework,
  onMoveToDraft,
  onDeleteHomework,
  getHomeworkStatusInfo,
  getHomeworkTitle,
  formatTimeSpentMinutes,
  formatCompletionMoment,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const getStatusLabel = (status: HomeworkStatus) => {
    if (status === 'DONE') return 'Выполнено';
    if (status === 'IN_PROGRESS') return 'В работе';
    if (status === 'ASSIGNED') return 'Назначено';
    return 'Черновик';
  };

  const renderStatusPill = (statusInfo: HomeworkStatusInfo) => {
    const statusClass =
      statusInfo.status === 'DONE'
        ? styles.statusDone
        : statusInfo.status === 'IN_PROGRESS'
          ? styles.statusInProgress
          : statusInfo.status === 'ASSIGNED'
            ? styles.statusAssigned
            : styles.statusDraft;

    return <span className={`${styles.statusPill} ${statusClass}`}>{getStatusLabel(statusInfo.status)}</span>;
  };

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={`${styles.homeworkHeader} ${styles.homeworkHeaderCompact}`}>
        <div className={styles.lessonsActions}>
          <div className={styles.priceLabel}>Домашки</div>
          <AdaptivePopover
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            trigger={
              <button
                type="button"
                className={controls.iconButton}
                onClick={() => setFiltersOpen((prev) => !prev)}
                aria-label="Фильтры списка домашних заданий"
              >
                <span className={styles.filterIconWrapper}>
                  <FilterAltOutlinedIcon width={18} height={18} />
                  {homeworkFilter !== 'all' && <span className={styles.filterDot} aria-hidden />}
                </span>
              </button>
            }
            className={styles.filtersPopoverContent}
          >
            <div className={`${styles.filters} ${styles.filtersPopoverList}`}>
              {[
                { id: 'all', label: 'Все' },
                { id: 'DRAFT', label: 'Черновики' },
                { id: 'ASSIGNED', label: 'Назначено' },
                { id: 'IN_PROGRESS', label: 'В работе' },
                { id: 'DONE', label: 'Выполнено' },
                { id: 'overdue', label: 'Просрочено' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  className={`${styles.filterChip} ${homeworkFilter === filter.id ? styles.activeChip : ''}`}
                  onClick={() => {
                    onChangeFilter(filter.id as typeof homeworkFilter);
                    setFiltersOpen(false);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </AdaptivePopover>
        </div>
        <button
          className={`${controls.primaryButton} ${styles.homeworkAddButton}`}
          onClick={onOpenCreateHomework}
          aria-label="Новое ДЗ"
        >
          <span className={styles.iconLeading} aria-hidden>
            <AddOutlinedIcon width={16} height={16} />
          </span>
          <span className={styles.homeworkAddButtonLabel}>Новое ДЗ</span>
        </button>
      </div>

      <div className={`${styles.homeworkList} ${styles.tabContentScroll}`} ref={listRef}>
        {isLoading && filteredHomeworks.length === 0 ? (
          <div className={styles.listLoader}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={`${styles.skeletonCard} ${styles.skeletonHomeworkCard}`} />
            ))}
          </div>
        ) : (
          filteredHomeworks.map((hw) => {
            const statusInfo = getHomeworkStatusInfo(hw);
            const title = getHomeworkTitle(hw.text);
            const deadlineLabel = hw.deadline
              ? `Дедлайн: ${format(parseISO(`${hw.deadline}T00:00:00`), 'd MMM', { locale: ru })}`
              : 'Без дедлайна';
            const timeSpentLabel =
              hw.timeSpentMinutes !== null && hw.timeSpentMinutes !== undefined
                ? `Время: ${formatTimeSpentMinutes(hw.timeSpentMinutes)}`
                : 'Время: не указано';
            const completedLabel = `Выполнено: ${formatCompletionMoment(hw.completedAt)}`;

            return (
              <div
                key={hw.id}
                className={`${styles.homeworkItem} ${isMobile ? styles.homeworkItemMobile : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenHomework(hw.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenHomework(hw.id);
                  }
                }}
                aria-pressed={activeHomeworkId === hw.id}
              >
                {isMobile ? (
                  <div className={styles.homeworkContent}>
                    <div className={styles.homeworkTitleRow}>
                      <div className={`${styles.homeworkTitle} ${styles.homeworkTitleCompact}`}>{title}</div>
                      <div className={styles.statusStack}>
                        {renderStatusPill(statusInfo)}
                        {statusInfo.isOverdue && statusInfo.status !== 'DONE' && (
                          <span className={`${styles.statusPill} ${styles.statusOverdue}`}>Просрочено</span>
                        )}
                      </div>
                    </div>
                    <div className={`${styles.homeworkMetaRow} ${styles.homeworkMetaCompact}`}>
                      <span className={styles.homeworkMeta}>{deadlineLabel}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.homeworkContent}>
                      <div className={styles.homeworkTitleRow}>
                        <div className={styles.homeworkTitle}>{title}</div>
                      </div>
                      <div className={styles.homeworkMetaRow}>
                        <span className={styles.homeworkMeta}>{deadlineLabel}</span>
                        <span className={`${styles.metaDivider} ${styles.homeworkMetaSecondary}`}>•</span>
                        <span className={`${styles.homeworkMeta} ${styles.homeworkMetaSecondary}`}>{timeSpentLabel}</span>
                        {hw.completedAt && (
                          <>
                            <span className={`${styles.metaDivider} ${styles.homeworkMetaSecondary}`}>•</span>
                            <span className={`${styles.homeworkMeta} ${styles.homeworkMetaSecondary}`}>
                              {completedLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={styles.homeworkActions}>
                      <div className={styles.statusStack}>
                        {renderStatusPill(statusInfo)}
                        {statusInfo.isOverdue && statusInfo.status !== 'DONE' && (
                          <span className={`${styles.statusPill} ${styles.statusOverdue}`}>Просрочено</span>
                        )}
                      </div>
                      <div className={styles.iconActions}>
                        <button
                          className={controls.iconButton}
                          aria-label="Отметить выполненным"
                          title="Переключить выполнено"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleHomework(hw.id);
                          }}
                        >
                          <CheckCircleOutlineIcon width={18} height={18} />
                        </button>
                        <div className={styles.moreActionsWrapper}>
                          <button
                            className={controls.iconButton}
                            aria-label="Ещё"
                            title="Ещё действия"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleHomeworkMenu(hw.id);
                            }}
                          >
                            <MoreHorizIcon width={18} height={18} />
                          </button>
                          {openHomeworkMenuId === hw.id && (
                            <div className={styles.moreMenu}>
                              <button
                                aria-label="Напомнить"
                                title="Отправить напоминание"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onHomeworkReminder(hw.id);
                                }}
                              >
                                Напомнить
                              </button>
                              <button
                                aria-label="Редактировать"
                                title="Редактировать"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEditHomework(hw.id);
                                }}
                              >
                                Редактировать
                              </button>
                              {statusInfo.status !== 'DRAFT' && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onMoveToDraft(hw.id);
                                  }}
                                >
                                  В черновик
                                </button>
                              )}
                              <button
                                className={styles.dangerButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteHomework(hw.id);
                                }}
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}

        {!isLoading && !filteredHomeworks.length && (
          <div className={styles.emptyState}>
            <p>Пока нет домашек. Добавьте новое задание.</p>
            <button className={controls.primaryButton} onClick={onOpenCreateHomework}>
              + Новое ДЗ
            </button>
          </div>
        )}
        {hasMore && (
          <div ref={loadMoreRef} className={styles.loadMoreSentinel}>
            {isLoading && <div className={styles.loadingRow}>Загрузка…</div>}
          </div>
        )}
      </div>
    </div>
  );
};
