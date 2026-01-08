import { FC, useMemo } from 'react';
import { addDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Box, Chip, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Stack } from '@mui/material';

import { AddOutlinedIcon, HistoryOutlinedIcon, RemoveOutlinedIcon } from '../../../icons/MaterialIcons';
import { Lesson, PaymentEvent } from '../../../entities/types';
import styles from '../StudentsSection.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';

interface PaymentListProps {
  payments: PaymentEvent[];
  onOpenLesson?: (lesson: Lesson) => void;
}

const getEventTitle = (event: PaymentEvent) => {
  switch (event.type) {
    case 'TOP_UP':
      return `Пополнение предоплаты: +${event.lessonsDelta} занятия`;
    case 'SUBSCRIPTION':
      return `Абонемент: +${event.lessonsDelta} занятия`;
    case 'AUTO_CHARGE':
      return 'Автосписание за занятие';
    case 'MANUAL_PAID':
      if (event.reason === 'BALANCE_PAYMENT') {
        return 'Оплата занятия с баланса';
      }
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
      if (event.reason === 'BALANCE_PAYMENT') {
        return 'Оплачено';
      }
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

const getEventChipClass = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP' || event.type === 'MANUAL_PAID') {
    return styles.paymentChipPayment;
  }

  if (event.type === 'AUTO_CHARGE') {
    return styles.paymentChipCharge;
  }

  if (event.type === 'ADJUSTMENT') {
    if (
      event.reason === 'LESSON_CANCELED' ||
      event.reason === 'PAYMENT_REVERT_REFUND' ||
      event.reason === 'PAYMENT_REVERT' ||
      event.reason === 'PAYMENT_REVERT_WRITE_OFF'
    ) {
      return styles.paymentChipRefund;
    }

    return styles.paymentChipAdjustment;
  }

  return styles.paymentChipFallback;
};

const getEventIcon = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP' || event.type === 'SUBSCRIPTION' || event.type === 'OTHER') return AddOutlinedIcon;
  if (event.type === 'AUTO_CHARGE') return RemoveOutlinedIcon;
  return HistoryOutlinedIcon;
};

const formatLessonLabel = (lesson: Lesson | null | undefined, timeZone: string) =>
  lesson?.startAt
    ? `Занятие ${formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', { locale: ru, timeZone })}`
    : 'Без привязки к занятию';

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
  const timeZone = useTimeZone();
  const todayZoned = toZonedDate(new Date(), timeZone);

  const getDateLabel = (value: string) => {
    const date = toZonedDate(value, timeZone);
    if (isSameDay(date, todayZoned)) return 'Сегодня';
    if (isSameDay(date, addDays(todayZoned, -1))) return 'Вчера';
    return formatInTimeZone(value, 'd MMMM', { locale: ru, timeZone });
  };

  const groupedEvents = useMemo(() => {
    return payments.reduce<Record<string, PaymentEvent[]>>((acc, event) => {
      const key = getDateLabel(event.createdAt);
      acc[key] = acc[key] ? [...acc[key], event] : [event];
      return acc;
    }, {});
  }, [payments, timeZone, todayZoned]);

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
                    const timestamp = formatInTimeZone(event.createdAt, 'd MMM yyyy, HH:mm', {
                      locale: ru,
                      timeZone,
                    });
                    const lessonLabel = event.lessonId ? formatLessonLabel(event.lesson, timeZone) : 'Без привязки к занятию';
                    const lessonTimestamp = event.lesson?.startAt
                      ? formatInTimeZone(event.lesson.startAt, 'd MMM, HH:mm', { locale: ru, timeZone })
                      : 'Без привязки к занятию';
                    const isClickable = Boolean(event.lessonId && event.lesson && onOpenLesson);
                    const valueMeta = formatEventValue(event);
                    const amountNode = (
                      <Box className={`${styles.paymentAmount} ${styles.paymentDesktopOnly}`}>
                        <span>{valueMeta.value}</span>
                        {valueMeta.withSuffix && (
                          <span className={styles.paymentAmountSuffix}>ур.</span>
                        )}
                      </Box>
                    );
                    const chipClassName = `${styles.paymentChip} ${getEventChipClass(event)}`;
                    const listItemContent = (
                      <>
                        {/*<ListItemIcon className={`${styles.paymentIcon} ${styles.paymentDesktopOnly}`}>*/}
                        {/*  <IconComponent width={20} height={20} />*/}
                        {/*</ListItemIcon>*/}
                        <ListItemText
                          className={styles.paymentDesktopOnly}
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center" className={styles.paymentTitleRow}>
                              <span className={styles.paymentTitle}>{getEventTitle(event)}</span>
                              <Chip label={getEventChipLabel(event)} size="small" className={chipClassName} />
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
                        {amountNode}
                        <div className={styles.paymentMobileContent}>
                          <div className={styles.paymentMobileHeader}>
                            <span className={`${styles.paymentTitle} ${styles.paymentMobileTitle}`}>
                              {getEventTitle(event)}
                            </span>
                            <Box className={`${styles.paymentAmount} ${styles.paymentMobileAmount}`}>
                              <span>{valueMeta.value}</span>
                              {valueMeta.withSuffix && (
                                <span className={styles.paymentAmountSuffix}>ур.</span>
                              )}
                            </Box>
                          </div>
                          <div className={styles.paymentMobileChips}>
                            <Chip label={getEventChipLabel(event)} size="small" className={chipClassName} />
                          </div>
                          <div className={`${styles.paymentMeta} ${styles.paymentMobileMeta}`}>
                            <span>{`Оплата: ${timestamp}`}</span>
                            <span>{`Занятие: ${lessonTimestamp}`}</span>
                            {event.comment && <span className={styles.paymentComment}>{event.comment}</span>}
                          </div>
                        </div>
                      </>
                    );

                    if (isClickable) {
                      return (
                        <ListItem
                          key={event.id}
                          className={styles.paymentItem}
                          onClick={() => event.lesson && onOpenLesson?.(event.lesson)}
                        >
                          {listItemContent}
                        </ListItem>
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
