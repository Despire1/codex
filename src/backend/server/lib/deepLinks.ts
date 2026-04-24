export type DeepLinkTarget = {
  path: string;
  label: string;
  fullUrl: string;
};

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

const resolveAppBaseUrl = () => {
  const telegramWebApp = process.env.TELEGRAM_WEBAPP_URL ?? '';
  const appBase = process.env.APP_BASE_URL ?? '';
  const resolved = telegramWebApp || appBase;
  return resolved ? normalizeBaseUrl(resolved) : '';
};

const buildTarget = (path: string, label: string): DeepLinkTarget | null => {
  const base = resolveAppBaseUrl();
  if (!base) return null;
  return { path, label, fullUrl: `${base}${path}` };
};

export const buildLessonDeepLink = (lessonId: number): DeepLinkTarget | null =>
  buildTarget(`/schedule?lessonId=${lessonId}`, 'Открыть урок');

export const buildScheduleDeepLink = (): DeepLinkTarget | null =>
  buildTarget('/schedule', 'Открыть расписание');

export const buildHomeworkAssignmentDeepLink = (assignmentId: number): DeepLinkTarget | null =>
  buildTarget(`/homeworks?assignmentId=${assignmentId}`, 'Открыть домашку');

export const buildStudentProfileDeepLink = (studentId: number): DeepLinkTarget | null =>
  buildTarget(`/students/${studentId}`, 'Открыть профиль ученика');

export const buildDashboardDeepLink = (): DeepLinkTarget | null =>
  buildTarget('/dashboard', 'Открыть приложение');
