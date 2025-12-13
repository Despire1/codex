import { format, parseISO } from 'date-fns';
import { FC } from 'react';

import { Payment } from '../../../entities/types';
import styles from '../StudentsSection.module.css';

interface PaymentListProps {
  payments: Payment[];
}

export const PaymentList: FC<PaymentListProps> = ({ payments }) => {
  if (!payments.length) {
    return (
      <div className={styles.emptyState}>
        <p>Платежей пока нет</p>
      </div>
    );
  }

  return (
    <div className={styles.paymentList}>
      {payments.map((payment) => {
        const paymentDateLabel = format(parseISO(payment.paidAt), 'd MMM yyyy');
        const lessonLabel = payment.lesson?.startAt
          ? `Урок: ${format(parseISO(payment.lesson.startAt), 'd MMM, HH:mm')}`
          : 'Без привязки к уроку';

        return (
          <div key={payment.id} className={styles.paymentItem}>
            <div className={styles.paymentDetails}>
              <div className={styles.paymentTitle}>{paymentDateLabel}</div>
              <div className={styles.paymentMeta}>{lessonLabel}</div>
            </div>
            <div className={styles.paymentAmount}>{payment.amount} ₽</div>
          </div>
        );
      })}
    </div>
  );
};
