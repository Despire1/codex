declare module '@prisma/client' {
  export type PrismaPromise<T> = Promise<T>;

  export type Teacher = {
    chatId: bigint;
    username: string | null;
    name: string | null;
    timezone: string | null;
    defaultLessonDuration: number;
    reminderMinutesBefore: number;
    lessonReminderEnabled: boolean;
    lessonReminderMinutes: number;
    unpaidReminderEnabled: boolean;
    unpaidReminderFrequency: string;
    unpaidReminderTime: string;
    studentNotificationsEnabled: boolean;
    studentPaymentRemindersEnabled: boolean;
    payments: Payment[];
    createdAt: Date;
  };

  export type Student = {
    id: number;
    username: string | null;
    telegramId: bigint | null;
    isActivated: boolean;
    activatedAt: Date | null;
    pricePerLesson: number;
    payments: Payment[];
    paymentEvents: PaymentEvent[];
    createdAt: Date;
  };

  export type TeacherStudent = {
    id: number;
    teacherId: bigint;
    studentId: number;
    customName: string;
    autoRemindHomework: boolean;
    balanceLessons: number;
    pricePerLesson: number;
    isArchived: boolean;
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
    paidAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  };

  export type Payment = {
    id: number;
    teacherStudentId: number;
    lessonId: number | null;
    amount: number;
    paidAt: Date;
    comment: string | null;
  };

  export type PaymentEvent = {
    id: number;
    studentId: number;
    teacherId: bigint | null;
    lessonId: number | null;
    type: string;
    lessonsDelta: number;
    priceSnapshot: number;
    moneyAmount: number | null;
    createdAt: Date;
    createdBy: string;
    reason: string | null;
  };

  export type User = {
    id: number;
    telegramUserId: bigint;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    lastAuthDate: number | null;
    role: string;
    subscriptionStartAt: Date | null;
    subscriptionEndAt: Date | null;
    onboardingTeacherCompleted: boolean;
    onboardingStudentCompleted: boolean;
    onboardingTeacherStartedAt: Date | null;
    onboardingStudentStartedAt: Date | null;
    lastOnboardingNudgeAt: Date | null;
    termsAccepted: boolean;
    termsAcceptedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type NotificationLog = {
    id: number;
    teacherId: bigint;
    studentId: number | null;
    lessonId: number | null;
    type: string;
    scheduledFor: Date | null;
    sentAt: Date | null;
    status: string;
    errorText: string | null;
    dedupeKey: string | null;
    createdAt: Date;
  };

  export type Session = {
    id: number;
    userId: number;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    ip: string | null;
    userAgent: string | null;
  };

  export type TransferToken = {
    id: number;
    userId: number;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
    createdIp: string | null;
    createdUserAgent: string | null;
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
      createMany(args: any): PrismaPromise<any>;
      delete(args: any): PrismaPromise<Payment>;
      deleteMany(args: any): PrismaPromise<any>;
    };
    paymentEvent: {
      findUnique(args: any): PrismaPromise<PaymentEvent | null>;
      findMany(args?: any): PrismaPromise<PaymentEvent[]>;
      findFirst(args: any): PrismaPromise<PaymentEvent | null>;
      create(args: any): PrismaPromise<PaymentEvent>;
      createMany(args: any): PrismaPromise<any>;
    };
    user: {
      upsert(args: any): PrismaPromise<User>;
      update(args: any): PrismaPromise<User>;
      findFirst(args: any): PrismaPromise<User | null>;
    };
    session: {
      create(args: any): PrismaPromise<Session>;
      findFirst(args: any): PrismaPromise<Session | null>;
      updateMany(args: any): PrismaPromise<any>;
    };
    transferToken: {
      create(args: any): PrismaPromise<TransferToken>;
      findFirst(args: any): PrismaPromise<TransferToken | null>;
      updateMany(args: any): PrismaPromise<any>;
    };
    $transaction<T>(promises: PrismaPromise<T>[]): PrismaPromise<T[]>;
  }
}
