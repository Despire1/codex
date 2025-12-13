declare module '@prisma/client' {
  export type PrismaPromise<T> = Promise<T>;

  export type Teacher = {
    chatId: bigint;
    username: string | null;
    name: string | null;
    defaultLessonDuration: number;
    reminderMinutesBefore: number;
    payments: Payment[];
    createdAt: Date;
  };

  export type Student = {
    id: number;
    username: string | null;
    telegramId: bigint | null;
    pricePerLesson: number;
    payments: Payment[];
    createdAt: Date;
  };

  export type TeacherStudent = {
    id: number;
    teacherId: bigint;
    studentId: number;
    customName: string;
    autoRemindHomework: boolean;
    balanceLessons: number;
  };

  export type Homework = {
    id: number;
    text: string;
    deadline: Date | null;
    status: string;
    isDone: boolean;
    attachments: string;
    timeSpentMinutes: number | null;
    completedAt: Date | null;
    takenAt: Date | null;
    takenByStudentId: number | null;
    studentId: number;
    teacherId: bigint;
    createdAt: Date;
    updatedAt: Date;
    lastReminderAt: Date | null;
  };

  export type Lesson = {
    id: number;
    teacherId: bigint;
    studentId: number;
    startAt: Date;
    durationMinutes: number;
    status: string;
    price: number;
    isPaid: boolean;
    createdAt: Date;
  };

  export type Payment = {
    id: number;
    lessonId: number;
    studentId: number;
    amount: number;
    paidAt: Date;
    teacherId: bigint;
    comment: string | null;
  };

  export class PrismaClient {
    constructor(options?: any);
    teacher: {
      upsert(args: any): PrismaPromise<Teacher>;
      findUnique(args: any): PrismaPromise<Teacher | null>;
      findMany(args?: any): PrismaPromise<Teacher[]>;
    };
    student: {
      findUnique(args: any): PrismaPromise<Student | null>;
      findMany(args?: any): PrismaPromise<Student[]>;
      create(args: any): PrismaPromise<Student>;
      update(args: any): PrismaPromise<Student>;
    };
    teacherStudent: {
      findUnique(args: any): PrismaPromise<TeacherStudent | null>;
      findMany(args?: any): PrismaPromise<TeacherStudent[]>;
      create(args: any): PrismaPromise<TeacherStudent>;
      update(args: any): PrismaPromise<TeacherStudent>;
    };
    homework: {
      findUnique(args: any): PrismaPromise<Homework | null>;
      findMany(args?: any): PrismaPromise<Homework[]>;
      create(args: any): PrismaPromise<Homework>;
      update(args: any): PrismaPromise<Homework>;
    };
    lesson: {
      findUnique(args: any): PrismaPromise<Lesson | null>;
      findMany(args?: any): PrismaPromise<Lesson[]>;
      create(args: any): PrismaPromise<Lesson>;
      update(args: any): PrismaPromise<Lesson>;
    };
    payment: {
      findUnique(args: any): PrismaPromise<Payment | null>;
      findMany(args?: any): PrismaPromise<Payment[]>;
      create(args: any): PrismaPromise<Payment>;
      delete(args: any): PrismaPromise<Payment>;
      deleteMany(args: any): PrismaPromise<any>;
    };
    $transaction<T>(promises: PrismaPromise<T>[]): PrismaPromise<T[]>;
  }
}
