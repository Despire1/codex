import { ru } from 'date-fns/locale';
import { formatInTimeZone, resolveTimeZone } from './timezoneDates';

export type OnboardingReminderTemplate = 'TODAY' | 'IN_1_HOUR' | 'TOMORROW_MORNING';

export const ONBOARDING_REMINDER_TEMPLATES: {
  id: OnboardingReminderTemplate;
  title: string;
  hint: string;
}[] = [
  {
    id: 'TODAY',
    title: 'Сегодня',
    hint: 'Отправим напоминание на сегодня.',
  },
  {
    id: 'IN_1_HOUR',
    title: 'За 1 час',
    hint: 'Коротко напомним за час до занятия.',
  },
  {
    id: 'TOMORROW_MORNING',
    title: 'Завтра утром',
    hint: 'Лёгкое напоминание на завтра.',
  },
];

export const buildOnboardingReminderMessage = (params: {
  template: OnboardingReminderTemplate;
  studentName?: string | null;
  lessonStartAt: Date;
  timeZone?: string | null;
}) => {
  const resolvedTimeZone = resolveTimeZone(params.timeZone ?? undefined);
  const studentName = params.studentName?.trim() || 'ученик';
  const timeLabel = formatInTimeZone(params.lessonStartAt, 'HH:mm', { timeZone: resolvedTimeZone });
  const dateLabel = formatInTimeZone(params.lessonStartAt, 'd MMMM', { locale: ru, timeZone: resolvedTimeZone });

  switch (params.template) {
    case 'IN_1_HOUR':
      return `Привет, ${studentName}! Напоминание: через 1 час занятие (${timeLabel}).`;
    case 'TOMORROW_MORNING':
      return `Привет, ${studentName}! Завтра (${dateLabel}) занятие в ${timeLabel}.`;
    case 'TODAY':
    default:
      return `Привет, ${studentName}! Сегодня в ${timeLabel} занятие.`;
  }
};
