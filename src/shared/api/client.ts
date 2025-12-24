import { Homework, HomeworkAttachment, HomeworkStatus, Lesson, Payment, Student, StudentListItem, Teacher, TeacherStudent } from '../../entities/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const apiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Запрос не выполнен');
  }

  return response.json() as Promise<T>;
};

export const api = {
  bootstrap: () =>
    apiFetch<{
      teacher: Teacher;
      students: Student[];
      links: TeacherStudent[];
      homeworks: Homework[];
      lessons: Lesson[];
    }>('/api/bootstrap'),
  addStudent: (payload: { customName: string; username?: string; pricePerLesson?: number }) =>
    apiFetch<{ student: Student; link: TeacherStudent }>('/api/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleAutoRemind: (studentId: number, value: boolean) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}/auto-remind`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  adjustBalance: (studentId: number, delta: number) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}/balance`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),
  updatePrice: (studentId: number, value: number) =>
    apiFetch<{ student: Student }>(`/api/students/${studentId}/price`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  createLesson: (payload: { studentId?: number; studentIds?: number[]; startAt: string; durationMinutes: number }) =>
    apiFetch<{ lesson: Lesson }>('/api/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  createRecurringLessons: (payload: {
    studentId?: number;
    studentIds?: number[];
    startAt: string;
    durationMinutes: number;
    repeatWeekdays: number[];
    repeatUntil?: string;
  }) => apiFetch<{ lessons: Lesson[] }>('/api/lessons/recurring', { method: 'POST', body: JSON.stringify(payload) }),
  updateLesson: (
    id: number,
    payload: {
      studentId?: number;
      studentIds?: number[];
      startAt: string;
      durationMinutes: number;
      applyToSeries?: boolean;
      detachFromSeries?: boolean;
      repeatWeekdays?: number[];
      repeatUntil?: string;
    },
  ) => apiFetch<{ lesson?: Lesson; lessons?: Lesson[] }>(`/api/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  updateLessonStatus: (id: number, status: Lesson['status']) =>
    apiFetch<{ lesson: Lesson; links?: TeacherStudent[] }>(`/api/lessons/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  deleteLesson: (id: number, payload?: { applyToSeries?: boolean }) =>
    apiFetch<{ deletedIds?: number[] }>(`/api/lessons/${id}`, { method: 'DELETE', body: JSON.stringify(payload ?? {}) }),
  markLessonCompleted: (lessonId: number) =>
    apiFetch<{ lesson: Lesson; link?: TeacherStudent }>(`/api/lessons/${lessonId}/complete`, {
      method: 'POST',
    }),
  togglePaid: (lessonId: number) =>
    apiFetch<{ lesson: Lesson; link?: TeacherStudent }>(`/api/lessons/${lessonId}/toggle-paid`, {
      method: 'POST',
    }),
  toggleParticipantPaid: (lessonId: number, studentId: number) =>
    apiFetch<{ participant: any; lesson: Lesson; link?: TeacherStudent }>(
      `/api/lessons/${lessonId}/participants/${studentId}/toggle-paid`,
      {
        method: 'POST',
      },
    ),
  getPayments: (studentId: number) =>
    apiFetch<{ payments: Payment[] }>(`/api/students/${studentId}/payments`),
  createHomework: (payload: {
    studentId: number;
    text: string;
    deadline?: string;
    status?: HomeworkStatus;
    attachments?: HomeworkAttachment[];
    timeSpentMinutes?: number | null;
  }) =>
    apiFetch<{ homework: Homework }>('/api/homeworks', { method: 'POST', body: JSON.stringify(payload) }),
  toggleHomework: (homeworkId: number) =>
    apiFetch<{ homework: Homework }>(`/api/homeworks/${homeworkId}/toggle`, { method: 'PATCH' }),
  updateHomework: (homeworkId: number, payload: Partial<Homework>) =>
    apiFetch<{ homework: Homework }>(`/api/homeworks/${homeworkId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteHomework: (homeworkId: number) => apiFetch<{ id: number }>(`/api/homeworks/${homeworkId}`, { method: 'DELETE' }),
  sendHomework: (homeworkId: number) =>
    apiFetch<{ status: string; homework: Homework }>(`/api/homeworks/${homeworkId}/send`, { method: 'POST' }),
  remindHomeworkById: (homeworkId: number) =>
    apiFetch<{ status: string; homework: Homework }>(`/api/homeworks/${homeworkId}/remind`, { method: 'POST' }),
  remindHomework: (studentId: number) =>
    apiFetch<{ status: string; studentId: number; teacherId: number }>('/api/reminders/homework', {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    }),
  searchStudents: (params: { query?: string; filter?: 'all' | 'pendingHomework' | 'noReminder' }) => {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.filter) query.set('filter', params.filter);

    const suffix = query.toString();
    const path = suffix ? `/api/students/search?${suffix}` : '/api/students/search';

    return apiFetch<{ students: Student[]; links: TeacherStudent[]; homeworks: Homework[] }>(path);
  },
  listStudents: (params: { query?: string; filter?: 'all' | 'debt' | 'overdue'; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.filter) query.set('filter', params.filter);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const suffix = query.toString();
    const path = suffix ? `/api/students?${suffix}` : '/api/students';

    return apiFetch<{
      items: StudentListItem[];
      total: number;
      nextOffset: number | null;
      counts: { withDebt: number; overdue: number };
    }>(path);
  },
  listStudentHomeworks: (
    studentId: number,
    params: { filter?: 'all' | HomeworkStatus | 'overdue'; limit?: number; offset?: number },
  ) => {
    const query = new URLSearchParams();
    if (params.filter) query.set('filter', params.filter);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const suffix = query.toString();
    const path = suffix ? `/api/students/${studentId}/homeworks?${suffix}` : `/api/students/${studentId}/homeworks`;

    return apiFetch<{ items: Homework[]; total: number; nextOffset: number | null }>(path);
  },
};

export type ApiClient = typeof api;
