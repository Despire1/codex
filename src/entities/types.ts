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

export type HomeworkStatus = 'DRAFT' | 'IN_PROGRESS' | 'SENT' | 'DONE';

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
  attachments?: HomeworkAttachment[];
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

export interface LinkedStudent extends Student {
  link: TeacherStudent;
  homeworks: Homework[];
}
