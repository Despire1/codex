type CallTelegram = <T>(method: string, payload?: Record<string, unknown>) => Promise<T>;

type EditMessage = (
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: 'HTML' | 'MarkdownV2',
) => Promise<void>;

type OnboardingMessageId = number | undefined;

const sendOrEdit = async (
  callTelegram: CallTelegram,
  editMessage: EditMessage,
  payload: {
    chatId: number;
    messageId?: OnboardingMessageId;
    text: string;
    replyMarkup?: Record<string, unknown>;
    parseMode?: 'HTML' | 'MarkdownV2';
  },
) => {
  if (payload.messageId) {
    await editMessage(payload.chatId, payload.messageId, payload.text, payload.replyMarkup, payload.parseMode);
    return;
  }
  await callTelegram('sendMessage', {
    chat_id: payload.chatId,
    text: payload.text,
    parse_mode: payload.parseMode,
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
      '<b>Помогу не держать в голове расписание и оплаты.</b>\n\n' +
      'Добавьте первого ученика — дальше всё будет логично.';
    const replyMarkup = {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: webAppUrl } }]],
    };
    await sendOrEdit(callTelegram, editMessage, {
      chatId,
      messageId,
      text,
      replyMarkup,
      parseMode: 'HTML',
    });
  };

  const sendTeacherFinal = async (chatId: number, messageId?: OnboardingMessageId) => {
    const text =
      '✅ <b>Готово</b>\n\n' + 'Теперь TeacherBot напомнит о занятиях и оплатах. Всё остальное — в приложении.';
    const replyMarkup = {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: webAppUrl } }]],
    };
    await sendOrEdit(callTelegram, editMessage, {
      chatId,
      messageId,
      text,
      replyMarkup,
      parseMode: 'HTML',
    });
  };

  return {
    sendTeacherIntro,
    sendTeacherFinal,
  };
};
