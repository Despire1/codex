import {
  type FC,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAddressCard,
  faArrowLeft,
  faBookOpen,
  faCalendar,
  faCalendarDays,
  faCalendarPlus,
  faCheck,
  faClock,
  faComment,
  faEllipsis,
  faEnvelope,
  faPaperPlane,
  faPhone,
  faStar,
  faVideo,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { ru } from 'date-fns/locale';
import {
  Homework,
  Lesson,
  LinkedStudent,
  PaymentEvent,
  StudentDebtItem,
  StudentListItem,
} from '../../../../entities/types';
import { isLessonInSeries } from '@/entities/lesson/lib/lessonDetails';
import {
  resolveLessonCancelActionCopy,
  resolveLessonRecurrenceLabel,
  resolveLessonStatusLabel,
  resolveLessonStatusTone,
} from '@/entities/lesson/lib/lessonStatusPresentation';
import { resolveLessonEditDisabledReason } from '@/entities/lesson/lib/lessonMutationGuards';
import { useLessonActions } from '@/features/lessons/model/useLessonActions';
import type { LessonCancelRefundMode, LessonMutationPreview, LessonSeriesScope } from '@/features/lessons/model/types';
import { LessonCancelDialog } from '@/features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonRestoreDialog } from '@/features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '@/features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { api } from '@/shared/api/client';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import {
  buildProfileStats,
  buildStudentCardPresentation,
  getStatusUiMeta,
  getStudentDisplayName,
  getStudentInitials,
} from '../../model/referencePresentation';
import { formatInTimeZone } from '../../../../shared/lib/timezoneDates';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import { BottomSheet } from '@/shared/ui/BottomSheet/BottomSheet';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import controls from '@/shared/styles/controls.module.css';
import {
  CancelCircleOutlinedIcon,
  DeleteOutlineIcon,
  EditOutlinedIcon,
  ReplayOutlinedIcon,
} from '@/icons/MaterialIcons';
import { StudentDebtPopoverContent } from '../StudentDebtPopoverContent';
import { StudentProfileNotesPanel } from './StudentProfileNotesPanel';
import styles from './StudentsReferenceProfileView.module.css';

type ProfileTabId = 'homework' | 'lessons' | 'payments';

interface StudentsReferenceProfileViewProps {
  studentEntry: StudentListItem;
  studentHomeworks: Homework[];
  studentHomeworksLoading: boolean;
  studentLessons: Lesson[];
  studentLessonsHasMore: boolean;
  studentLessonsLoading: boolean;
  studentLessonsLoadingMore: boolean;
  studentLessonsSummary: Lesson[];
  studentDebtItems: StudentDebtItem[];
  payments: PaymentEvent[];
  paymentsLoading: boolean;
  onLoadMoreLessons: () => void;
  onCreateStudentNote: (
    studentEntry: StudentListItem,
    payload: { content: string; noteType: 'IMPORTANT' | 'INFO' },
  ) => Promise<void>;
  onUpdateStudentNote: (
    studentEntry: StudentListItem,
    noteId: string,
    payload: { content: string; noteType: 'IMPORTANT' | 'INFO' },
  ) => Promise<void>;
  onDeleteStudentNote: (studentEntry: StudentListItem, noteId: string) => Promise<void>;
  activeTab: ProfileTabId;
  onTabChange: (tab: ProfileTabId) => void;
  onBack: () => void;
  onScheduleLesson: () => void;
  onEditStudent: (options?: { focusField?: 'price' }) => void;
  onOpenBalanceTopup: () => void;
  onRequestDeleteStudent: () => void;
  onTogglePaymentReminders: (enabled: boolean) => void;
  onWriteToStudent: () => void;
  onRemindLessonPayment: (
    lessonId: number,
    studentId?: number,
    options?: { force?: boolean },
  ) => Promise<{ status: 'sent' | 'error' }>;
  onTogglePaid: (lessonId: number, studentId?: number, options?: { currentIsPaid?: boolean }) => void | Promise<void>;
  onRemindHomework: (homeworkId: number) => void;
  timeZone: string;
}

type PendingScopeAction =
  | {
      type: 'cancel';
      lesson: Lesson;
      refundMode?: LessonCancelRefundMode;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    }
  | {
      type: 'restore';
      lesson: Lesson;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    };

const profileTabs: Array<{ id: ProfileTabId; label: string; icon: typeof faBookOpen }> = [
  { id: 'lessons', label: 'Занятия', icon: faCalendarDays },
  { id: 'homework', label: 'Домашние задания', icon: faBookOpen },
  { id: 'payments', label: 'Оплаты', icon: faWallet },
];

const getPaymentEventTitle = (event: PaymentEvent) => {
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

const getPaymentStatusMeta = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP' || event.type === 'SUBSCRIPTION' || event.type === 'OTHER') {
    return { label: 'Пополнение', tone: 'paid' as const };
  }
  if (event.type === 'AUTO_CHARGE') {
    return { label: 'Списание', tone: 'charge' as const };
  }
  if (event.type === 'MANUAL_PAID') {
    return {
      label: event.reason === 'BALANCE_PAYMENT' ? 'Оплачено с баланса' : 'Ручная оплата',
      tone: 'paid' as const,
    };
  }
  if (event.type === 'ADJUSTMENT') {
    if (
      event.reason === 'LESSON_CANCELED' ||
      event.reason === 'PAYMENT_REVERT_REFUND' ||
      event.reason === 'PAYMENT_REVERT'
    ) {
      return { label: 'Возврат', tone: 'pending' as const };
    }
    if (event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
      return { label: 'Отмена оплаты', tone: 'charge' as const };
    }
    return { label: 'Корректировка', tone: 'pending' as const };
  }
  return { label: 'Событие', tone: 'pending' as const };
};

const formatPaymentEventValue = (event: PaymentEvent) => {
  if (event.type === 'ADJUSTMENT' && event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
    return '—';
  }
  if (typeof event.moneyAmount === 'number' && event.moneyAmount > 0) {
    return `${event.moneyAmount.toLocaleString('ru-RU')} ₽`;
  }
  const sign = event.lessonsDelta > 0 ? '+' : '';
  return `${sign}${event.lessonsDelta} урок.`;
};

export const StudentsReferenceProfileView: FC<StudentsReferenceProfileViewProps> = ({
  studentEntry,
  studentHomeworks,
  studentHomeworksLoading,
  studentLessons,
  studentLessonsHasMore,
  studentLessonsLoading,
  studentLessonsLoadingMore,
  studentLessonsSummary,
  studentDebtItems,
  payments,
  paymentsLoading,
  onLoadMoreLessons,
  onCreateStudentNote,
  onUpdateStudentNote,
  onDeleteStudentNote,
  activeTab,
  onTabChange,
  onBack,
  onScheduleLesson,
  onEditStudent,
  onOpenBalanceTopup,
  onRequestDeleteStudent,
  onTogglePaymentReminders,
  onWriteToStudent,
  onRemindLessonPayment,
  onTogglePaid,
  onRemindHomework,
  timeZone,
}) => {
  const isMobile = useIsMobile(760);
  const { startEditLesson, requestDeleteLessonFromList, cancelLesson, restoreLesson } = useLessonActions();
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isReminderSettingsOpen, setIsReminderSettingsOpen] = useState(false);
  const [isDebtPopoverOpen, setIsDebtPopoverOpen] = useState(false);
  const [cancelDialogLesson, setCancelDialogLesson] = useState<Lesson | null>(null);
  const [restoreDialogLesson, setRestoreDialogLesson] = useState<Lesson | null>(null);
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);
  const lessonsListRef = useRef<HTMLDivElement | null>(null);
  const lessonsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [pendingPaymentIds, setPendingPaymentIds] = useState<number[]>([]);
  const [pendingReminderIds, setPendingReminderIds] = useState<number[]>([]);
  const [shouldAutoCloseDebt, setShouldAutoCloseDebt] = useState(false);
  const previousDebtCount = useRef(0);
  const cardPresentation = buildStudentCardPresentation(studentEntry, timeZone);
  const statusMeta = getStatusUiMeta(cardPresentation.status);
  const profileStats = buildProfileStats(studentEntry, studentLessonsSummary, studentHomeworks, studentDebtItems);

  const homeworksOrdered = useMemo(
    () => [...studentHomeworks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [studentHomeworks],
  );
  const lessonsOrdered = studentLessons;
  const paymentsOrdered = useMemo(
    () => [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [payments],
  );
  const linkedStudentsById = useMemo(() => {
    const map = new Map<number, LinkedStudent>();
    map.set(studentEntry.student.id, {
      ...studentEntry.student,
      link: studentEntry.link,
      homeworks: [],
    });
    return map;
  }, [studentEntry.link, studentEntry.student]);
  const unpaidLessonsTotal = useMemo(() => {
    const total = studentDebtItems.reduce(
      (sum, item) => sum + (typeof item.price === 'number' && item.price > 0 ? item.price : 0),
      0,
    );

    if (total > 0) {
      return total;
    }

    return typeof studentEntry.debtRub === 'number' && studentEntry.debtRub > 0 ? studentEntry.debtRub : null;
  }, [studentDebtItems, studentEntry.debtRub]);

  const renderHomeworkTab = () => {
    if (studentHomeworksLoading && homeworksOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем домашние задания…</div>;
    }

    if (homeworksOrdered.length === 0) {
      return <div className={styles.tabEmpty}>У ученика пока нет домашних заданий.</div>;
    }

    return (
      <div className={styles.listStack}>
        {homeworksOrdered.map((homework) => {
          const done = homework.isDone || homework.status === 'DONE';
          const inProgress = homework.status === 'IN_PROGRESS';
          const assigned = homework.status === 'ASSIGNED';
          const statusLabel = done ? 'Выполнено' : inProgress ? 'В процессе' : assigned ? 'Назначено' : 'Черновик';

          return (
            <article
              key={homework.id}
              className={`${styles.activityCard} ${
                done ? styles.activityDone : inProgress ? styles.activityProgress : styles.activityScheduled
              }`}
            >
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.activityTitle}>{homework.text.slice(0, 70) || 'Домашнее задание'}</h3>
                  <p className={styles.activitySubtitle}>
                    {homework.deadlineAt || homework.deadline
                      ? `Срок: ${formatInTimeZone(homework.deadlineAt ?? homework.deadline ?? '', 'd MMMM yyyy', {
                          locale: ru,
                          timeZone,
                        })}`
                      : 'Без дедлайна'}
                  </p>
                </div>
                <span className={styles.statusBadge}>{statusLabel}</span>
              </div>

              <div className={styles.activityFooter}>
                <div className={styles.activityMetaLine}>
                  <FontAwesomeIcon icon={faClock} />
                  <span>
                    {done ? 'Завершено' : inProgress ? 'Выполняется' : 'Ожидает выполнения'}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.activityActionButton}
                  onClick={() => {
                    if (!done) {
                      onRemindHomework(homework.id);
                    }
                  }}
                >
                  {done ? 'Посмотреть' : 'Напомнить'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderLessonsTab = () => {
    if (studentLessonsLoading && lessonsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем занятия…</div>;
    }

    if (lessonsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Занятия пока не назначены.</div>;
    }

    const currentYearLabel = formatInTimeZone(new Date(), 'yyyy', { timeZone });

    return (
      <div ref={lessonsListRef} className={`${styles.listStack} ${styles.lessonsListStack}`}>
        {lessonsOrdered.map((lesson) => {
          const lessonTimestamp = new Date(lesson.startAt).getTime();
          const lessonEndAt = new Date(lessonTimestamp + Math.max(0, lesson.durationMinutes || 0) * 60_000);
          const lessonYearLabel = formatInTimeZone(lesson.startAt, 'yyyy', { timeZone });
          const lessonDatePattern =
            lessonYearLabel === currentYearLabel ? 'd MMMM • HH:mm' : 'd MMMM yyyy • HH:mm';
          const isJoinAvailable = lesson.status === 'SCHEDULED' && lessonEndAt.getTime() >= Date.now();
          const lessonParticipant = lesson.participants?.find((participant) => participant.studentId === studentEntry.student.id);
          const isPaidForStudent = lessonParticipant?.isPaid ?? lesson.isPaid;
          const statusLabel = resolveLessonStatusLabel(lesson);
          const statusTone = resolveLessonStatusTone(lesson);
          const paymentLabel = isPaidForStudent ? 'Оплачено' : 'Не оплачено';
          const paymentTone = isPaidForStudent ? 'paid' : 'unpaid';
          const recurrenceLabel = resolveLessonRecurrenceLabel(lesson);
          const lessonKindLabel = lesson.meetingLink ? 'Онлайн занятие' : 'Индивидуальный урок';
          const editDisabledReason = resolveLessonEditDisabledReason(lesson);
          const cancelCopy = resolveLessonCancelActionCopy(lesson);
          const isCanceled = lesson.status === 'CANCELED';
          const icon =
            lesson.status === 'COMPLETED'
              ? faCheck
              : lesson.status === 'CANCELED'
                ? faCalendar
                : faCalendarPlus;

          return (
            <article key={lesson.id} className={`${styles.activityCard} ${styles.lessonCard}`}>
              <div className={styles.activityHeader}>
                <div className={styles.lessonHeaderMain}>
                  <div
                    className={`${styles.lessonIconWrap} ${
                      statusTone === 'completed'
                        ? styles.lessonIconCompleted
                        : statusTone === 'canceled'
                          ? styles.lessonIconCanceled
                          : styles.lessonIconScheduled
                    }`}
                  >
                    <FontAwesomeIcon icon={icon} />
                  </div>
                  <div className={styles.lessonMainBlock}>
                    <h3 className={styles.activityTitle}>
                      {formatInTimeZone(lesson.startAt, lessonDatePattern, { locale: ru, timeZone })} -{' '}
                      {formatInTimeZone(lessonEndAt, 'HH:mm', { timeZone })}
                    </h3>
                    <p className={styles.activitySubtitle}>{lessonKindLabel}</p>
                    <div className={styles.lessonMetaRow}>
                      <span className={`${styles.lessonStatusBadge} ${styles[`lessonStatusBadge_${statusTone}`]}`}>
                        {statusLabel}
                      </span>
                      <Tooltip content={isPaidForStudent ? 'Отменить оплату' : 'Отметить оплату'}>
                        <button
                          type="button"
                          className={`${styles.lessonStatusBadge} ${styles[`lessonPaymentBadge_${paymentTone}`]} ${styles.lessonPaymentButton}`}
                          disabled={pendingPaymentIds.includes(lesson.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarkPaid(lesson.id, isPaidForStudent);
                          }}
                        >
                          {paymentLabel}
                        </button>
                      </Tooltip>
                      {recurrenceLabel ? <span className={styles.lessonMetaBadge}>{recurrenceLabel}</span> : null}
                    </div>
                  </div>
                </div>
                <div className={styles.lessonQuickActions}>
                  <Tooltip content={editDisabledReason ?? 'Редактировать'}>
                    <button
                      type="button"
                      className={styles.lessonActionButton}
                      disabled={Boolean(editDisabledReason)}
                      aria-label="Редактировать"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditLesson(lesson, { skipNavigation: true });
                      }}
                    >
                      <EditOutlinedIcon className={styles.lessonActionIcon} />
                    </button>
                  </Tooltip>
                  <Tooltip content={isCanceled ? 'Восстановить' : cancelCopy.actionLabel}>
                    <button
                      type="button"
                      className={`${styles.lessonActionButton} ${
                        isCanceled ? styles.lessonActionButtonNeutral : styles.lessonActionButtonDanger
                      }`}
                      aria-label={isCanceled ? 'Восстановить' : 'Отменить урок'}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isCanceled) {
                          handleRestoreLesson(lesson);
                          return;
                        }
                        handleCancelLesson(lesson);
                      }}
                    >
                      {isCanceled ? (
                        <ReplayOutlinedIcon className={styles.lessonActionIcon} />
                      ) : (
                        <CancelCircleOutlinedIcon className={styles.lessonActionIcon} />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content="Удалить">
                    <button
                      type="button"
                      className={styles.lessonActionButton}
                      aria-label="Удалить"
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDeleteLessonFromList(lesson);
                      }}
                    >
                      <DeleteOutlineIcon className={styles.lessonActionIcon} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {lesson.meetingLink ? (
                <div className={styles.activityFooter}>
                  <div className={styles.activityMetaLine}>
                    <FontAwesomeIcon icon={faVideo} />
                    <span>Есть ссылка на встречу</span>
                  </div>

                  {isJoinAvailable ? (
                    <button
                      type="button"
                      className={styles.lessonJoinButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(lesson.meetingLink, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Подключиться
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {studentLessonsHasMore ? (
          <div ref={lessonsLoadMoreRef} className={styles.loadMoreSentinel} aria-hidden="true" />
        ) : null}
        {studentLessonsLoadingMore ? <div className={styles.listLoadingMore}>Загружаем ещё занятия…</div> : null}
      </div>
    );
  };

  const renderPaymentsTab = () => {
    if (paymentsLoading && paymentsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Загружаем оплаты…</div>;
    }

    if (paymentsOrdered.length === 0) {
      return <div className={styles.tabEmpty}>Платежей пока нет.</div>;
    }

    const groupedPayments = paymentsOrdered.reduce<Array<{ title: string; items: PaymentEvent[] }>>((groups, event) => {
      const groupTitle = formatInTimeZone(event.createdAt, 'd MMMM', { locale: ru, timeZone });
      const currentGroup = groups[groups.length - 1];
      if (currentGroup?.title === groupTitle) {
        currentGroup.items.push(event);
        return groups;
      }
      groups.push({ title: groupTitle, items: [event] });
      return groups;
    }, []);

    return (
      <div className={styles.paymentsListStack}>
        {groupedPayments.map((group) => (
          <section key={group.title} className={styles.paymentGroup}>
            <div className={styles.paymentGroupTitle}>{group.title}</div>
            <div className={styles.paymentGroupList}>
              {group.items.map((event) => {
                const paymentStatus = getPaymentStatusMeta(event);
                const lessonMeta = event.lesson?.startAt ? (
                  <>
                    <span className={styles.paymentMetaLabel}>Занятие:</span>{' '}
                    {formatInTimeZone(event.lesson.startAt, 'd MMM yyyy, HH:mm', {
                      locale: ru,
                      timeZone,
                    })}
                  </>
                ) : (
                  <>
                    <span className={styles.paymentMetaLabel}>Занятие:</span> Без привязки к занятию
                  </>
                );

                return (
                  <article key={event.id} className={`${styles.activityCard} ${styles.paymentEventCard}`}>
                    <div className={styles.activityHeaderSimple}>
                      <div className={styles.paymentEventMain}>
                        <p className={styles.activitySubtitle}>
                          {formatInTimeZone(event.createdAt, 'd MMMM yyyy, HH:mm', { locale: ru, timeZone })}
                        </p>
                        <h3 className={styles.activityTitle}>{getPaymentEventTitle(event)}</h3>
                      </div>
                      <span
                        className={`${styles.statusBadge} ${styles.paymentEventStatusBadge} ${
                          paymentStatus.tone === 'paid'
                            ? styles.statusPaid
                            : paymentStatus.tone === 'charge'
                              ? styles.statusCharge
                              : styles.statusPending
                        }`}
                      >
                        {paymentStatus.label}
                      </span>
                    </div>
                    <div className={styles.paymentEventFooter}>
                      <div className={styles.paymentEventMeta}>
                        <span>{lessonMeta}</span>
                        {event.comment ? <span className={styles.paymentComment}>{event.comment}</span> : null}
                      </div>
                      <div className={styles.paymentEventValue}>{formatPaymentEventValue(event)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  const tabContent =
    activeTab === 'homework' ? renderHomeworkTab() : activeTab === 'lessons' ? renderLessonsTab() : renderPaymentsTab();

  const phoneLabel = studentEntry.link.phone?.trim() ?? '';
  const emailLabel = studentEntry.link.email?.trim() ?? '';
  const studentLevelLabel = studentEntry.link.studentLevel?.trim() ?? '';
  const telegramUsername = studentEntry.student.username?.trim();
  const showActivationBadge = Boolean(telegramUsername) && studentEntry.student.isActivated === false;
  const activationHint =
    'Ученик ещё не активирован. Нужно, чтобы он нажал кнопку Start в Telegram-боте — тогда он появится в системе и будет получать уведомления.';
  const reminderDisabledReason = !studentEntry.student.isActivated
    ? 'Ученик не активировал бота — отправка напоминаний невозможна'
    : null;
  const paymentRemindersEnabled = studentEntry.student.paymentRemindersEnabled !== false;
  const hasUnpaidLessons = studentDebtItems.length > 0;
  const hasDebtBadge =
    hasUnpaidLessons ||
    (typeof studentEntry.debtRub === 'number' && studentEntry.debtRub > 0) ||
    (studentEntry.debtLessonCount ?? 0) > 0;
  const unpaidLessonsLabel = 'Сумма неоплаченных занятий';
  const unpaidLessonsValueLabel =
    typeof unpaidLessonsTotal === 'number' && unpaidLessonsTotal > 0
      ? `${unpaidLessonsTotal.toLocaleString('ru-RU')} ₽`
      : '—';
  const priceValueLabel =
    typeof studentEntry.link.pricePerLesson === 'number' && studentEntry.link.pricePerLesson > 0
      ? `${studentEntry.link.pricePerLesson.toLocaleString('ru-RU')}₽`
      : '—';
  const memberSinceLabel = studentEntry.student.createdAt
    ? formatInTimeZone(studentEntry.student.createdAt, 'd MMMM yyyy', { locale: ru, timeZone })
    : '—';

  const handleMenuAction = (action: () => void) => {
    setIsActionsMenuOpen(false);
    action();
  };

  const openReminderSettings = () => {
    setIsActionsMenuOpen(false);
    setIsReminderSettingsOpen(true);
  };

  const handleTogglePaymentReminders = () => {
    onTogglePaymentReminders(!paymentRemindersEnabled);
  };

  const handleRemindPayment = async (lessonId: number) => {
    if (pendingReminderIds.includes(lessonId)) return;
    setPendingReminderIds((prev) => [...prev, lessonId]);
    try {
      await onRemindLessonPayment(lessonId, studentEntry.student.id);
    } finally {
      setPendingReminderIds((prev) => prev.filter((id) => id !== lessonId));
    }
  };

  const handleMarkPaid = async (lessonId: number, currentIsPaid = false) => {
    if (pendingPaymentIds.includes(lessonId)) return;
    setPendingPaymentIds((prev) => [...prev, lessonId]);
    setShouldAutoCloseDebt(true);
    try {
      await onTogglePaid(lessonId, studentEntry.student.id, { currentIsPaid });
    } finally {
      setPendingPaymentIds((prev) => prev.filter((id) => id !== lessonId));
    }
  };

  useEffect(() => {
    if (shouldAutoCloseDebt && previousDebtCount.current > 0 && studentDebtItems.length === 0) {
      setIsDebtPopoverOpen(false);
      setShouldAutoCloseDebt(false);
    } else if (shouldAutoCloseDebt && studentDebtItems.length > 0 && pendingPaymentIds.length === 0) {
      setShouldAutoCloseDebt(false);
    }
    previousDebtCount.current = studentDebtItems.length;
  }, [pendingPaymentIds.length, shouldAutoCloseDebt, studentDebtItems.length]);

  useEffect(() => {
    if (activeTab !== 'lessons') return;
    const root = lessonsListRef.current;
    const target = lessonsLoadMoreRef.current;
    if (!root || !target || !studentLessonsHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !studentLessonsLoadingMore) {
          onLoadMoreLessons();
        }
      },
      {
        root,
        rootMargin: '180px',
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, onLoadMoreLessons, studentLessonsHasMore, studentLessonsLoadingMore]);

  const handleCancelLesson = (lesson: Lesson) => {
    setCancelDialogLesson(lesson);
  };

  const handleRestoreLesson = (lesson: Lesson) => {
    setRestoreDialogLesson(lesson);
  };

  const handleConfirmCancel = (refundMode?: LessonCancelRefundMode) => {
    if (!cancelDialogLesson) return;
    const target = cancelDialogLesson;
    setCancelDialogLesson(null);
    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'CANCEL', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'cancel',
            lesson: target,
            refundMode,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'cancel', lesson: target, refundMode });
        });
      return;
    }
    void cancelLesson(target, 'SINGLE', refundMode);
  };

  const handleConfirmRestore = () => {
    if (!restoreDialogLesson) return;
    const target = restoreDialogLesson;
    setRestoreDialogLesson(null);
    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'RESTORE', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'restore',
            lesson: target,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'restore', lesson: target });
        });
      return;
    }
    void restoreLesson(target, 'SINGLE');
  };

  const handleScopeConfirm = (scope: LessonSeriesScope) => {
    if (!scopeDialog) return;
    const target = scopeDialog;
    setScopeDialog(null);
    if (target.type === 'cancel') {
      void cancelLesson(target.lesson, scope, target.refundMode);
      return;
    }
    void restoreLesson(target.lesson, scope);
  };

  const resolveScopeDialogCopy = (lesson: Lesson | null) => {
    const copy = resolveLessonCancelActionCopy(lesson);
    return {
      title: copy.title.replace('?', ''),
      confirmText: copy.confirmText,
    };
  };

  return (
    <div className={styles.screen}>
      <div className={styles.scrollArea}>
        <div className={styles.inner}>
          {isMobile ? (
            <div className={styles.backRow}>
              <Tooltip content="Вернуться к списку" side="bottom" align="start">
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={onBack}
                  aria-label="Вернуться к списку"
                >
                  <FontAwesomeIcon icon={faArrowLeft} />
                </button>
              </Tooltip>
              <h2 className={styles.backTitle}>Ученики</h2>
            </div>
          ) : null}

          <section className={styles.heroCard}>
            <div className={styles.heroMainRow}>
              <div className={styles.heroIdentity}>
                <div
                  className={styles.heroAvatar}
                  style={{
                    background: cardPresentation.uiColor,
                    borderColor: cardPresentation.uiColor,
                    color: '#ffffff',
                  }}
                >
                  {getStudentInitials(studentEntry)}
                </div>
                <div className={styles.heroIdentityContent}>
                  <div className={styles.heroTitleRow}>
                    <h1 className={styles.heroName}>{getStudentDisplayName(studentEntry)}</h1>
                    <div className={styles.heroBadges}>
                      {studentLevelLabel ? (
                        <Tooltip content="Уровень ученика" side="bottom" align="center">
                          <span className={styles.heroLevelBadge}>{studentLevelLabel}</span>
                        </Tooltip>
                      ) : null}
                      {hasDebtBadge ? (
                        <Tooltip content="Есть неоплаченные занятия" side="bottom" align="center">
                          <span className={styles.heroDebtBadge}>Долг</span>
                        </Tooltip>
                      ) : null}
                      {showActivationBadge ? (
                        <Tooltip content={activationHint} side="bottom" align="center">
                          <span className={styles.heroInactiveBadge}>Не активирован</span>
                        </Tooltip>
                      ) : null}
                      <Tooltip content="Статус ученика" side="bottom" align="center">
                        <span
                          className={`${styles.heroStatusBadge} ${
                            statusMeta.tone === 'active'
                              ? styles.heroStatusActive
                              : statusMeta.tone === 'paused'
                                ? styles.heroStatusPaused
                                : styles.heroStatusCompleted
                          }`}
                        >
                          {statusMeta.label}
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                  <div className={styles.heroUsernameRow}>
                    <span className={styles.heroUsernameLabel}>Telegram:</span>
                    {telegramUsername ? (
                      <button
                        type="button"
                        className={`${styles.heroUsernameValue} ${styles.heroUsernameButton}`}
                        onClick={onWriteToStudent}
                      >
                        @{telegramUsername}
                      </button>
                    ) : (
                      <span className={styles.heroUsernameValue}>@нет</span>
                    )}
                  </div>
                  {emailLabel || phoneLabel ? (
                    <div className={styles.heroContactsRow}>
                      {emailLabel ? (
                        <span className={styles.contactItem}>
                          <FontAwesomeIcon icon={faEnvelope} /> {emailLabel}
                        </span>
                      ) : null}
                      {phoneLabel ? (
                        <span className={styles.contactItem}>
                          <FontAwesomeIcon icon={faPhone} /> {phoneLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={styles.heroActions}>
                <Tooltip content="Написать в Телеграм" side="bottom" align="center">
                  <button type="button" className={styles.secondaryAction} onClick={onWriteToStudent}>
                    <FontAwesomeIcon icon={faComment} /> Написать
                  </button>
                </Tooltip>
                <button type="button" className={styles.primaryAction} onClick={onScheduleLesson}>
                  <FontAwesomeIcon icon={faCalendarPlus} /> Назначить занятие
                </button>
                <AdaptivePopover
                  isOpen={isActionsMenuOpen}
                  onClose={() => setIsActionsMenuOpen(false)}
                  side="bottom"
                  align="end"
                  offset={8}
                  className={styles.actionsMenu}
                  trigger={
                    <button
                      type="button"
                      className={styles.menuAction}
                      aria-label="Быстрые действия по ученику"
                      onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                    >
                      <FontAwesomeIcon icon={faEllipsis} />
                    </button>
                  }
                >
                  <button type="button" onClick={() => handleMenuAction(onEditStudent)}>
                    Редактировать ученика
                  </button>
                  <button type="button" onClick={openReminderSettings}>
                    Настройки уведомлений
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => handleMenuAction(onRequestDeleteStudent)}>
                    Удалить ученика
                  </button>
                </AdaptivePopover>
              </div>
            </div>

            <div className={styles.heroStatsGrid}>
              <div>
                <div className={styles.heroStatValue}>{profileStats.lessonsConducted}</div>
                <div className={styles.heroStatLabel}>Занятий проведено</div>
              </div>
              <button
                type="button"
                className={styles.heroStatButton}
                onClick={() => onEditStudent({ focusField: 'price' })}
                aria-label="Изменить цену занятия"
              >
                <div className={`${styles.heroStatValue} ${styles.heroStatBlue}`}>{priceValueLabel}</div>
                <div className={styles.heroStatLabel}>Цена за урок</div>
              </button>
              {hasUnpaidLessons ? (
                <AdaptivePopover
                  isOpen={isDebtPopoverOpen}
                  onClose={() => setIsDebtPopoverOpen(false)}
                  side="bottom"
                  align="start"
                  offset={8}
                  className={styles.debtPopover}
                  trigger={(
                    <button
                      type="button"
                      className={`${styles.heroStatButton} ${styles.heroStatDangerButton}`}
                      onClick={() => setIsDebtPopoverOpen((prev) => !prev)}
                      aria-label="Показать неоплаченные занятия"
                    >
                      <div className={`${styles.heroStatValue} ${styles.heroStatDanger}`}>{unpaidLessonsValueLabel}</div>
                      <div className={styles.heroStatLabel}>{unpaidLessonsLabel}</div>
                    </button>
                  )}
                >
                  <StudentDebtPopoverContent
                    items={studentDebtItems}
                    pendingIds={pendingPaymentIds}
                    pendingReminderIds={pendingReminderIds}
                    onMarkPaid={handleMarkPaid}
                    onSendPaymentReminder={handleRemindPayment}
                    reminderDisabledReason={reminderDisabledReason}
                  />
                </AdaptivePopover>
              ) : (
                <div>
                  <div className={`${styles.heroStatValue} ${styles.heroStatBlue}`}>{profileStats.averageScore}</div>
                  <div className={styles.heroStatLabel}>Средний балл</div>
                </div>
              )}
              <Tooltip content="Нажмите, чтобы изменить баланс">
                <button
                  type="button"
                  className={styles.heroStatButton}
                  onClick={onOpenBalanceTopup}
                  aria-label={`Изменить баланс. Текущий баланс: ${studentEntry.link.balanceLessons}`}
                >
                  <div
                    className={`${styles.heroStatValue} ${
                      studentEntry.link.balanceLessons < 0 ? styles.heroStatDanger : styles.heroStatGreen
                    }`}
                  >
                    {studentEntry.link.balanceLessons}
                  </div>
                  <div className={styles.heroStatLabel}>Занятия на балансе</div>
                </button>
              </Tooltip>
              <div>
                <div className={`${styles.heroStatValue} ${styles.heroStatViolet}`}>{profileStats.completedHomeworks}</div>
                <div className={styles.heroStatLabel}>Домашек сдано</div>
              </div>
            </div>
          </section>

          {!isMobile && (
            <Modal open={isReminderSettingsOpen} title="Настройки уведомлений" onClose={() => setIsReminderSettingsOpen(false)}>
              <div className={styles.reminderSheet}>
                <div className={styles.reminderRow}>
                  <div>
                    <div className={styles.reminderLabel}>Напоминания об оплате</div>
                    <div className={styles.reminderHelper}>
                      {paymentRemindersEnabled ? 'Сейчас включены для этого ученика' : 'Сейчас выключены для этого ученика'}
                    </div>
                  </div>
                  <label className={controls.switch}>
                    <input
                      type="checkbox"
                      checked={paymentRemindersEnabled}
                      onChange={handleTogglePaymentReminders}
                    />
                    <span className={controls.slider} />
                  </label>
                </div>
                <p className={styles.reminderHint}>
                  Управляет автоматическими уведомлениями по оплате именно для этого ученика.
                </p>
                <div className={styles.reminderActions}>
                  <button
                    type="button"
                    className={controls.secondaryButton}
                    onClick={() => setIsReminderSettingsOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {isMobile && (
            <BottomSheet isOpen={isReminderSettingsOpen} onClose={() => setIsReminderSettingsOpen(false)}>
              <div className={styles.reminderSheet}>
                <h3 className={styles.reminderTitle}>Настройки уведомлений</h3>
                <div className={styles.reminderRow}>
                  <div>
                    <div className={styles.reminderLabel}>Напоминания об оплате</div>
                    <div className={styles.reminderHelper}>
                      {paymentRemindersEnabled ? 'Сейчас включены для этого ученика' : 'Сейчас выключены для этого ученика'}
                    </div>
                  </div>
                  <label className={controls.switch}>
                    <input
                      type="checkbox"
                      checked={paymentRemindersEnabled}
                      onChange={handleTogglePaymentReminders}
                    />
                    <span className={controls.slider} />
                  </label>
                </div>
                <p className={styles.reminderHint}>
                  Управляет автоматическими уведомлениями по оплате именно для этого ученика.
                </p>
                <div className={styles.reminderActions}>
                  <button
                    type="button"
                    className={controls.secondaryButton}
                    onClick={() => setIsReminderSettingsOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </BottomSheet>
          )}

          <div className={styles.bodyGrid}>
            <div className={styles.mainColumn}>
              <section className={styles.tabsCard}>
                <div className={styles.tabsHeader}>
                  <div className={styles.tabsRow}>
                    {profileTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
                        onClick={() => onTabChange(tab.id)}
                      >
                        <FontAwesomeIcon icon={tab.icon} />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.tabContent}>{tabContent}</div>
              </section>
            </div>

            <div className={styles.sideColumn}>
              <StudentProfileNotesPanel
                studentEntry={studentEntry}
                timeZone={timeZone}
                onCreateNote={onCreateStudentNote}
                onUpdateNote={onUpdateStudentNote}
                onDeleteNote={onDeleteStudentNote}
              />

              <section className={styles.contactCard}>
                <div className={styles.contactHeader}>
                  <div className={styles.contactIconWrap}>
                    <FontAwesomeIcon icon={faAddressCard} />
                  </div>
                  <h3>Информация</h3>
                </div>

                <div className={styles.contactList}>
                  <div>
                    <FontAwesomeIcon icon={faPaperPlane} />
                    <span>{studentEntry.student.username ? `@${studentEntry.student.username}` : 'Не указан'}</span>
                  </div>
                  {phoneLabel ? (
                    <div>
                      <FontAwesomeIcon icon={faPhone} />
                      <span>{phoneLabel}</span>
                    </div>
                  ) : null}
                  {emailLabel ? (
                    <div>
                      <FontAwesomeIcon icon={faEnvelope} />
                      <span>{emailLabel}</span>
                    </div>
                  ) : null}
                  {studentLevelLabel ? (
                    <div>
                      <FontAwesomeIcon icon={faStar} />
                      <span>{studentLevelLabel}</span>
                    </div>
                  ) : null}
                  <div>
                    <FontAwesomeIcon icon={faCalendar} />
                    <span>С нами с {memberSinceLabel}</span>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>

      <LessonCancelDialog
        open={Boolean(cancelDialogLesson)}
        lesson={cancelDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setCancelDialogLesson(null)}
        onConfirm={handleConfirmCancel}
      />

      <LessonRestoreDialog
        open={Boolean(restoreDialogLesson)}
        lesson={restoreDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setRestoreDialogLesson(null)}
        onConfirm={handleConfirmRestore}
      />

      <SeriesScopeDialog
        open={Boolean(scopeDialog)}
        title={
          scopeDialog?.type === 'cancel'
            ? resolveScopeDialogCopy(scopeDialog.lesson).title
            : scopeDialog?.type === 'restore'
              ? 'Восстановить урок'
              : undefined
        }
        confirmText={
          scopeDialog?.type === 'cancel'
            ? resolveScopeDialogCopy(scopeDialog.lesson).confirmText
            : 'Восстановить'
        }
        previews={scopeDialog?.previews}
        onClose={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />
    </div>
  );
};
