import { FC, useMemo } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Box, Chip, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Stack } from '@mui/material';

import { AddOutlinedIcon, HistoryOutlinedIcon, RemoveOutlinedIcon } from '../../../icons/MaterialIcons';
import { Lesson, PaymentEvent } from '../../../entities/types';
import styles from '../StudentsSection.module.css';

interface PaymentListProps {
  payments: PaymentEvent[];
  onOpenLesson?: (lesson: Lesson) => void;
}

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
    case 'SUBSCRIPTION':
      return `Абонемент: +${event.lessonsDelta} занятия`;
    case 'AUTO_CHARGE':
      return 'Автосписание за занятие';
    case 'MANUAL_PAID':
      return 'Оплата занятия вручную';
    case 'OTHER':
      return `Другое: +${event.lessonsDelta} занятия`;
    case 'ADJUSTMENT':
      if (event.reason === 'LESSON_CANCELED') {
        return 'Возврат урока после отмены занятия';
      }
      if (event.reason === 'PAYMENT_REVERT_REFUND' || event.reason === 'PAYMENT_REVERT') {
        return 'Оплата отменена, урок возвращён на баланс';
      }
      if (event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
        return 'Оплата отменена без возврата';
      }
      if (event.lessonsDelta > 0) {
        return 'Возврат урока на баланс';
      }
      if (event.lessonsDelta < 0) {
        return 'Списание урока с баланса';
      }
      return 'Корректировка баланса';
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
    case 'SUBSCRIPTION':
      return 'Абонемент';
    case 'OTHER':
      return 'Другое';
    case 'ADJUSTMENT':
      if (
        event.reason === 'LESSON_CANCELED' ||
        event.reason === 'PAYMENT_REVERT_REFUND' ||
        event.reason === 'PAYMENT_REVERT'
      ) {
        return 'Возврат';
      }
      if (event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
        return 'Отмена оплаты';
      }
      return 'Корректировка';
    default:
      return 'Событие';
  }
};

const getEventIcon = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP' || event.type === 'SUBSCRIPTION' || event.type === 'OTHER') return AddOutlinedIcon;
  if (event.type === 'AUTO_CHARGE') return RemoveOutlinedIcon;
  return HistoryOutlinedIcon;
};

const formatLessonLabel = (lesson?: Lesson | null) =>
  lesson?.startAt ? `Занятие ${format(parseISO(lesson.startAt), 'd MMM, HH:mm', { locale: ru })}` : 'Без привязки к занятию';

const formatEventValue = (event: PaymentEvent) => {
  if (event.type === 'ADJUSTMENT' && event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
    return { value: '—', withSuffix: false };
  }
  if (typeof event.moneyAmount === 'number') {
    return { value: `${event.moneyAmount} ₽`, withSuffix: false };
  }
  const sign = event.lessonsDelta > 0 ? '+' : '';
  return { value: `${sign}${event.lessonsDelta}`, withSuffix: true };
};

export const PaymentList: FC<PaymentListProps> = ({
  payments,
  onOpenLesson,
}) => {
  const groupedEvents = useMemo(() => {
    return payments.reduce<Record<string, PaymentEvent[]>>((acc, event) => {
      const key = getDateLabel(event.createdAt);
      acc[key] = acc[key] ? [...acc[key], event] : [event];
      return acc;
    }, {});
  }, [payments]);

  const groupEntries = Object.entries(groupedEvents);

  return (
    <div className={styles.paymentList}>
      <div className={styles.tabContentScroll}>
        {!payments.length ? (
          <div className={styles.emptyState}>
            <p>По выбранному фильтру ничего нет</p>
          </div>
        ) : (
          <List className={styles.paymentListRoot}>
            {groupEntries.map(([groupLabel, events]) => (
              <li key={groupLabel} className={styles.paymentGroup}>
                <ul className={styles.paymentGroupList}>
                  <div className={styles.paymentGroupTitle}>
                    {groupLabel}
                  </div>
                  {events.map((event) => {
                    const IconComponent = getEventIcon(event);
                    const timestamp = format(parseISO(event.createdAt), 'd MMM yyyy, HH:mm', { locale: ru });
                    const lessonLabel = event.lessonId ? formatLessonLabel(event.lesson) : 'Без привязки к занятию';
                    const isClickable = Boolean(event.lessonId && event.lesson && onOpenLesson);
                    const valueMeta = formatEventValue(event);
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
                              {event.comment && <span className={styles.paymentComment}>{event.comment}</span>}
                            </Stack>
                          }
                        />
                        <Box className={styles.paymentAmount}>
                          <span>{valueMeta.value}</span>
                          {valueMeta.withSuffix && (
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
    </div>
  );
};
