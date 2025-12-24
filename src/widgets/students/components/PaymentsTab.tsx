import { FC } from 'react';
import { PaymentEvent, Lesson } from '../../../entities/types';
import styles from '../StudentsSection.module.css';
import { PaymentList } from './PaymentList';

interface PaymentsTabProps {
  payments: PaymentEvent[];
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate: string;
  onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
  onPaymentDateChange: (date: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
}

export const PaymentsTab: FC<PaymentsTabProps> = ({
  payments,
  paymentFilter,
  paymentDate,
  onPaymentFilterChange,
  onPaymentDateChange,
  onOpenLesson,
}) => {
  return (
    <div className={styles.card}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Оплаты</div>
          <div className={styles.subtleLabel}>История платежей для ученика</div>
        </div>
      </div>
      <PaymentList
        payments={payments}
        filter={paymentFilter}
        date={paymentDate}
        onFilterChange={onPaymentFilterChange}
        onDateChange={onPaymentDateChange}
        onOpenLesson={onOpenLesson}
      />
    </div>
  );
};
