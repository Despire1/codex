import 'dotenv/config';
import prisma from './prismaClient';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const POLL_TIMEOUT_SEC = Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30);
const POLL_RETRY_DELAY_MS = Number(process.env.TELEGRAM_POLL_RETRY_DELAY_MS ?? 1000);
const TERMS_PRIVACY_URL = 'https://bot.politdev.ru/privacy';
const TERMS_AGREEMENT_URL = 'https://bot.politdev.ru/terms';

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
      message_id?: number;
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

const termsMessageText =
  '👋 Добро пожаловать!\n\n' +
  'Перед тем как начать пользоваться ботом, пожалуйста, ознакомьтесь с документами:\n\n' +
  `📄 Политика конфиденциальности: ${TERMS_PRIVACY_URL}\n` +
  `📜 Пользовательское соглашение: ${TERMS_AGREEMENT_URL}\n\n` +
  'Нажимая «✅ Принимаю», вы соглашаетесь с условиями использования бота.';

const sendTermsAcceptanceMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: termsMessageText,
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Принимаю', callback_data: 'terms_accept' }]],
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

const subscriptionPromptText =
  'Чтобы пользоваться сервисом, оформите пробную подписку ✨\n\nЭто бесплатно: никаких карт, оплат и платежных данных — просто быстрый доступ к возможностям сервиса. 🤝';

const sendSubscriptionPromptMessage = async (chatId: number, messageId?: number) => {
  const payload = {
    chat_id: chatId,
    text: subscriptionPromptText,
    reply_markup: {
      inline_keyboard: [[{ text: 'Оформить пробную подписку', callback_data: 'subscription_trial' }]],
    },
  };
  if (messageId) {
    await callTelegram('editMessageText', { ...payload, message_id: messageId });
    return;
  }
  await callTelegram('sendMessage', payload);
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

const ensureTelegramUser = async (payload: {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
}) => {
  return prisma.user.upsert({
    where: { telegramUserId: payload.telegramUserId },
    update: {
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
    },
    create: {
      telegramUserId: payload.telegramUserId,
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
    },
  });
};

const acceptTermsForUser = async (payload: {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { telegramUserId: payload.telegramUserId } });
  const acceptedAt = existing?.termsAcceptedAt ?? new Date();
  if (existing) {
    return prisma.user.update({
      where: { telegramUserId: payload.telegramUserId },
      data: {
        termsAccepted: true,
        termsAcceptedAt: acceptedAt,
        username: payload.username ?? existing.username,
        firstName: payload.firstName ?? existing.firstName,
        lastName: payload.lastName ?? existing.lastName,
      },
    });
  }
  return prisma.user.create({
    data: {
      telegramUserId: payload.telegramUserId,
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      termsAccepted: true,
      termsAcceptedAt: acceptedAt,
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

  await prisma.student.updateMany({
    where: { id: { in: students.map((student) => student.id) } },
    data: {
      telegramId: BigInt(chatId),
      isActivated: true,
      activatedAt: new Date(),
    },
  });
  await sendStudentWelcomeMessage(chatId);
};

const canOpenTeacherApp = async (telegramUserId: bigint) => {
  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (user?.role === 'STUDENT') return { allowed: false, reason: 'student' as const };
  const hasSubscription = Boolean(user?.subscriptionStartAt);
  if (hasSubscription) return { allowed: true, reason: 'ok' as const };
  return { allowed: false, reason: 'subscription' as const };
};

const handleRoleSelection = async (
  chatId: number,
  role: 'TEACHER' | 'STUDENT',
  from: NonNullable<TelegramUpdate['callback_query']>['from'],
  messageId?: number,
) => {
  const telegramUserId = BigInt(from.id);
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;

  const user = await upsertTelegramUser({
    telegramUserId,
    username: username ?? undefined,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
    role,
  });

  if (role === 'TEACHER') {
    if (!user.subscriptionStartAt) {
      await setDefaultMenuButton(chatId);
      await sendSubscriptionPromptMessage(chatId, messageId);
      return;
    }
    await setTeacherMenuButton(chatId);
    await sendWebAppMessage(chatId);
    return;
  }

  await setDefaultMenuButton(chatId);
  await activateStudentByUsername(chatId, username ?? undefined);
};

const ensureTrialSubscription = async (payload: {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
}) => {
  const user = await upsertTelegramUser({
    telegramUserId: payload.telegramUserId,
    username: payload.username,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: 'TEACHER',
  });
  if (user.subscriptionStartAt) return user;
  const now = new Date();
  return prisma.user.update({
    where: { telegramUserId: payload.telegramUserId },
    data: {
      subscriptionStartAt: now,
      subscriptionEndAt: now,
    },
  });
};

const handleUpdate = async (update: TelegramUpdate) => {
  const text = update.message?.text?.trim().toLowerCase();
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  if (update.callback_query?.data && chatId) {
    const role =
      update.callback_query.data === 'role_teacher'
        ? 'TEACHER'
        : update.callback_query.data === 'role_student'
          ? 'STUDENT'
          : null;
    if (role) {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      await handleRoleSelection(chatId, role, update.callback_query.from, update.callback_query.message?.message_id);
      return;
    }
    if (update.callback_query.data === 'subscription_trial') {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const from = update.callback_query.from;
      const telegramUserId = BigInt(from.id);
      await ensureTrialSubscription({
        telegramUserId,
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        lastName: from.last_name ?? undefined,
      });
      await setTeacherMenuButton(chatId);
      await sendStudentInfoMessage(chatId, 'Пробная подписка оформлена. Можете пользоваться сервисом.');
      return;
    }
    if (update.callback_query.data === 'terms_accept') {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const from = update.callback_query.from;
      await acceptTermsForUser({
        telegramUserId: BigInt(from.id),
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        lastName: from.last_name ?? undefined,
      });
      await sendRoleSelectionMessage(chatId);
      return;
    }
    return;
  }

  if (!text || !chatId) return;

  const from = update.message?.from;
  const telegramUserId = from?.id ? BigInt(from.id) : null;

  if (text === '/start') {
    if (telegramUserId) {
      const user = await ensureTelegramUser({
        telegramUserId,
        username: from?.username,
        firstName: from?.first_name,
        lastName: from?.last_name,
      });
      if (!user.termsAccepted) {
        await sendTermsAcceptanceMessage(chatId);
        return;
      }
    }
    await sendRoleSelectionMessage(chatId);
    return;
  }

  if (text === '/app' || text.includes('открыть')) {
    if (telegramUserId) {
      const access = await canOpenTeacherApp(telegramUserId);
      if (!access.allowed) {
        if (access.reason === 'student') {
          await sendStudentInfoMessage(chatId, 'Вы ученик, вам доступны только уведомления.');
          return;
        }
        await sendStudentInfoMessage(chatId, 'Сначала оформите пробную подписку в боте. Это бесплатно и не требует карт.');
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
