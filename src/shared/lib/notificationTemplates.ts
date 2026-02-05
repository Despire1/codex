export const DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE =
  'Здравствуйте, {{student_name}}! Напоминаю: занятие {{lesson_date}} в {{lesson_time}}. До встречи 🙂';

export const DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE =
  'Здравствуйте, {{student_name}}! Напоминание об оплате занятия {{lesson_date}} ({{lesson_time}}). Сумма: {{lesson_price}} ₽. Спасибо 🙂';

export const STUDENT_TEMPLATE_MAX_LENGTH = 1000;

export const STUDENT_LESSON_TEMPLATE_VARIABLES = [
  'student_name',
  'lesson_date',
  'lesson_time',
  'lesson_datetime',
  'lesson_link',
] as const;

export const STUDENT_PAYMENT_TEMPLATE_VARIABLES = [
  'student_name',
  'lesson_date',
  'lesson_time',
  'lesson_datetime',
  'lesson_price',
] as const;

export type StudentLessonTemplateVariable = (typeof STUDENT_LESSON_TEMPLATE_VARIABLES)[number];
export type StudentPaymentTemplateVariable = (typeof STUDENT_PAYMENT_TEMPLATE_VARIABLES)[number];

export type TemplateExampleKey = 'A' | 'B';

export const STUDENT_LESSON_TEMPLATE_EXAMPLES: Record<TemplateExampleKey, Record<string, string>> = {
  A: {
    student_name: 'Ирина',
    lesson_date: '5 сентября',
    lesson_time: '18:00',
    lesson_datetime: '5 сентября 18:00',
    lesson_link: 'https://meet.google.com/abc-defg-hij',
  },
  B: {
    student_name: 'Мария',
    lesson_date: '12 октября',
    lesson_time: '09:30',
    lesson_datetime: '12 октября 09:30',
    lesson_link: 'https://meet.google.com/xyz-uvwx-rst',
  },
};

export const STUDENT_PAYMENT_TEMPLATE_EXAMPLES: Record<TemplateExampleKey, Record<string, string>> = {
  A: {
    student_name: 'Илья',
    lesson_date: '7 сентября',
    lesson_time: '16:00',
    lesson_datetime: '7 сентября 16:00',
    lesson_price: '1500',
  },
  B: {
    student_name: 'София',
    lesson_date: '11 сентября',
    lesson_time: '10:00',
    lesson_datetime: '11 сентября 10:00',
    lesson_price: '900',
  },
};
