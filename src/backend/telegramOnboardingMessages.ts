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
      'Рады познакомиться 🙂\n' +
      'TeacherBot — это спокойный помощник для репетиторов.\n\n' +
      'Я помогаю:\n' +
      '• помнить, когда и у кого занятия\n' +
      '• видеть, какие уроки оплачены, а какие — нет\n' +
      '• вовремя напоминать, чтобы ничего не упускать\n\n' +
      'Давайте покажу, как всё устроено. Это займёт буквально минуту.';
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Что я умею', callback_data: 'onboarding_teacher_features' },
          { text: 'Начать за 1 минуту', callback_data: 'onboarding_teacher_quickstart' },
        ],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherFeatures = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Коротко о возможностях:\n\n' +
      '📅 Занятия\n' +
      '— всегда видно ближайшие уроки\n\n' +
      '💰 Оплаты\n' +
      '— сразу понятно, где есть неоплаченные занятия\n\n' +
      '🔔 Напоминания\n' +
      '— для Вас и для учеников (после того, как ученик нажмёт /start)\n\n' +
      'Если хотите, проведу быстрый старт — без лишних шагов.';
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
    const text =
      '👤 Начнём с ученика\n' +
      'Шаг 1 из 3.\n\n' +
      'Добавьте первого ученика — с этого момента сервис начинает быть полезным.\n\n' +
      'Нужен только Telegram username ученика.\n' +
      'Без анкет, номеров и лишних данных 👍';
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
      'ℹ️ Где посмотреть username?\n\n' +
      'Откройте профиль ученика в Telegram → пункт «Имя пользователя».\n\n' +
      'Если username нет — ученик может добавить его в настройках Telegram.\n' +
      'Это занимает меньше минуты.';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: webAppUrl } }],
        [{ text: 'Дальше', callback_data: 'onboarding_teacher_step2' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, messageId, text, replyMarkup });
  };

  const sendTeacherStep2 = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      '📅 Теперь добавим занятие\n' +
      'Шаг 2 из 3.\n\n' +
      'После этого Вы сразу увидите:\n' +
      '• ближайшие уроки\n' +
      '• когда и с кем занятия\n' +
      '• что будет дальше по расписанию\n\n' +
      'И главное — больше не нужно помнить всё самому 🙂';
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
      '🔔 Последний шаг — напоминания\n' +
      'Шаг 3 из 3 (по желанию).\n\n' +
      'Я аккуратно напомню о важном:\n' +
      '• Вам — о предстоящих занятиях\n' +
      '• ученику — о занятиях и об оплате\n' +
      '  (после того, как он нажмёт /start)\n\n' +
      'Так и Вы, и ученик будете на одной волне,\n' +
      'а важное не потеряется.';
    const replyMarkup = {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: webAppUrl } }],
        [{ text: 'Готово', callback_data: 'onboarding_teacher_finish' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    };
    await sendOrEdit(callTelegram, editMessage, { chatId, text, replyMarkup });
  };

  const sendTeacherFinal = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      'Готово 👍\n' +
      'Теперь TeacherBot будет рядом.\n\n' +
      'Простая логика:\n' +
      '1️⃣ добавляете учеников\n' +
      '2️⃣ добавляете занятия\n' +
      '3️⃣ отмечаете оплаты\n\n' +
      'Если что-то забывается — я напомню 🙂';
    const replyMarkup = {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: webAppUrl } }]],
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
  };
};
