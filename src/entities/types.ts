export type LessonStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELED';

export interface Teacher {
  chatId: number;
  name?: string;
  username?: string;
  defaultLessonDuration: number;
  reminderMinutesBefore: number;
}

export interface Student {
  id: number;
  username?: string;
  telegramId?: number;
  pricePerLesson?: number;
}

export interface TeacherStudent {
  id: number;
  teacherId: number;
  studentId: number;
  customName: string;
  autoRemindHomework: boolean;
  balanceLessons: number;
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
  isRecurring?: boolean;
  recurrenceUntil?: string | null;
  recurrenceGroupId?: string | null;
  recurrenceWeekdays?: number[] | null;
  participants?: LessonParticipant[];
}

export interface Payment {
  id: number;
  teacherStudentId: number;
  lessonId?: number | null;
  amount: number;
  paidAt: string;
  comment?: string | null;
  lesson?: Lesson | null;
}

export interface LinkedStudent extends Student {
  link: TeacherStudent;
  homeworks: Homework[];
}
