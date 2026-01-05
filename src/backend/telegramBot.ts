import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const POLL_TIMEOUT_SEC = Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30);
const POLL_RETRY_DELAY_MS = Number(process.env.TELEGRAM_POLL_RETRY_DELAY_MS ?? 1000);

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

type TelegramResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

const ensureEnv = () => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  if (!TELEGRAM_WEBAPP_URL) {
    throw new Error('TELEGRAM_WEBAPP_URL is required');
  }
};

const callTelegram = async <T>(method: string, payload?: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API error: ${method}`);
  }
  return data.result;
};

const sendWebAppMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Откройте мини-приложение:',
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }]],
    },
  });
};

const handleUpdate = async (update: TelegramUpdate) => {
  const text = update.message?.text?.trim().toLowerCase();
  const chatId = update.message?.chat.id;
  if (!text || !chatId) return;

  if (text === '/start' || text === '/app' || text.includes('открыть')) {
    await sendWebAppMessage(chatId);
  }
};

const configureMenuButton = async () => {
  await callTelegram('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Открыть приложение',
      web_app: { url: TELEGRAM_WEBAPP_URL },
    },
  });
};

const clearWebhook = async () => {
  await callTelegram('deleteWebhook', { drop_pending_updates: true });
};

const startPolling = async () => {
  ensureEnv();
  await clearWebhook();
  await configureMenuButton();
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await callTelegram<TelegramUpdate[]>('getUpdates', {
        timeout: POLL_TIMEOUT_SEC,
        offset,
        allowed_updates: ['message'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[telegram-bot] ${message}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS));
    }
  }
};

startPolling().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[telegram-bot] ${message}`);
  process.exit(1);
});
