import { addMinutes, format, getDay, startOfWeek } from 'date-fns';
import ru from 'date-fns/locale/ru';
import type { LessonFormat } from '../../../entities/types';

export const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
export const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
export const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const WEEKDAYS_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

export const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const formatTime = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

export const formatTimeRange = (startAt: Date, durationMinutes: number) => {
  const end = addMinutes(startAt, durationMinutes);
  return `${formatTime(startAt)} – ${formatTime(end)}`;
};

export const formatPeriodMonth = (anchor: Date) => `${MONTHS_NOMINATIVE[anchor.getMonth()]} ${anchor.getFullYear()}`;

export const formatPeriodWeek = (anchor: Date) => {
  const ws = startOfWeek(anchor, { weekStartsOn: 1 });
  const we = addMinutes(ws, 6 * 24 * 60);
  const sameMonth = ws.getMonth() === we.getMonth();
  if (sameMonth) {
    return `${ws.getDate()} – ${we.getDate()} ${MONTHS_GENITIVE[we.getMonth()]}, ${we.getFullYear()}`;
  }
  return `${ws.getDate()} ${MONTHS_GENITIVE[ws.getMonth()]} – ${we.getDate()} ${MONTHS_GENITIVE[we.getMonth()]}, ${we.getFullYear()}`;
};

export const formatPeriodDay = (anchor: Date) =>
  `${WEEKDAYS_FULL[getDay(anchor)]}, ${anchor.getDate()} ${MONTHS_GENITIVE[anchor.getMonth()]}`;

export const formatDayLabel = (date: Date) =>
  `${WEEKDAYS_FULL[getDay(date)]}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;

export const formatPriceRub = (price: number) => `${price.toLocaleString('ru-RU')} ₽`;

export const FORMAT_LABEL: Record<LessonFormat, string> = {
  ONLINE_ZOOM: 'Онлайн · Zoom',
  ONLINE_SKYPE: 'Онлайн · Skype',
  ONLINE_MEET: 'Онлайн · Google Meet',
  IN_PERSON_STUDENT: 'Очно · у ученика',
  IN_PERSON_OFFICE: 'Очно · в кабинете',
  OTHER: 'Другое',
};

export const FORMAT_OPTIONS: { value: LessonFormat; label: string }[] = [
  { value: 'ONLINE_ZOOM', label: FORMAT_LABEL.ONLINE_ZOOM },
  { value: 'ONLINE_SKYPE', label: FORMAT_LABEL.ONLINE_SKYPE },
  { value: 'ONLINE_MEET', label: FORMAT_LABEL.ONLINE_MEET },
  { value: 'IN_PERSON_STUDENT', label: FORMAT_LABEL.IN_PERSON_STUDENT },
  { value: 'IN_PERSON_OFFICE', label: FORMAT_LABEL.IN_PERSON_OFFICE },
];

export const formatLessonFormat = (formatValue: string | null | undefined, meetingLink?: string | null) => {
  if (formatValue && formatValue in FORMAT_LABEL) {
    return FORMAT_LABEL[formatValue as LessonFormat];
  }
  if (meetingLink) {
    return 'Онлайн';
  }
  return '—';
};

export const ru_locale = ru;
