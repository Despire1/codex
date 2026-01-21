export const DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE =
  'Здравствуйте, {{student_name}}! Напоминаю: занятие {{lesson_date}} в {{lesson_time}}. До встречи 🙂';

export const DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE =
  'Здравствуйте, {{student_name}}! Напоминание об оплате занятия {{lesson_date}} ({{lesson_time}}). Сумма: {{lesson_price}} ₽. Спасибо 🙂';

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
  'lesson_link',
] as const;

export type StudentLessonTemplateVariable = (typeof STUDENT_LESSON_TEMPLATE_VARIABLES)[number];
export type StudentPaymentTemplateVariable = (typeof STUDENT_PAYMENT_TEMPLATE_VARIABLES)[number];
