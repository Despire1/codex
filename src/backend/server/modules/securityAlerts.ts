import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { sendTelegramMessage } from '../../notificationService';
import { formatLocation, lookupIpLocation } from '../lib/geoIp';

const truncate = (value: string | null | undefined, max = 96) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};

const formatDateRu = (date: Date) =>
  date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const describeUserAgent = (userAgent: string | null | undefined) => {
  const ua = userAgent?.toLowerCase() ?? '';
  if (!ua) return 'неизвестное устройство';

  const isMobile = ua.includes('iphone') || ua.includes('android') || ua.includes('mobile');
  const isTablet = ua.includes('ipad');
  const isTelegram = ua.includes('telegram');

  let os = '';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('mac os x')) os = 'iOS/macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = '';
  if (isTelegram) browser = 'Telegram';
  else if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';

  const kind = isTablet ? 'планшет' : isMobile ? 'телефон' : 'компьютер';
  const parts = [browser, os, kind].filter(Boolean);
  return parts.join(' · ') || truncate(userAgent, 60) || 'неизвестное устройство';
};

const formatLocationLine = async (ip: string | null) => {
  if (!ip) return null;
  const geo = await lookupIpLocation(ip);
  return formatLocation(geo);
};

const buildLoginAlertText = (params: {
  ip: string | null;
  location: string | null;
  userAgent: string | null;
  occurredAt: Date;
}) =>
  [
    '🔐 <b>Новый вход в аккаунт</b>',
    '',
    `Время: ${formatDateRu(params.occurredAt)}`,
    `Устройство: ${describeUserAgent(params.userAgent)}`,
    params.location ? `Местоположение: ${params.location}` : null,
    params.ip ? `IP: ${params.ip}` : null,
    '',
    'Если это были не вы — нажмите кнопку ниже, мы тут же завершим все ваши сессии.',
  ]
    .filter(Boolean)
    .join('\n');

const buildLogoutAlertText = (params: {
  ip: string | null;
  location: string | null;
  userAgent: string | null;
  occurredAt: Date;
}) =>
  [
    '🚪 <b>Выход из аккаунта</b>',
    '',
    `Время: ${formatDateRu(params.occurredAt)}`,
    `Устройство: ${describeUserAgent(params.userAgent)}`,
    params.location ? `Местоположение: ${params.location}` : null,
    params.ip ? `IP: ${params.ip}` : null,
    '',
    'Если выходили не вы — войдите снова и завершите все сессии в «Настройки → Безопасность».',
  ]
    .filter(Boolean)
    .join('\n');

const buildAllOtherSessionsRevokedText = (occurredAt: Date) =>
  [
    '🛡 <b>Все остальные сессии завершены</b>',
    '',
    `Время: ${formatDateRu(occurredAt)}`,
    'На текущем устройстве вы остаётесь в аккаунте, остальные были разлогинены.',
  ].join('\n');

type AlertUser = Pick<
  User,
  | 'id'
  | 'telegramUserId'
  | 'securityAlertsEnabled'
  | 'securityAlertNewDevice'
  | 'securityAlertLogout'
  | 'securityAlertSessionRevoke'
>;

type AlertContext = {
  user: AlertUser;
  ip?: string | null;
  userAgent?: string | null;
};

const isMasterEnabled = (user: AlertUser) => Boolean(user.securityAlertsEnabled && user.telegramUserId);

const sendAlert = async (
  user: AlertUser,
  text: string,
  options?: { inlineKeyboard?: { text: string; callback_data: string }[][] },
) => {
  if (!user.telegramUserId) return;
  try {
    await sendTelegramMessage(user.telegramUserId, text, {
      parseMode: 'HTML',
      inlineKeyboard: options?.inlineKeyboard ?? null,
    });
  } catch (error) {
    console.warn('Failed to send security alert', error);
  }
};

export const notifyLoginFromNewDevice = async (ctx: AlertContext & { sessionId: number }) => {
  if (!isMasterEnabled(ctx.user)) return;
  if (!ctx.user.securityAlertNewDevice) return;

  const userAgent = ctx.userAgent ?? '';
  const knownCount = userAgent
    ? await prisma.session.count({
        where: { userId: ctx.user.id, userAgent, NOT: { id: ctx.sessionId } },
      })
    : 0;
  if (knownCount > 0) return;

  const totalOther = await prisma.session.count({
    where: { userId: ctx.user.id, NOT: { id: ctx.sessionId } },
  });
  if (totalOther === 0) return;

  const location = await formatLocationLine(ctx.ip ?? null);

  await sendAlert(
    ctx.user,
    buildLoginAlertText({
      ip: ctx.ip ?? null,
      location,
      userAgent: ctx.userAgent ?? null,
      occurredAt: new Date(),
    }),
    {
      inlineKeyboard: [
        [{ text: '⚠️ Это был не я — закрыть все сессии', callback_data: `security_revoke_${ctx.sessionId}` }],
      ],
    },
  );
};

export const notifyLogout = async (ctx: AlertContext) => {
  if (!isMasterEnabled(ctx.user)) return;
  if (!ctx.user.securityAlertLogout) return;
  const location = await formatLocationLine(ctx.ip ?? null);
  await sendAlert(
    ctx.user,
    buildLogoutAlertText({
      ip: ctx.ip ?? null,
      location,
      userAgent: ctx.userAgent ?? null,
      occurredAt: new Date(),
    }),
  );
};

export const notifyAllOtherSessionsRevoked = async (ctx: AlertContext) => {
  if (!isMasterEnabled(ctx.user)) return;
  if (!ctx.user.securityAlertSessionRevoke) return;
  await sendAlert(ctx.user, buildAllOtherSessionsRevokedText(new Date()));
};
