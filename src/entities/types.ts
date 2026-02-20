export type LessonStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
export type LessonColor = 'blue' | 'peach' | 'rose' | 'mint' | 'sand' | 'lavender';
export interface Teacher {
  chatId: number;
  name?: string;
  username?: string;
  receiptEmail?: string | null;
  timezone: string | null;
  defaultLessonDuration: number;
  reminderMinutesBefore: number;
  lessonReminderEnabled: boolean;
  lessonReminderMinutes: number;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  tomorrowSummaryEnabled: boolean;
  tomorrowSummaryTime: string;
  studentNotificationsEnabled: boolean;
  studentUpcomingLessonTemplate: string | null;
  studentPaymentDueTemplate: string | null;
  studentPaymentRemindersEnabled: boolean;
  autoConfirmLessons: boolean;
  globalPaymentRemindersEnabled: boolean;
  paymentReminderDelayHours: number;
  paymentReminderRepeatHours: number;
  paymentReminderMaxCount: number;
  notifyTeacherOnAutoPaymentReminder: boolean;
  notifyTeacherOnManualPaymentReminder: boolean;
  homeworkNotifyOnAssign: boolean;
  homeworkReminder24hEnabled: boolean;
  homeworkReminderMorningEnabled: boolean;
  homeworkReminderMorningTime: string;
  homeworkReminder3hEnabled: boolean;
  homeworkOverdueRemindersEnabled: boolean;
  homeworkOverdueReminderTime: string;
  homeworkOverdueReminderMaxCount: number;
}

export interface Student {
  id: number;
  username?: string;
  telegramId?: number;
  timezone?: string | null;
  pricePerLesson?: number;
  isActivated?: boolean;
  activatedAt?: string | null;
  paymentRemindersEnabled?: boolean;
}

export interface TeacherStudent {
  id: number;
  teacherId: number;
  studentId: number;
  customName: string;
  autoRemindHomework: boolean;
  balanceLessons: number;
  pricePerLesson: number;
  isArchived?: boolean;
}

export type HomeworkStatus = 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE';

export interface HomeworkAttachment {
  id: string;
  url: string;
  fileName: string;
  size: number;
  status?: 'ready' | 'uploading' | 'error';
}

export interface Homework {
  id: number;
  text: string;
  deadline: string | null;
  deadlineAt?: string | null;
  status: HomeworkStatus;
  isDone: boolean;
  studentId: number;
  teacherId: number;
  createdAt: string;
  updatedAt: string;
  lastReminderAt?: string | null;
  completedAt?: string | null;
  attachments?: HomeworkAttachment[];
  takenAt?: string | null;
  takenByStudentId?: number | null;
  timeSpentMinutes?: number | null;
}

export type HomeworkTemplateBlockType = 'TEXT' | 'MEDIA' | 'TEST' | 'STUDENT_RESPONSE';

export type HomeworkTestQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'MATCHING';

export type HomeworkTestQuestionKind =
  | 'CHOICE'
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'AUDIO'
  | 'FILE'
  | 'FILL_WORD'
  | 'MATCHING'
  | 'ORDERING'
  | 'TABLE';

export interface HomeworkTestOption {
  id: string;
  text: string;
}

export interface HomeworkTestMatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface HomeworkTestTableRow {
  id: string;
  lead: string;
  answers: string[];
}

export interface HomeworkTestTableConfig {
  leadHeader: string;
  answerHeaders: string[];
  rows: HomeworkTestTableRow[];
  partialCredit?: boolean | null;
}

export interface HomeworkTestQuestion {
  id: string;
  type: HomeworkTestQuestionType;
  uiQuestionKind?: HomeworkTestQuestionKind;
  uiRequired?: boolean;
  prompt: string;
  options?: HomeworkTestOption[];
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  matchingPairs?: HomeworkTestMatchingPair[];
  fillInTheBlankText?: string;
  orderingItems?: HomeworkTestOption[];
  table?: HomeworkTestTableConfig | null;
  caseSensitive?: boolean;
  allowPartialCredit?: boolean;
  shuffleOptions?: boolean;
  explanation?: string | null;
  points?: number | null;
}

export interface HomeworkBlockText {
  id: string;
  type: 'TEXT';
  content: string;
}

export interface HomeworkBlockMedia {
  id: string;
  type: 'MEDIA';
  attachments: HomeworkAttachment[];
}

export interface HomeworkBlockTest {
  id: string;
  type: 'TEST';
  title?: string | null;
  questions: HomeworkTestQuestion[];
}

export interface HomeworkBlockStudentResponse {
  id: string;
  type: 'STUDENT_RESPONSE';
  allowText: boolean;
  allowFiles: boolean;
  allowPhotos: boolean;
  allowDocuments: boolean;
  allowAudio: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
}

export type HomeworkBlock =
  | HomeworkBlockText
  | HomeworkBlockMedia
  | HomeworkBlockTest
  | HomeworkBlockStudentResponse;

export interface HomeworkTemplate {
  id: number;
  teacherId: number;
  createdByTeacherId?: number | null;
  title: string;
  tags: string[];
  subject?: string | null;
  level?: string | null;
  blocks: HomeworkBlock[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HomeworkAssignmentStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'RETURNED'
  | 'REVIEWED'
  | 'OVERDUE';

export type HomeworkSendMode = 'AUTO_AFTER_LESSON_DONE' | 'MANUAL';
export type HomeworkAssignmentProblemFlag = 'OVERDUE' | 'RETURNED' | 'CONFIG_ERROR' | 'SUBMITTED' | 'IN_REVIEW';

export interface HomeworkScore {
  autoScore?: number | null;
  manualScore?: number | null;
  finalScore?: number | null;
}

export interface HomeworkAssignment {
  id: number;
  teacherId: number;
  studentId: number;
  studentName?: string | null;
  studentUsername?: string | null;
  lessonId?: number | null;
  lessonStartAt?: string | null;
  templateId?: number | null;
  templateTitle?: string | null;
  legacyHomeworkId?: number | null;
  title: string;
  status: HomeworkAssignmentStatus;
  isOverdue?: boolean;
  hasConfigError?: boolean;
  problemFlags?: HomeworkAssignmentProblemFlag[];
  sendMode: HomeworkSendMode;
  deadlineAt?: string | null;
  sentAt?: string | null;
  contentSnapshot: HomeworkBlock[];
  teacherComment?: string | null;
  reviewedAt?: string | null;
  reminder24hSentAt?: string | null;
  reminderMorningSentAt?: string | null;
  reminder3hSentAt?: string | null;
  overdueReminderCount: number;
  lastOverdueReminderAt?: string | null;
  createdAt: string;
  updatedAt: string;
  latestSubmissionAttemptNo?: number | null;
  latestSubmissionStatus?: HomeworkSubmissionStatus | null;
  latestSubmissionSubmittedAt?: string | null;
  score: HomeworkScore;
}

export type HomeworkSubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';

export interface HomeworkReviewDraft {
  submissionId: number;
  scoresById: Record<string, number>;
  commentsById: Record<string, string>;
  generalComment: string;
}

export interface HomeworkSubmission {
  id: number;
  assignmentId: number;
  studentId: number;
  reviewerTeacherId?: number | null;
  attemptNo: number;
  status: HomeworkSubmissionStatus;
  answerText?: string | null;
  attachments: HomeworkAttachment[];
  voice: HomeworkAttachment[];
  testAnswers?: Record<string, unknown> | null;
  teacherComment?: string | null;
  reviewDraft?: HomeworkReviewDraft | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  score: HomeworkScore;
}

export interface LessonParticipant {
  id: number;
  lessonId: number;
  studentId: number;
  price: number;
  isPaid: boolean;
  attended?: boolean | null;
  student?: Student;
}

export interface Lesson {
  id: number;
  teacherId: number;
  studentId: number;
  price?: number;
  startAt: string; // ISO string
  durationMinutes: number;
  status: LessonStatus;
  isPaid: boolean;
  paidAt?: string | null;
  completedAt?: string | null;
  paymentStatus?: 'UNPAID' | 'PAID';
  paidSource?: 'NONE' | 'BALANCE' | 'MANUAL';
  lastPaymentReminderAt?: string | null;
  paymentReminderCount?: number;
  lastPaymentReminderSource?: 'AUTO' | 'MANUAL' | null;
  color?: LessonColor;
  meetingLink?: string | null;
  isRecurring?: boolean;
  recurrenceUntil?: string | null;
  recurrenceGroupId?: string | null;
  recurrenceWeekdays?: number[] | null;
  participants?: LessonParticipant[];
}

export interface StudentDebtItem {
  id: number;
  startAt: string;
  price: number | null;
  status: LessonStatus;
  lastPaymentReminderAt?: string | null;
}

export interface UnpaidLessonEntry {
  lessonId: number;
  startAt: string;
  completedAt: string | null;
  lastPaymentReminderAt: string | null;
  paymentReminderCount: number;
  studentId: number;
  studentName: string;
  price: number;
  isActivated: boolean;
  paymentRemindersEnabled: boolean;
}

export type PaymentReminderSource = 'AUTO' | 'MANUAL';
export type PaymentReminderStatus = 'SENT' | 'FAILED';

export interface PaymentReminderLog {
  id: number;
  lessonId: number;
  createdAt: string;
  status: PaymentReminderStatus;
  source: PaymentReminderSource;
}

export interface StudentDebtSummary {
  total: number;
  items: StudentDebtItem[];
}

export type LessonPaymentFilter = 'all' | 'paid' | 'unpaid';
export type LessonStatusFilter = 'all' | 'completed' | 'not_completed';
export type LessonSortOrder = 'asc' | 'desc';

export interface LessonDateRange {
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
}

export type PaymentEventType = 'TOP_UP' | 'AUTO_CHARGE' | 'MANUAL_PAID' | 'ADJUSTMENT' | 'SUBSCRIPTION' | 'OTHER';
export type PaymentEventCreatedBy = 'TEACHER' | 'SYSTEM';
export type PaymentCancelBehavior = 'refund' | 'writeoff';

export interface PaymentEvent {
  id: number;
  studentId: number;
  teacherId?: number | null;
  lessonId?: number | null;
  type: PaymentEventType;
  lessonsDelta: number;
  priceSnapshot: number;
  moneyAmount?: number | null;
  createdAt: string;
  createdBy: PaymentEventCreatedBy;
  reason?: string | null;
  comment?: string | null;
  lesson?: Lesson | null;
}

export interface LinkedStudent extends Student {
  link: TeacherStudent;
  homeworks: Homework[];
}

export interface StudentListItem {
  student: Student;
  link: TeacherStudent;
  debtRub?: number | null;
  debtLessonCount?: number | null;
  paymentRemindersCount?: number | null;
  stats: {
    pendingHomeworkCount: number;
    overdueHomeworkCount: number;
    totalHomeworkCount: number;
  };
}

export type ActivityCategory = 'LESSON' | 'STUDENT' | 'HOMEWORK' | 'SETTINGS' | 'PAYMENT' | 'NOTIFICATION';
export type ActivityStatus = 'SUCCESS' | 'FAILED';
export type ActivitySource = 'USER' | 'SYSTEM' | 'AUTO' | 'LEGACY';
export type ActivityRecordSource = 'ACTIVITY_EVENT' | 'PAYMENT_EVENT' | 'NOTIFICATION_LOG';

export interface ActivityFeedItem {
  id: string;
  sourceRecord: ActivityRecordSource;
  category: ActivityCategory;
  action: string;
  status: ActivityStatus;
  source: ActivitySource;
  title: string;
  details?: string | null;
  occurredAt: string;
  studentId?: number | null;
  studentName?: string | null;
  lessonId?: number | null;
  homeworkId?: number | null;
  payload?: Record<string, unknown> | null;
}

export interface ActivityFeedListResponse {
  items: ActivityFeedItem[];
  nextCursor: string | null;
}

export interface ActivityFeedUnreadStatus {
  hasUnread: boolean;
  latestOccurredAt: string | null;
  seenAt: string | null;
}
