import 'dotenv/config';
import prisma from './prismaClient';
import { createOnboardingMessages } from './telegramOnboardingMessages';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const POLL_TIMEOUT_SEC = Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30);
const POLL_RETRY_DELAY_MS = Number(process.env.TELEGRAM_POLL_RETRY_DELAY_MS ?? 1000);
const TERMS_PRIVACY_URL = 'https://bot.politdev.ru/privacy';
const TERMS_AGREEMENT_URL = 'https://bot.politdev.ru/offer';
const SUPPORT_BOT_HANDLE = '@teacherbot_help';
const SUPPORT_BUTTON_TEXT = '🛟 Поддержка';
const SUPPORT_BUTTON_TEXT_NORMALIZED = SUPPORT_BUTTON_TEXT.toLowerCase();
const ROLE_TEACHER_TEXT = '🧑‍🏫 Я учитель';
const ROLE_STUDENT_TEXT = '🧑‍🎓 Я ученик';
const ROLE_TEACHER_TEXT_NORMALIZED = ROLE_TEACHER_TEXT.toLowerCase();
const ROLE_STUDENT_TEXT_NORMALIZED = ROLE_STUDENT_TEXT.toLowerCase();

const onboardingMessageByChatId = new Map<number, number>();

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

const deleteMessage = async (chatId: number, messageId: number) => {
  await callTelegram('deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
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
const roleSelectionKeyboardHint =
  'Выберите роль кнопками ниже или через inline-кнопки в сообщении.';

const buildRoleKeyboard = () => ({
  keyboard: [[{ text: ROLE_TEACHER_TEXT }, { text: ROLE_STUDENT_TEXT }], [{ text: SUPPORT_BUTTON_TEXT }]],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true,
});

const buildRoleInlineKeyboard = () => ({
  inline_keyboard: [[{ text: ROLE_TEACHER_TEXT, callback_data: 'role_teacher' }, { text: ROLE_STUDENT_TEXT, callback_data: 'role_student' }]],
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
  'Чтобы пользоваться сервисом, оформите пробную подписку ✨\n\nЭто бесплатно: никаких карт, оплат и платежных данных — просто быстрый доступ к возможностям сервиса. 🤝';

const onboardingMessages = createOnboardingMessages({
  callTelegram,
  editMessage,
  deleteMessage,
  webAppUrl: TELEGRAM_WEBAPP_URL,
});

const sendSubscriptionPromptMessage = async (chatId: number, messageId?: number) => {
  const payload = {
    text: subscriptionPromptText,
    reply_markup: {
      inline_keyboard: [[{ text: 'Оформить пробную подписку', callback_data: 'subscription_trial' }]],
    },
  };
  if (messageId) {
    await editMessage(chatId, messageId, payload.text, payload.reply_markup);
    return;
  }
  await callTelegram('sendMessage', { chat_id: chatId, ...payload });
};

const sendOnboardingTeacherFeatures = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text:
      'Коротко, что здесь есть:\n' +
      '• Занятия: чтобы не забывать расписание\n' +
      '• Оплаты: видно, где не оплачено\n' +
      '• Напоминания: себе и ученикам (после того, как ученик нажмёт /start)\n' +
      'Хочешь — покажу быстрый старт.',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Начать за 1 минуту', callback_data: 'onboarding_teacher_quickstart' },
          { text: 'Пропустить', callback_data: 'onboarding_teacher_skip' },
        ],
      ],
    },
  });
};

const sendOnboardingTeacherStep1 = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Шаг 1 из 3: добавь первого ученика в приложении.\nНужен только Telegram username ученика.',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }],
        [{ text: 'Как узнать username?', callback_data: 'onboarding_teacher_username_help' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    },
  });
};

const sendOnboardingTeacherUsernameHint = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text:
      'Открой профиль ученика в Telegram → “Имя пользователя”.\n' +
      'Если его нет — ученик может добавить username в настройках Telegram.',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }],
        [{ text: 'Дальше', callback_data: 'onboarding_teacher_step2' }],
      ],
    },
  });
};

const sendOnboardingTeacherStep2 = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: 'Шаг 2 из 3: добавь первое занятие.\nТак ты сразу увидишь ближайшие уроки и напоминания.',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }],
        [{ text: 'Дальше', callback_data: 'onboarding_teacher_step3' }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    },
  });
};

const sendOnboardingTeacherStep3 = async (chatId: number) => {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text:
      'Шаг 3 из 3 (по желанию): настрой напоминания.\n' +
      'Я могу напоминать:\n' +
      '• тебе — о ближайших уроках\n' +
      '• ученику — об оплате (после того, как он нажмёт /start)',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }],
        [{ text: 'Пропустить', callback_data: 'onboarding_teacher_skip' }],
      ],
    },
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
  const successMessage =
    options?.successMessage ?? 'Готово! Теперь преподаватель сможет отправлять вам уведомления.';
  if (successMessage) {
    if (options?.messageId) {
      await editMessage(chatId, options.messageId, successMessage);
    } else {
      await sendStudentInfoMessage(chatId, successMessage);
    }
  }
  return { status: 'activated' as const };
};

const canOpenTeacherApp = async (telegramUserId: bigint) => {
  const user = await prisma.user.findUnique({ where: { telegramUserId } });
  if (user?.role === 'STUDENT') return { allowed: true, reason: 'student' as const };
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
      const user = await ensureTrialSubscription({
        telegramUserId,
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
        lastName: from.last_name ?? undefined,
      });
      await setTeacherMenuButton(chatId);
      if (!user.onboardingTeacherCompleted) {
        await ensureTeacherOnboardingStarted(telegramUserId);
        await onboardingMessages.sendTeacherIntro(chatId, messageId);
        return;
      }
      if (messageId) {
        await editMessage(chatId, messageId, 'Пробная подписка оформлена. Можете пользоваться сервисом.');
      } else {
        await sendStudentInfoMessage(chatId, 'Пробная подписка оформлена. Можете пользоваться сервисом.');
      }
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

  if (text === '/start') {
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
    const messageId = await sendRoleSelectionMessage(chatId);
    if (messageId) {
      onboardingMessageByChatId.set(chatId, messageId);
    }
    return;
  }

  if (text === SUPPORT_BUTTON_TEXT_NORMALIZED) {
    await sendSupportMessage(chatId);
    return;
  }

  if (text === ROLE_TEACHER_TEXT_NORMALIZED || text === ROLE_STUDENT_TEXT_NORMALIZED) {
    if (!telegramUserId || !from) return;
    const role = text === ROLE_TEACHER_TEXT_NORMALIZED ? 'TEACHER' : 'STUDENT';
    const messageId = onboardingMessageByChatId.get(chatId) ?? (await sendRoleSelectionMessage(chatId));
    if (messageId) {
      onboardingMessageByChatId.set(chatId, messageId);
    }
    await handleRoleSelection(chatId, role, from);
    return;
  }

  if (text === '/app' || text.includes('открыть')) {
    if (telegramUserId) {
      const access = await canOpenTeacherApp(telegramUserId);
      if (!access.allowed) {
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
