import 'dotenv/config';
import prisma from './prismaClient';

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
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    message?: {
      chat: { id: number };
    };
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

const sendRoleSelectionMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Выберите роль:',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Я учитель', callback_data: 'role_teacher' },
          { text: 'Я ученик', callback_data: 'role_student' },
        ],
      ],
    },
  });
};

const sendStudentWelcomeMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Профиль активирован. Вы ученик, вам доступны только уведомления.',
  });
};

const sendStudentInfoMessage = async (chatId: number, text: string) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
  });
};

const setTeacherMenuButton = async (chatId: number) => {
  await callTelegram('setChatMenuButton', {
    chat_id: chatId,
    menu_button: {
      type: 'web_app',
      text: 'Открыть приложение',
      web_app: { url: TELEGRAM_WEBAPP_URL },
    },
  });
};

const setDefaultMenuButton = async (chatId: number) => {
  await callTelegram('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'default' },
  });
};

const normalizeTelegramUsername = (username?: string | null) => {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt.trim().toLowerCase() || null;
};

const upsertTelegramUser = async (payload: {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  role?: 'TEACHER' | 'STUDENT';
}) => {
  return prisma.user.upsert({
    where: { telegramUserId: payload.telegramUserId },
    update: {
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      role: payload.role ?? undefined,
    },
    create: {
      telegramUserId: payload.telegramUserId,
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      role: payload.role ?? 'TEACHER',
    },
  });
};

const activateStudentByUsername = async (chatId: number, username?: string) => {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) {
    await sendStudentInfoMessage(chatId, 'Чтобы активироваться, укажите username в Telegram и нажмите /start ещё раз.');
    return;
  }

  const candidates = await prisma.student.findMany({
    where: { username: { contains: normalized } },
  });
  const students = candidates.filter((student) => normalizeTelegramUsername(student.username) === normalized);
  if (students.length === 0) {
    await sendStudentInfoMessage(chatId, 'Мы не нашли вас в списке учеников. Попросите учителя добавить ваш username.');
    return;
  }
  if (students.length > 1) {
    await sendStudentInfoMessage(
      chatId,
      'Вы числитесь у нескольких учителей. Попросите их добавить вас с уникальным username.',
    );
    return;
  }

  await prisma.student.update({
    where: { id: students[0].id },
    data: {
      telegramId: BigInt(chatId),
      isActivated: true,
      activatedAt: new Date(),
    },
  });
  await sendStudentWelcomeMessage(chatId);
};

const handleRoleSelection = async (
  chatId: number,
  role: 'TEACHER' | 'STUDENT',
  from: NonNullable<TelegramUpdate['callback_query']>['from'],
) => {
  const telegramUserId = BigInt(from.id);
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;

  await upsertTelegramUser({
    telegramUserId,
    username: username ?? undefined,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
    role,
  });

  if (role === 'TEACHER') {
    await setTeacherMenuButton(chatId);
    await sendWebAppMessage(chatId);
    return;
  }

  await setDefaultMenuButton(chatId);
  await activateStudentByUsername(chatId, username ?? undefined);
};

const handleUpdate = async (update: TelegramUpdate) => {
  const text = update.message?.text?.trim().toLowerCase();
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  if (update.callback_query?.data && chatId) {
    const role = update.callback_query.data === 'role_teacher' ? 'TEACHER' : update.callback_query.data === 'role_student' ? 'STUDENT' : null;
    if (role) {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      await handleRoleSelection(chatId, role, update.callback_query.from);
    }
    return;
  }

  if (!text || !chatId) return;

  const from = update.message?.from;
  const telegramUserId = from?.id ? BigInt(from.id) : null;

  if (text === '/start') {
    if (telegramUserId) {
      const existing = await prisma.user.findUnique({ where: { telegramUserId } });
      if (existing?.role === 'STUDENT') {
        await setDefaultMenuButton(chatId);
        await activateStudentByUsername(chatId, existing.username ?? from?.username ?? undefined);
        return;
      }
      if (existing?.role === 'TEACHER') {
        await setTeacherMenuButton(chatId);
        await sendWebAppMessage(chatId);
        return;
      }
    }
    await sendRoleSelectionMessage(chatId);
    return;
  }

  if (text === '/app' || text.includes('открыть')) {
    if (telegramUserId) {
      const existing = await prisma.user.findUnique({ where: { telegramUserId } });
      if (existing?.role === 'STUDENT') {
        await sendStudentInfoMessage(chatId, 'Вы ученик, вам доступны только уведомления.');
        return;
      }
    }
    await sendWebAppMessage(chatId);
  }
};

const clearWebhook = async () => {
  await callTelegram('deleteWebhook', { drop_pending_updates: true });
};

const startPolling = async () => {
  ensureEnv();
  await clearWebhook();
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await callTelegram<TelegramUpdate[]>('getUpdates', {
        timeout: POLL_TIMEOUT_SEC,
        offset,
        allowed_updates: ['message', 'callback_query'],
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
