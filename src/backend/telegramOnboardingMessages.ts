type CallTelegram = <T>(method: string, payload?: Record<string, unknown>) => Promise<T>;

type EditMessage = (chatId: number, messageId: number, text: string, replyMarkup?: Record<string, unknown>) => Promise<void>;

type OnboardingMessageId = number | undefined;

const sendOrEdit = async (
  callTelegram: CallTelegram,
  editMessage: EditMessage,
  payload: { chatId: number; messageId?: OnboardingMessageId; text: string; replyMarkup?: Record<string, unknown> },
) => {
  if (payload.messageId) {
    await editMessage(payload.chatId, payload.messageId, payload.text, payload.replyMarkup);
    return;
  }
  await callTelegram('sendMessage', {
    chat_id: payload.chatId,
    text: payload.text,
    reply_markup: payload.replyMarkup,
  });
};

export const createOnboardingMessages = (deps: {
  callTelegram: CallTelegram;
  editMessage: EditMessage;
  webAppUrl: string;
}) => {
  const { callTelegram, editMessage, webAppUrl } = deps;

  const sendTeacherIntro = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Привет! Ты в TeacherBot.\n' +
      'Я помогаю репетиторам не держать в голове занятия и оплаты: всё видно в одном месте, плюс напоминания в Telegram.';
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Что умею', callback_data: 'onboarding_teacher_features' },
          { text: 'Начать за 1 минуту', callback_data: 'onboarding_teacher_quickstart' },
        ],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherFeatures = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Коротко, что здесь есть:\n' +
      '• Занятия: чтобы не забывать расписание\n' +
      '• Оплаты: видно, где не оплачено\n' +
      '• Напоминания: себе и ученикам (после активации ученика)\n' +
      'Хочешь — покажу быстрый старт.';
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Начать за 1 минуту', callback_data: 'onboarding_teacher_quickstart' },
          { text: 'Пропустить', callback_data: 'onboarding_teacher_skip' },
        ],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherStep1 = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text = 'Шаг 1 из 3: добавь первого ученика в приложении.\nНужен только Telegram username ученика.';
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Открыть приложение', web_app: { url: webAppUrl } },
          { text: 'Дальше', callback_data: 'onboarding_teacher_step2' },
        ],
        [{ text: 'Как узнать username?', callback_data: 'onboarding_teacher_username_help' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherUsernameHint = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Открой профиль ученика в Telegram → “Имя пользователя”.\n' +
      'Если его нет — ученик может добавить username в настройках Telegram.';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: webAppUrl } }],
        [{ text: 'Дальше', callback_data: 'onboarding_teacher_step2' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherStep2 = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text = 'Шаг 2 из 3: добавь первое занятие.\nТак ты сразу увидишь ближайшие уроки и напоминания.';
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Открыть приложение', web_app: { url: webAppUrl } },
          { text: 'Дальше', callback_data: 'onboarding_teacher_step3' },
        ],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherStep3 = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Шаг 3 из 3 (по желанию): настрой напоминания.\n' +
      'Я могу напоминать:\n' +
      '• тебе — о ближайших уроках\n' +
      '• тебе — о неоплаченных занятиях\n' +
      '• ученику — об оплате (после того, как он нажмёт /start)';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: webAppUrl } }],
        [{ text: 'Готово', callback_data: 'onboarding_teacher_finish' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherFinal = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Готово. Логика простая:\n' +
      '1. добавляешь ученика\n' +
      '2. добавляешь занятия\n' +
      '3. отмечаешь оплаты\n' +
      'Я напомню, если что-то забывается.';
    const replyMarkup = {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: webAppUrl } }]],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendStudentIntro = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Привет! Ты ученик.\n' +
      'Я буду присылать напоминания о занятиях и об оплате, если преподаватель это включил.\n' +
      'Чтобы всё заработало, просто активируй профиль.';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Активировать', callback_data: 'onboarding_student_activate' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_student_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  return {
    sendTeacherIntro,
    sendTeacherFeatures,
    sendTeacherStep1,
    sendTeacherUsernameHint,
    sendTeacherStep2,
    sendTeacherStep3,
    sendTeacherFinal,
    sendStudentIntro,
  };
};
