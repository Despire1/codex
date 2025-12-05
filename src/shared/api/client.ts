import { Homework, Lesson, Student, Teacher, TeacherStudent } from '../../entities/types';

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
  createLesson: (payload: { studentId: number; startAt: string; durationMinutes: number }) =>
    apiFetch<{ lesson: Lesson }>('/api/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  createRecurringLessons: (payload: {
    studentId: number;
    startAt: string;
    durationMinutes: number;
    repeatWeekdays: number[];
    repeatUntil?: string;
  }) => apiFetch<{ lessons: Lesson[] }>('/api/lessons/recurring', { method: 'POST', body: JSON.stringify(payload) }),
  updateLesson: (id: number, payload: { studentId: number; startAt: string; durationMinutes: number }) =>
    apiFetch<{ lesson: Lesson }>(`/api/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  markLessonCompleted: (lessonId: number) =>
    apiFetch<{ lesson: Lesson; link?: TeacherStudent }>(`/api/lessons/${lessonId}/complete`, {
      method: 'POST',
    }),
  togglePaid: (lessonId: number) =>
    apiFetch<{ lesson: Lesson }>(`/api/lessons/${lessonId}/toggle-paid`, { method: 'POST' }),
  createHomework: (payload: { studentId: number; text: string; deadline?: string }) =>
    apiFetch<{ homework: Homework }>('/api/homeworks', { method: 'POST', body: JSON.stringify(payload) }),
  toggleHomework: (homeworkId: number) =>
    apiFetch<{ homework: Homework }>(`/api/homeworks/${homeworkId}/toggle`, { method: 'PATCH' }),
  remindHomework: (studentId: number) =>
    apiFetch<{ status: string; studentId: number; teacherId: number }>('/api/reminders/homework', {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    }),
};

export type ApiClient = typeof api;
