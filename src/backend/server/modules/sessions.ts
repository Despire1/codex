import type { IncomingMessage } from 'node:http';
import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { notifyAllOtherSessionsRevoked } from './securityAlerts';

type SessionServiceDeps = {
  getSessionTokenHash: (req: IncomingMessage) => string | null;
};

export const createSessionService = ({ getSessionTokenHash }: SessionServiceDeps) => {
  const listSessions = async (user: User, req: IncomingMessage) => {
    const tokenHash = getSessionTokenHash(req);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt ?? session.createdAt,
        ip: session.ip,
        userAgent: session.userAgent,
        isCurrent: tokenHash ? session.tokenHash === tokenHash : false,
      })),
    };
  };

  const revokeSession = async (user: User, sessionId: number) => {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== user.id) {
      throw new Error('Сессия не найдена');
    }
    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    return { status: 'ok', sessionId: updated.id };
  };

  const revokeOtherSessions = async (user: User, req: IncomingMessage) => {
    const tokenHash = getSessionTokenHash(req);
    const result = await prisma.session.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      void notifyAllOtherSessionsRevoked({
        user: {
          id: user.id,
          telegramUserId: user.telegramUserId,
          securityAlertsEnabled: user.securityAlertsEnabled,
          securityAlertNewDevice: user.securityAlertNewDevice,
          securityAlertLogout: user.securityAlertLogout,
          securityAlertSessionRevoke: user.securityAlertSessionRevoke,
        },
      }).catch((error) => {
        console.warn('Failed to dispatch revoke alert', error);
      });
    }
    return { status: 'ok', revoked: result.count };
  };

  return {
    listSessions,
    revokeSession,
    revokeOtherSessions,
  };
};
