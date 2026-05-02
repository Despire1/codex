import 'dotenv/config';
import crypto from 'node:crypto';
import prisma from './prismaClient';
import { createOnboardingMessages } from './telegramOnboardingMessages';
import { isValidEmail, normalizeEmail } from '../shared/lib/email';
import {
  createTelegramDeepLinkAuthService,
  parseLoginNonceFromStartPayload,
} from './server/modules/telegramDeepLinkAuth';
import { describeUserAgent, formatDisplayIp } from '../shared/lib/sessionDisplay';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const POLL_TIMEOUT_SEC = Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30);
const POLL_RETRY_DELAY_MS = Number(process.env.TELEGRAM_POLL_RETRY_DELAY_MS ?? 1000);
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID ?? '';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY ?? '';
const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL ?? '';
const TERMS_PRIVACY_URL = 'https://bot.politdev.ru/privacy';
const TERMS_AGREEMENT_URL = 'https://bot.politdev.ru/offer';
const SUPPORT_BOT_HANDLE = '@teacherbot_help';
const SUPPORT_BUTTON_TEXT = '🛟 Поддержка';
const SUPPORT_BUTTON_TEXT_NORMALIZED = SUPPORT_BUTTON_TEXT.toLowerCase();
const SUBSCRIPTION_BUTTON_TEXT = '💎 Моя подписка';
const SUBSCRIPTION_BUTTON_TEXT_NORMALIZED = SUBSCRIPTION_BUTTON_TEXT.toLowerCase();
const ROLE_TEACHER_TEXT = '🧑‍🏫 Я учитель';
const ROLE_STUDENT_TEXT = '🧑‍🎓 Я ученик';
const ROLE_TEACHER_TEXT_NORMALIZED = ROLE_TEACHER_TEXT.toLowerCase();
const ROLE_STUDENT_TEXT_NORMALIZED = ROLE_STUDENT_TEXT.toLowerCase();
const SUBSCRIPTION_TRIAL_DAYS = 14;
const SUBSCRIPTION_MONTH_PRICE_RUB = 790;
const SUBSCRIPTION_CURRENCY = 'RUB';
const RECEIPT_EMAIL_REQUEST_TEXT = 'Чтобы отправить чек, укажите e-mail. Напишите его одним сообщением.';
const RECEIPT_EMAIL_INVALID_TEXT = 'Некорректный e-mail. Проверьте формат и отправьте ещё раз.';
const TELEGRAM_DEEP_LINK_TTL_SEC = Number(process.env.TELEGRAM_DEEP_LINK_TTL_SEC ?? 600);
const TELEGRAM_REPLAY_SKEW_SEC = Number(process.env.TELEGRAM_REPLAY_SKEW_SEC ?? 60);
const deepLinkAuthService = createTelegramDeepLinkAuthService({ ttlSeconds: TELEGRAM_DEEP_LINK_TTL_SEC });

const onboardingMessageByChatId = new Map<number, number>();
const pendingReceiptEmailByChatId = new Map<number, { telegramUserId: bigint; messageId?: number }>();

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    date?: number;
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
      date?: number;
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

const editMessage = async (chatId: number, messageId: number, text: string, replyMarkup?: Record<string, unknown>) => {
  try {
    await callTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("message can't be edited")) {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      });
      return;
    }
    throw error;
  }
};

const sendWebAppMessage = async (chatId: number, messageId?: number) => {
  const reply_markup = {
    inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }]],
  };
  if (messageId) {
    await editMessage(chatId, messageId, 'Откройте мини-приложение:', reply_markup);
    return;
  }
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Откройте мини-приложение:',
    reply_markup,
  });
};

const ensureChatMenuButton = async () => {
  try {
    await callTelegram('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Открыть',
        web_app: { url: TELEGRAM_WEBAPP_URL },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram-bot] setChatMenuButton failed: ${message}`);
  }
};

const sendSupportMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `Напишите в поддержку: ${SUPPORT_BOT_HANDLE}`,
  });
};

const sendStudentInfoMessage = async (chatId: number, text: string) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: buildRoleKeyboard(),
  });
};

const sendStudentActivatedMessage = async (chatId: number, text: string) => {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_markup: buildRoleKeyboard(),
  };
  if (TELEGRAM_WEBAPP_URL) {
    await callTelegram('sendMessage', {
      ...payload,
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }]],
      },
    });
    return;
  }
  await callTelegram('sendMessage', payload);
};

const termsMessageText =
  '👋 Добро пожаловать!\n\n' +
  'Перед тем как начать пользоваться ботом, пожалуйста, ознакомьтесь с документами:\n\n' +
  `📄 <a href="${TERMS_PRIVACY_URL}">Политика конфиденциальности</a>\n` +
  `📜 <a href="${TERMS_AGREEMENT_URL}">Пользовательское соглашение</a>\n\n` +
  'Нажимая «✅ Принимаю», вы соглашаетесь с условиями использования бота.';

const sendTermsAcceptanceMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: termsMessageText,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Принимаю', callback_data: 'terms_accept' }]],
    },
  });
};

const roleSelectionText =
  '👋 Здравствуйте!\n' +
  'Я — TeacherBot. Помогаю навести порядок в занятиях и оплатах, чтобы ничего не держать в голове.\n\n' +
  'Чтобы я показывал подходящие функции, пожалуйста, выберите свою роль. Это всегда можно изменить позже.';
const roleSelectionKeyboardHint = 'Выберите роль кнопками ниже или через inline-кнопки в сообщении.';

const buildRoleKeyboard = () => ({
  keyboard: [
    [{ text: ROLE_TEACHER_TEXT }, { text: ROLE_STUDENT_TEXT }],
    [{ text: SUPPORT_BUTTON_TEXT }, { text: SUBSCRIPTION_BUTTON_TEXT }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true,
});

const buildRoleInlineKeyboard = () => ({
  inline_keyboard: [
    [
      { text: ROLE_TEACHER_TEXT, callback_data: 'role_teacher' },
      { text: ROLE_STUDENT_TEXT, callback_data: 'role_student' },
    ],
  ],
});

const sendRoleKeyboardHintMessage = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: roleSelectionKeyboardHint,
    reply_markup: buildRoleKeyboard(),
  });
};

const sendRoleSelectionMessage = async (chatId: number, messageId?: number) => {
  if (messageId) {
    await sendRoleKeyboardHintMessage(chatId);
    await editMessage(chatId, messageId, roleSelectionText, buildRoleInlineKeyboard());
    return messageId;
  }
  await sendRoleKeyboardHintMessage(chatId);
  const result = await callTelegram<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: roleSelectionText,
    reply_markup: buildRoleInlineKeyboard(),
  });
  onboardingMessageByChatId.set(chatId, result.message_id);
  return result.message_id;
};

const subscriptionPromptText =
  'Вам доступно 14 дней пробного периода 🎁\n\n' +
  'Оформите пробный доступ кнопкой ниже или выберите подписку на месяц.';
const subscriptionPromptPaidOnlyText = 'Оформите подписку на месяц, чтобы получить полный доступ.';

const onboardingMessages = createOnboardingMessages({
  callTelegram,
  editMessage,
  webAppUrl: TELEGRAM_WEBAPP_URL,
});

const buildSubscriptionPromptPayload = (canUseTrial: boolean) => {
  const inline_keyboard = [];
  if (canUseTrial) {
    inline_keyboard.push([{ text: '🎁 Оформить 14 дней', callback_data: 'subscription_trial' }]);
  }
  inline_keyboard.push([
    {
      text: `1 месяц - ${SUBSCRIPTION_MONTH_PRICE_RUB}₽ (9\u03369\u03360\u0336₽\u0336)`,
      callback_data: 'subscription_monthly',
    },
  ]);
  return {
    text: canUseTrial ? subscriptionPromptText : subscriptionPromptPaidOnlyText,
    reply_markup: { inline_keyboard },
  };
};

const sendSubscriptionPromptMessage = async (chatId: number, messageId?: number, canUseTrial = true) => {
  const payload = buildSubscriptionPromptPayload(canUseTrial);
  if (messageId) {
    await editMessage(chatId, messageId, payload.text, payload.reply_markup);
    return;
  }
  await callTelegram('sendMessage', { chat_id: chatId, ...payload });
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const formatDate = (date: Date) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const formatSubscriptionStatus = (
  user: { subscriptionStartAt: Date | null; subscriptionEndAt: Date | null } | null,
) => {
  if (!user?.subscriptionStartAt) {
    return (
      '🚪 Подписка не активна\n\n' +
      'Оформите доступ, чтобы пользоваться всеми возможностями бота.\n' +
      '• 🎁 Пробный период на 14 дней\n' +
      '• 💳 Подписка на месяц — 790 ₽'
    );
  }

  const now = new Date();
  const endAt = user.subscriptionEndAt;
  if (!endAt) {
    return (
      '✅ Подписка активна\n\n' +
      '🧠 Доступ: без даты окончания\n' +
      'Если нужно продление — просто оформите новую подписку.'
    );
  }

  const isActive = endAt.getTime() > now.getTime();
  const daysLeftRaw = Math.ceil((endAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(daysLeftRaw, 0);
  const durationDays = Math.ceil((endAt.getTime() - user.subscriptionStartAt.getTime()) / (24 * 60 * 60 * 1000));
  const typeLabel = durationDays <= SUBSCRIPTION_TRIAL_DAYS + 1 ? '🎁 Пробный период' : '💳 Подписка на месяц';

  return [
    isActive ? '✅ Подписка активна' : '⛔️ Подписка истекла',
    '',
    `${typeLabel}`,
    `📅 Действует до: ${formatDate(endAt)}`,
    isActive ? `⏳ Осталось: ${daysLeft} дн.` : '⚡️ Продлите подписку, чтобы вернуть доступ',
  ].join('\n');
};

const isSubscriptionActive = (user: { subscriptionStartAt: Date | null; subscriptionEndAt: Date | null } | null) => {
  if (!user?.subscriptionStartAt) return false;
  if (!user.subscriptionEndAt) return true;
  return user.subscriptionEndAt.getTime() > Date.now();
};

const createYookassaPayment = async (payload: { telegramUserId: bigint; messageId?: number; receiptEmail: string }) => {
  if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY || !YOOKASSA_RETURN_URL) {
    throw new Error('YOOKASSA credentials are not configured');
  }
  const amount = `${SUBSCRIPTION_MONTH_PRICE_RUB}.00`;
  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Idempotence-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: amount, currency: SUBSCRIPTION_CURRENCY },
      capture: true,
      confirmation: { type: 'redirect', return_url: YOOKASSA_RETURN_URL },
      description: 'Подписка на 30 дней',
      receipt: {
        customer: { email: payload.receiptEmail },
        items: [
          {
            description: 'Подписка на 30 дней',
            quantity: '1.00',
            amount: { value: amount, currency: SUBSCRIPTION_CURRENCY },
            vat_code: 1,
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
      metadata: {
        telegramUserId: payload.telegramUserId.toString(),
        messageId: typeof payload.messageId === 'number' ? payload.messageId : undefined,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YooKassa payment failed: ${response.status} ${body}`);
  }
  const data = (await response.json()) as { confirmation?: { confirmation_url?: string } };
  const confirmationUrl = data.confirmation?.confirmation_url;
  if (!confirmationUrl) {
    throw new Error('YooKassa confirmation_url is missing');
  }
  return confirmationUrl;
};

const sendSubscriptionPurchaseConfirmation = async (
  chatId: number,
  telegramUserId: bigint,
  receiptEmail: string,
  messageId?: number,
) => {
  try {
    const confirmationUrl = await createYookassaPayment({ telegramUserId, messageId, receiptEmail });
    const text =
      `💳 Подтвердите покупку подписки — ${SUBSCRIPTION_MONTH_PRICE_RUB} ₽\nПосле подтверждения подписка сразу активируется ✅\n\n` +
      `📄 Пользовательское соглашение: ${TERMS_AGREEMENT_URL}\n\nНажимая «Подтвердить покупку», вы соглашаетесь с пользовательским соглашением.`;
    const replyMarkup = {
      inline_keyboard: [[{ text: 'Подтвердить покупку', url: confirmationUrl }]],
    };
    if (messageId) {
      await editMessage(chatId, messageId, text, replyMarkup);
      return;
    }
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram-bot] Failed to create subscription payment: ${message}`);
    await sendStudentInfoMessage(chatId, 'Не удалось сформировать ссылку на оплату. Напишите в поддержку.');
  }
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

const ADMIN_TELEGRAM_CHAT_ID = 683130123;

const buildNewUserNotification = (payload: {
  telegramUserId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const username = payload.username ? `@${payload.username}` : 'не указан';
  const firstName = payload.firstName?.trim() || 'не указано';
  const lastName = payload.lastName?.trim() || 'не указано';
  return [
    'Новый пользователь в боте:',
    `ID: ${payload.telegramUserId.toString()}`,
    `Имя: ${firstName}`,
    `Фамилия: ${lastName}`,
    `Username: ${username}`,
  ].join('\n');
};

const notifyAdminAboutNewUser = async (payload: {
  telegramUserId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const text = buildNewUserNotification(payload);
  try {
    await callTelegram('sendMessage', {
      chat_id: ADMIN_TELEGRAM_CHAT_ID,
      text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram-bot] Failed to notify admin about new user: ${message}`);
  }
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
  const existing = await prisma.user.findUnique({ where: { telegramUserId: payload.telegramUserId } });
  if (existing) {
    const user = await prisma.user.update({
      where: { telegramUserId: payload.telegramUserId },
      data: {
        username: payload.username ?? null,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
      },
    });
    return { user, isNew: false };
  }
  const user = await prisma.user.create({
    data: {
      telegramUserId: payload.telegramUserId,
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
    },
  });
  return { user, isNew: true };
};

const ensureTeacherOnboardingStarted = async (telegramUserId: bigint) => {
  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (!user?.onboardingTeacherStartedAt) {
    await prisma.user.update({
      where: { telegramUserId },
      data: { onboardingTeacherStartedAt: new Date() },
    });
  }
};

const ensureStudentOnboardingStarted = async (telegramUserId: bigint) => {
  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (!user?.onboardingStudentStartedAt) {
    await prisma.user.update({
      where: { telegramUserId },
      data: { onboardingStudentStartedAt: new Date() },
    });
  }
};

const completeTeacherOnboarding = async (telegramUserId: bigint) => {
  await prisma.user.update({
    where: { telegramUserId },
    data: { onboardingTeacherCompleted: true },
  });
};

const completeStudentOnboarding = async (telegramUserId: bigint) => {
  await prisma.user.update({
    where: { telegramUserId },
    data: { onboardingStudentCompleted: true },
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

const activateStudentByUsername = async (
  chatId: number,
  username?: string,
  options?: { successMessage?: string | null; messageId?: number },
) => {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) {
    const text = 'Чтобы получать уведомления, укажите username в Telegram и нажмите /start ещё раз.';
    if (options?.messageId) {
      await editMessage(chatId, options.messageId, text);
    } else {
      await sendStudentInfoMessage(chatId, text);
    }
    return { status: 'missing_username' as const };
  }

  const candidates = await prisma.student.findMany({
    where: { username: { contains: normalized } },
  });
  const students = candidates.filter((student) => normalizeTelegramUsername(student.username) === normalized);
  if (students.length === 0) {
    const text = 'Мы не нашли вас в списке учеников. Попросите учителя добавить ваш username.';
    if (options?.messageId) {
      await editMessage(chatId, options.messageId, text);
    } else {
      await sendStudentInfoMessage(chatId, text);
    }
    return { status: 'not_found' as const };
  }

  await prisma.student.updateMany({
    where: { id: { in: students.map((student) => student.id) } },
    data: {
      telegramId: BigInt(chatId),
      isActivated: true,
      activatedAt: new Date(),
    },
  });
  const successMessage = options?.successMessage ?? 'Готово! Теперь преподаватель сможет отправлять вам уведомления.';
  if (successMessage) {
    if (options?.messageId) {
      await editMessage(chatId, options.messageId, successMessage, {
        inline_keyboard: TELEGRAM_WEBAPP_URL
          ? [[{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }]]
          : [],
      });
    } else {
      await sendStudentActivatedMessage(chatId, successMessage);
    }
  }
  return { status: 'activated' as const };
};

const canOpenTeacherApp = async (telegramUserId: bigint) => {
  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (user?.role === 'STUDENT') return { allowed: true, reason: 'student' as const };
  const hasSubscription = isSubscriptionActive(user);
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
    if (!isSubscriptionActive(user)) {
      await setDefaultMenuButton(chatId);
      await sendSubscriptionPromptMessage(chatId, messageId, !user.subscriptionTrialUsed);
      return;
    }
    await setTeacherMenuButton(chatId);
    if (!user.onboardingTeacherCompleted) {
      await ensureTeacherOnboardingStarted(telegramUserId);
      await onboardingMessages.sendTeacherIntro(chatId, messageId);
      return;
    }
    await sendWebAppMessage(chatId, messageId);
    return;
  }

  await setTeacherMenuButton(chatId);
  await ensureStudentOnboardingStarted(telegramUserId);
  await activateStudentByUsername(chatId, username ?? undefined, { messageId });
  await completeStudentOnboarding(telegramUserId);
  return;
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
  if (user.subscriptionTrialUsed) {
    return { user, status: 'already_used' as const };
  }
  if (isSubscriptionActive(user)) {
    return { user, status: 'active' as const };
  }
  const now = new Date();
  const updatedUser = await prisma.user.update({
    where: { telegramUserId: payload.telegramUserId },
    data: {
      subscriptionStartAt: now,
      subscriptionEndAt: addDays(now, SUBSCRIPTION_TRIAL_DAYS),
      subscriptionTrialUsed: true,
    },
  });
  return { user: updatedUser, status: 'activated' as const };
};

const handleUpdate = async (update: TelegramUpdate) => {
  const rawText = update.message?.text?.trim() ?? '';
  const text = rawText.toLowerCase();
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;

  if (update.callback_query?.data && chatId) {
    if (update.callback_query.data.startsWith('tgl_c:') || update.callback_query.data.startsWith('tgl_r:')) {
      const callbackId = update.callback_query.id;
      const messageId = update.callback_query.message?.message_id;
      const isConfirm = update.callback_query.data.startsWith('tgl_c:');
      const nonceRaw = update.callback_query.data.slice('tgl_c:'.length);
      const nonce = parseLoginNonceFromStartPayload(`login_${nonceRaw}`);
      const from = update.callback_query.from;
      const telegramUserId = from?.id ? BigInt(from.id) : null;

      if (!nonce || !telegramUserId) {
        await callTelegram('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Ссылка устарела',
          show_alert: true,
        });
        return;
      }

      if (!isConfirm) {
        await deepLinkAuthService.rejectAttempt(nonce);
        await callTelegram('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Вход отклонён',
        });
        const noticeText =
          '🚫 Вход отклонён. Если это были не вы — рекомендуем сменить устройства входа в TeacherBot и пройти проверку безопасности.';
        if (messageId) {
          await editMessage(chatId, messageId, noticeText);
        } else {
          await callTelegram('sendMessage', { chat_id: chatId, text: noticeText });
        }
        return;
      }

      const callbackAuthDate = update.callback_query.message?.date ?? Math.floor(Date.now() / 1000);
      const claim = await deepLinkAuthService.claimAttemptByBot({
        nonce,
        telegramUserId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        photoUrl: null,
        authDate: callbackAuthDate,
        replaySkewSec: TELEGRAM_REPLAY_SKEW_SEC,
      });
      if (!claim.ok) {
        await callTelegram('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Срок входа истёк',
          show_alert: true,
        });
        const expiredText = 'Срок входа истёк. Откройте сайт ещё раз и нажмите «Войти через Telegram».';
        if (messageId) {
          await editMessage(chatId, messageId, expiredText);
        } else {
          await callTelegram('sendMessage', { chat_id: chatId, text: expiredText });
        }
        return;
      }

      await callTelegram('answerCallbackQuery', { callback_query_id: callbackId });
      const successText =
        '✅ Вход выполнен. Можно вернуться в браузер — приложение откроется автоматически.\n\n' +
        'Здесь же остаются настройки уведомлений и подписки.';
      if (messageId) {
        await editMessage(chatId, messageId, successText);
      } else {
        await callTelegram('sendMessage', { chat_id: chatId, text: successText });
      }
      return;
    }
    if (update.callback_query.data.startsWith('security_revoke_')) {
      const callbackId = update.callback_query.id;
      const messageId = update.callback_query.message?.message_id;
      const requesterTelegramId = BigInt(update.callback_query.from.id);
      const sessionIdRaw = update.callback_query.data.slice('security_revoke_'.length);
      const sessionId = Number(sessionIdRaw);
      if (!Number.isFinite(sessionId)) {
        await callTelegram('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Ссылка устарела',
          show_alert: true,
        });
        return;
      }
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { user: { select: { id: true, telegramUserId: true } } },
      });
      if (!session || session.user.telegramUserId !== requesterTelegramId) {
        await callTelegram('answerCallbackQuery', {
          callback_query_id: callbackId,
          text: 'Это не ваш аккаунт',
          show_alert: true,
        });
        return;
      }
      // Реальная экстренная мера: ревокаем все активные сессии этого пользователя.
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.webPushSubscription.deleteMany({ where: { userId: session.userId } }).catch((error) => {
        console.warn('Failed to wipe push subscriptions on security revoke', error);
      });
      await callTelegram('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'Все сессии завершены',
      });
      const noticeText = '🛡 Все сессии вашего аккаунта завершены. Откройте сайт и войдите заново через Telegram.';
      if (messageId) {
        await editMessage(chatId, messageId, noticeText);
      } else {
        await callTelegram('sendMessage', { chat_id: chatId, text: noticeText });
      }
      return;
    }

    const role =
      update.callback_query.data === 'role_teacher'
        ? 'TEACHER'
        : update.callback_query.data === 'role_student'
          ? 'STUDENT'
          : null;
    if (role) {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const messageId = update.callback_query.message?.message_id;
      if (messageId) {
        onboardingMessageByChatId.set(chatId, messageId);
      }
      await handleRoleSelection(chatId, role, update.callback_query.from, messageId);
      return;
    }
    if (update.callback_query.data === 'subscription_trial') {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const from = update.callback_query.from;
      const telegramUserId = BigInt(from.id);
      const messageId = update.callback_query.message?.message_id;
      const trialResult = await ensureTrialSubscription({
        telegramUserId,
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        lastName: from.last_name ?? undefined,
      });
      const user = trialResult.user;
      if (trialResult.status === 'already_used') {
        await sendStudentInfoMessage(chatId, 'Пробный период уже был использован. Выберите подписку на месяц.');
        await sendSubscriptionPromptMessage(chatId, undefined, false);
        return;
      }
      if (trialResult.status === 'active') {
        await sendStudentInfoMessage(chatId, formatSubscriptionStatus(user));
        return;
      }
      await setTeacherMenuButton(chatId);
      if (!user.onboardingTeacherCompleted) {
        await ensureTeacherOnboardingStarted(telegramUserId);
        await onboardingMessages.sendTeacherIntro(chatId, messageId);
        return;
      }
      const subscriptionEndAt = user.subscriptionEndAt ?? addDays(new Date(), SUBSCRIPTION_TRIAL_DAYS);
      const successText = `🎉 Пробный период активирован!\n\n⏳ Доступ открыт до ${formatDate(subscriptionEndAt)}.\n\nТеперь вам доступны весь функционал. Успейте попробовать сервис в деле 🚀`;
      if (messageId) {
        await editMessage(chatId, messageId, successText);
      } else {
        await sendStudentInfoMessage(chatId, successText);
      }
      return;
    }
    if (update.callback_query.data === 'subscription_monthly') {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const from = update.callback_query.from;
      const telegramUserId = BigInt(from.id);
      const messageId = update.callback_query.message?.message_id;
      const { user } = await ensureTelegramUser({
        telegramUserId,
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        lastName: from.last_name ?? undefined,
      });
      const normalizedReceiptEmail = normalizeEmail(user.receiptEmail);
      if (!normalizedReceiptEmail || !isValidEmail(normalizedReceiptEmail)) {
        pendingReceiptEmailByChatId.set(chatId, { telegramUserId, messageId });
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: RECEIPT_EMAIL_REQUEST_TEXT,
        });
        return;
      }
      pendingReceiptEmailByChatId.delete(chatId);
      await sendSubscriptionPurchaseConfirmation(chatId, telegramUserId, normalizedReceiptEmail, messageId);
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
      const messageId = update.callback_query.message?.message_id;
      if (messageId) {
        onboardingMessageByChatId.set(chatId, messageId);
      }
      await sendRoleSelectionMessage(chatId, messageId);
      return;
    }
    if (update.callback_query.data?.startsWith('onboarding_teacher_')) {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const telegramUserId = BigInt(update.callback_query.from.id);
      const messageId = update.callback_query.message?.message_id;
      if (update.callback_query.data === 'onboarding_teacher_skip') {
        await completeTeacherOnboarding(telegramUserId);
        await onboardingMessages.sendTeacherFinal(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_features') {
        await onboardingMessages.sendTeacherFeatures(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_quickstart') {
        await onboardingMessages.sendTeacherStep1(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_username_help') {
        await onboardingMessages.sendTeacherUsernameHint(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_step2') {
        await onboardingMessages.sendTeacherStep2(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_step3') {
        await onboardingMessages.sendTeacherStep3(chatId, messageId);
        return;
      }
      if (update.callback_query.data === 'onboarding_teacher_finish') {
        await onboardingMessages.sendTeacherFinal(chatId, messageId);
        await completeTeacherOnboarding(telegramUserId);
        return;
      }
      return;
    }
    if (update.callback_query.data?.startsWith('onboarding_student_')) {
      await callTelegram('answerCallbackQuery', { callback_query_id: update.callback_query.id });
      const telegramUserId = BigInt(update.callback_query.from.id);
      const messageId = update.callback_query.message?.message_id;
      if (update.callback_query.data === 'onboarding_student_skip') {
        await completeStudentOnboarding(telegramUserId);
        if (messageId) {
          await editMessage(chatId, messageId, 'Хорошо! Если понадобится, выберите роль снова.');
        }
        return;
      }
      if (update.callback_query.data === 'onboarding_student_activate') {
        await activateStudentByUsername(chatId, update.callback_query.from.username ?? undefined, {
          successMessage: 'Готово! Теперь преподаватель сможет отправлять тебе уведомления.',
          messageId,
        });
        await completeStudentOnboarding(telegramUserId);
        return;
      }
      return;
    }
    return;
  }

  if (!text || !chatId) return;

  const from = update.message?.from;
  const telegramUserId = from?.id ? BigInt(from.id) : null;
  const pendingReceiptEmail = pendingReceiptEmailByChatId.get(chatId);

  if (pendingReceiptEmail) {
    const normalized = normalizeEmail(text);
    if (!normalized || !isValidEmail(normalized)) {
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: RECEIPT_EMAIL_INVALID_TEXT,
      });
      return;
    }
    await prisma.user.update({
      where: { telegramUserId: pendingReceiptEmail.telegramUserId },
      data: { receiptEmail: normalized },
    });
    pendingReceiptEmailByChatId.delete(chatId);
    await sendSubscriptionPurchaseConfirmation(chatId, pendingReceiptEmail.telegramUserId, normalized);
    return;
  }

  const startCommandMatch = /^\/start(?:@\S+)?(?:\s+(\S+))?$/.exec(rawText);
  if (startCommandMatch) {
    const startPayload = startCommandMatch[1] ?? null;
    const loginNonce = parseLoginNonceFromStartPayload(startPayload);
    let confirmationPrompted = false;
    if (loginNonce && telegramUserId && from) {
      const attempt = await deepLinkAuthService.peekPendingAttempt(loginNonce);
      if (attempt) {
        const displayIp = formatDisplayIp(attempt.ip);
        const ipLine = displayIp ? `IP: ${displayIp}` : null;
        const uaLine = attempt.userAgent ? `Устройство: ${describeUserAgent(attempt.userAgent)}` : null;
        const detailsBlock = [ipLine, uaLine].filter(Boolean).join('\n');
        const promptText =
          '🔐 Запрос на вход в TeacherBot.\n\n' +
          (detailsBlock ? `${detailsBlock}\n\n` : '') +
          'Если это вы — подтвердите вход. Если нет — отклоните, ' +
          'тогда злоумышленник не получит доступ к вашему аккаунту.';
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: promptText,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Это я, подтверждаю вход', callback_data: `tgl_c:${loginNonce}` },
                { text: '❌ Это не я', callback_data: `tgl_r:${loginNonce}` },
              ],
            ],
          },
        });
        confirmationPrompted = true;
      } else {
        await callTelegram('sendMessage', {
          chat_id: chatId,
          text: 'Срок входа истёк. Откройте сайт ещё раз и нажмите «Войти через Telegram».',
        });
        confirmationPrompted = true;
      }
    }

    if (telegramUserId) {
      const { user, isNew } = await ensureTelegramUser({
        telegramUserId,
        username: from?.username,
        firstName: from?.first_name,
        lastName: from?.last_name,
      });
      if (isNew) {
        await notifyAdminAboutNewUser({
          telegramUserId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        });
      }
      if (!user.termsAccepted) {
        await sendTermsAcceptanceMessage(chatId);
        return;
      }
    }
    if (confirmationPrompted) {
      return;
    }
    const messageId = await sendRoleSelectionMessage(chatId);
    if (messageId) {
      onboardingMessageByChatId.set(chatId, messageId);
    }
    return;
  }

  if (text === SUBSCRIPTION_BUTTON_TEXT_NORMALIZED) {
    if (!telegramUserId) return;
    const user = await prisma.user.findUnique({ where: { telegramUserId } });
    if (isSubscriptionActive(user)) {
      await sendStudentInfoMessage(chatId, formatSubscriptionStatus(user));
      return;
    }
    await sendSubscriptionPromptMessage(chatId, undefined, !user?.subscriptionTrialUsed);
    return;
  }

  if (text === SUPPORT_BUTTON_TEXT_NORMALIZED) {
    await sendSupportMessage(chatId);
    return;
  }

  if (text === ROLE_TEACHER_TEXT_NORMALIZED || text === ROLE_STUDENT_TEXT_NORMALIZED) {
    if (!telegramUserId || !from) return;
    const role = text === ROLE_TEACHER_TEXT_NORMALIZED ? 'TEACHER' : 'STUDENT';
    const messageId = onboardingMessageByChatId.get(chatId);
    await handleRoleSelection(chatId, role, from, messageId);
    return;
  }

  if (text === '/app' || text.includes('открыть')) {
    if (telegramUserId) {
      const access = await canOpenTeacherApp(telegramUserId);
      if (!access.allowed) {
        await sendStudentInfoMessage(
          chatId,
          'Сначала оформите пробную подписку в боте. Это бесплатно и не требует карт.',
        );
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
  await ensureChatMenuButton();
  let offset = 0;

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
