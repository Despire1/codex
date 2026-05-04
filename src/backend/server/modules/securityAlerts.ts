import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { sendTelegramMessage } from '../../notificationService';
import { formatLocation, lookupIpLocation } from '../lib/geoIp';
import { describeUserAgent, formatDisplayIp } from '../../../shared/lib/sessionDisplay';
import { escapeHtml } from '../../../shared/lib/htmlEscape';

const formatDateRu = (date: Date) =>
  date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
}) => {
  const ipDisplay = formatDisplayIp(params.ip);
  return [
    '<b>Новый вход в аккаунт</b>',
    '',
    `Время: ${formatDateRu(params.occurredAt)}`,
    `Устройство: ${escapeHtml(describeUserAgent(params.userAgent))}`,
    params.location ? `Местоположение: ${escapeHtml(params.location)}` : null,
    ipDisplay ? `IP: ${escapeHtml(ipDisplay)}` : null,
    '',
    'Если это были не Вы — закройте все сессии.',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildLogoutAlertText = (params: {
  ip: string | null;
  location: string | null;
  userAgent: string | null;
  occurredAt: Date;
}) => {
  const ipDisplay = formatDisplayIp(params.ip);
  return [
    '<b>Выход из аккаунта</b>',
    '',
    `Время: ${formatDateRu(params.occurredAt)}`,
    `Устройство: ${escapeHtml(describeUserAgent(params.userAgent))}`,
    params.location ? `Местоположение: ${escapeHtml(params.location)}` : null,
    ipDisplay ? `IP: ${escapeHtml(ipDisplay)}` : null,
    '',
    'Если выходили не Вы — войдите снова и закройте сессии в «Настройки → Безопасность».',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildAllOtherSessionsRevokedText = (occurredAt: Date) =>
  [
    '<b>Сессии завершены</b>',
    '',
    `Время: ${formatDateRu(occurredAt)}`,
    'На этом устройстве Вы остаётесь, остальные разлогинены.',
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
      inlineKeyboard: [[{ text: 'Это не я — закрыть все сессии', callback_data: `security_revoke_${ctx.sessionId}` }]],
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
