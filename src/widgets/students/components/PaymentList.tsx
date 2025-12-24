import { FC, useMemo, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Box, Chip, List, ListItem, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Stack } from '@mui/material';

import { AddOutlinedIcon, HistoryOutlinedIcon, RemoveOutlinedIcon } from '../../../icons/MaterialIcons';
import { Lesson, PaymentEvent } from '../../../entities/types';
import styles from '../StudentsSection.module.css';

interface PaymentListProps {
  payments: PaymentEvent[];
  onOpenLesson?: (lesson: Lesson) => void;
}

type FilterId = 'all' | 'topup' | 'charges' | 'manual';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'topup', label: 'Пополнения' },
  { id: 'charges', label: 'Списания' },
  { id: 'manual', label: 'Ручные оплаты' },
];

const getDateLabel = (value: string) => {
  const date = parseISO(value);
  if (isToday(date)) return 'Сегодня';
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMMM', { locale: ru });
};

const getEventTitle = (event: PaymentEvent) => {
  switch (event.type) {
    case 'TOP_UP':
      return `Пополнение предоплаты: +${event.lessonsDelta} занятия`;
    case 'AUTO_CHARGE':
      return 'Автосписание за занятие';
    case 'MANUAL_PAID':
      return 'Оплата занятия вручную';
    case 'ADJUSTMENT':
      if (event.reason === 'LESSON_CANCELED' || event.lessonsDelta > 0) {
        return 'Возврат занятия после отмены';
      }
      return 'Корректировка оплаты';
    default:
      return 'Изменение оплаты';
  }
};

const getEventChipLabel = (event: PaymentEvent) => {
  switch (event.type) {
    case 'TOP_UP':
      return 'Пополнение';
    case 'AUTO_CHARGE':
      return 'Списание';
    case 'MANUAL_PAID':
      return 'Ручная оплата';
    case 'ADJUSTMENT':
      return 'Корректировка';
    default:
      return 'Событие';
  }
};

const getEventIcon = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP') return AddOutlinedIcon;
  if (event.type === 'AUTO_CHARGE') return RemoveOutlinedIcon;
  return HistoryOutlinedIcon;
};

const formatLessonLabel = (lesson?: Lesson | null) =>
  lesson?.startAt ? `Занятие ${format(parseISO(lesson.startAt), 'd MMM, HH:mm', { locale: ru })}` : 'Без привязки к занятию';

const formatEventValue = (event: PaymentEvent) => {
  if (typeof event.moneyAmount === 'number') {
    return `${event.moneyAmount} ₽`;
  }
  const sign = event.lessonsDelta > 0 ? '+' : '';
  return `${sign}${event.lessonsDelta}`;
};

export const PaymentList: FC<PaymentListProps> = ({ payments, onOpenLesson }) => {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');

  const filteredPayments = useMemo(() => {
    if (activeFilter === 'all') return payments;
    if (activeFilter === 'topup') return payments.filter((event) => event.type === 'TOP_UP');
    if (activeFilter === 'manual') return payments.filter((event) => event.type === 'MANUAL_PAID');
    if (activeFilter === 'charges') {
      return payments.filter(
        (event) => event.type === 'AUTO_CHARGE' || (event.type === 'ADJUSTMENT' && event.lessonsDelta < 0),
      );
    }
    return payments;
  }, [activeFilter, payments]);

  const groupedEvents = useMemo(() => {
    return filteredPayments.reduce<Record<string, PaymentEvent[]>>((acc, event) => {
      const key = getDateLabel(event.createdAt);
      acc[key] = acc[key] ? [...acc[key], event] : [event];
      return acc;
    }, {});
  }, [filteredPayments]);

  const groupEntries = Object.entries(groupedEvents);

  if (!payments.length) {
    return (
      <div className={styles.emptyState}>
        <p>Событий по оплатам пока нет</p>
      </div>
    );
  }

  return (
    <div className={styles.paymentList}>
      <div className={styles.paymentFilters}>
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
            className={`${styles.paymentFilterButton} ${activeFilter === filter.id ? styles.paymentFilterActive : ''}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {filteredPayments.length === 0 ? (
        <div className={styles.emptyState}>
          <p>По выбранному фильтру ничего нет</p>
        </div>
      ) : (
        <List className={styles.paymentListRoot}>
        {groupEntries.map(([groupLabel, events]) => (
          <li key={groupLabel} className={styles.paymentGroup}>
            <ul className={styles.paymentGroupList}>
              <ListSubheader className={styles.paymentGroupTitle} disableSticky>
                {groupLabel}
              </ListSubheader>
              {events.map((event) => {
                const IconComponent = getEventIcon(event);
                const timestamp = format(parseISO(event.createdAt), 'd MMM yyyy, HH:mm', { locale: ru });
                const lessonLabel = event.lessonId ? formatLessonLabel(event.lesson) : 'Без привязки к занятию';
                const isClickable = Boolean(event.lessonId && event.lesson && onOpenLesson);
                const listItemContent = (
                  <>
                    <ListItemIcon className={styles.paymentIcon}>
                      <IconComponent width={20} height={20} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" className={styles.paymentTitleRow}>
                          <span className={styles.paymentTitle}>{getEventTitle(event)}</span>
                          <Chip label={getEventChipLabel(event)} size="small" className={styles.paymentChip} />
                        </Stack>
                      }
                      secondary={
                        <Stack className={styles.paymentMeta} spacing={0.5}>
                          <span>{timestamp}</span>
                          <span>{lessonLabel}</span>
                        </Stack>
                      }
                    />
                    <Box className={styles.paymentAmount}>
                      <span>{formatEventValue(event)}</span>
                      {typeof event.moneyAmount !== 'number' && (
                        <span className={styles.paymentAmountSuffix}>ур.</span>
                      )}
                    </Box>
                  </>
                );

                if (isClickable) {
                  return (
                    <ListItemButton
                      key={event.id}
                      className={styles.paymentItem}
                      onClick={() => event.lesson && onOpenLesson?.(event.lesson)}
                    >
                      {listItemContent}
                    </ListItemButton>
                  );
                }

                return (
                  <ListItem key={event.id} className={styles.paymentItem}>
                    {listItemContent}
                  </ListItem>
                );
              })}
            </ul>
          </li>
        ))}
        </List>
      )}
    </div>
  );
};
