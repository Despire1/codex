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

export interface Homework {
  id: number;
  text: string;
  deadline?: string;
  isDone: boolean;
  studentId: number;
  teacherId: number;
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
}

export interface LinkedStudent extends Student {
  link: TeacherStudent;
  homeworks: Homework[];
}
