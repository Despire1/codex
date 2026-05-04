import { addDays } from 'date-fns';
import type { User } from '@prisma/client';

type SubscriptionDependencies = {
  prisma: any;
  subscriptionMonthDays: number;
  telegramBotToken: string;
  yookassaEventTtlMs: number;
};

export const createSubscriptionService = ({
  prisma,
  subscriptionMonthDays,
  telegramBotToken,
  yookassaEventTtlMs,
}: SubscriptionDependencies) => {
  const processedYookassaPayments = new Map<string, number>();
  const telegramApiBase = `https://api.telegram.org/bot${telegramBotToken}`;

  const hasActiveSubscription = (user: User | null) => {
    if (!user?.subscriptionStartAt) return false;
    if (!user.subscriptionEndAt) return true;
    return user.subscriptionEndAt.getTime() > Date.now();
  };

  const formatSubscriptionDate = (date: Date) =>
    date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const cleanupProcessedYookassaPayments = () => {
    const cutoff = Date.now() - yookassaEventTtlMs;
    for (const [paymentId, timestamp] of processedYookassaPayments.entries()) {
      if (timestamp < cutoff) {
        processedYookassaPayments.delete(paymentId);
      }
    }
  };

  const markYookassaPaymentProcessed = (paymentId: string) => {
    processedYookassaPayments.set(paymentId, Date.now());
    cleanupProcessedYookassaPayments();
  };

  const wasYookassaPaymentProcessed = (paymentId: string) => processedYookassaPayments.has(paymentId);

  const callTelegram = async <T>(method: string, payload?: Record<string, unknown>): Promise<T> => {
    if (!telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    const response = await fetch(`${telegramApiBase}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) {
      throw new Error(data.description ?? `Telegram API error: ${method}`);
    }
    return data.result;
  };

  const sendTelegramMessage = async (chatId: bigint, text: string) => {
    await callTelegram('sendMessage', {
      chat_id: Number(chatId),
      text,
      parse_mode: 'HTML',
    });
  };

  const deleteTelegramMessage = async (chatId: bigint, messageId: number) => {
    await callTelegram('deleteMessage', {
      chat_id: Number(chatId),
      message_id: messageId,
    });
  };

  const handleYookassaWebhook = async (payload: any) => {
    const event = typeof payload?.event === 'string' ? payload.event : null;
    const object = payload?.object ?? null;
    const paymentId = typeof object?.id === 'string' ? object.id : null;
    const status = typeof object?.status === 'string' ? object.status : null;
    const metadata = object?.metadata ?? {};
    const telegramUserIdRaw = metadata?.telegramUserId;
    const messageIdRaw = metadata?.messageId;

    if (!paymentId || !event || status !== 'succeeded' || event !== 'payment.succeeded') {
      return;
    }

    if (wasYookassaPaymentProcessed(paymentId)) {
      return;
    }

    if (typeof telegramUserIdRaw !== 'string' && typeof telegramUserIdRaw !== 'number') {
      markYookassaPaymentProcessed(paymentId);
      return;
    }

    let telegramUserId: bigint;
    try {
      telegramUserId = BigInt(telegramUserIdRaw);
    } catch {
      markYookassaPaymentProcessed(paymentId);
      return;
    }

    const user = await prisma.user.findUnique({ where: { telegramUserId } });
    if (!user) {
      markYookassaPaymentProcessed(paymentId);
      return;
    }

    const now = new Date();
    const baseDate = user.subscriptionEndAt && user.subscriptionEndAt > now ? user.subscriptionEndAt : now;
    const nextEnd = addDays(baseDate, subscriptionMonthDays);
    await prisma.user.update({
      where: { telegramUserId },
      data: {
        subscriptionStartAt: user.subscriptionStartAt ?? now,
        subscriptionEndAt: nextEnd,
      },
    });

    markYookassaPaymentProcessed(paymentId);

    try {
      try {
        if (typeof messageIdRaw === 'number') {
          await deleteTelegramMessage(telegramUserId, messageIdRaw);
        } else if (typeof messageIdRaw === 'string') {
          const parsedMessageId = Number(messageIdRaw);
          if (Number.isFinite(parsedMessageId)) {
            await deleteTelegramMessage(telegramUserId, parsedMessageId);
          }
        }
      } catch (error) {
        console.error('[yookassa] Failed to delete subscription prompt message', error);
      }
      await sendTelegramMessage(
        telegramUserId,
        `✅ <b>Оплата прошла</b>\n\nПодписка активна до ${formatSubscriptionDate(nextEnd)}.`,
      );
    } catch (error) {
      console.error('[yookassa] Failed to send subscription confirmation message', error);
    }
  };

  return {
    hasActiveSubscription,
    handleYookassaWebhook,
  };
};
