import type { IncomingMessage, ServerResponse } from 'node:http';
import prisma from '../../prismaClient';
import { badRequest, getBaseUrl, getRequestIp, readBody, sendJson } from '../lib/http';
import { clampNumber, isRateLimited } from '../lib/runtimeLimits';
import { hashToken, randomToken } from '../modules/auth';

type SessionUserLike = {
  id: number;
};

type CreateSession = (userId: number, req: IncomingMessage, res: ServerResponse) => Promise<{ expiresAt: Date }>;
type GetSessionUser = (req: IncomingMessage) => Promise<SessionUserLike | null>;

type AuthTransferHandlersConfig = {
  createSession: CreateSession;
  getSessionUser: GetSessionUser;
  port: number;
  transferRedirectUrl: string;
  transferTokenTtlSec: number;
  transferTokenMinTtlSec: number;
  transferTokenMaxTtlSec: number;
  rateLimitTransferCreatePerMin: number;
  rateLimitTransferCreateIpPerMin: number;
  rateLimitTransferConsumeIpPerMin: number;
  rateLimitTransferConsumeTokenPerMin: number;
};

export const createAuthTransferHandlers = (config: AuthTransferHandlersConfig) => {
  const handleCreate = async (req: IncomingMessage, res: ServerResponse) => {
    const user = await config.getSessionUser(req);
    if (!user) return sendJson(res, 401, { message: 'unauthorized' });

    const ip = getRequestIp(req);
    if (isRateLimited(`transfer:create:ip:${ip}`, config.rateLimitTransferCreateIpPerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }
    if (isRateLimited(`transfer:create:${user.id}`, config.rateLimitTransferCreatePerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const configuredTtlSec = Number.isFinite(config.transferTokenTtlSec) ? config.transferTokenTtlSec : 120;
    const ttlSeconds = clampNumber(configuredTtlSec, config.transferTokenMinTtlSec, config.transferTokenMaxTtlSec);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await prisma.transferToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdIp: getRequestIp(req) || null,
        createdUserAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      },
    });

    const baseUrl = getBaseUrl(req, config.port);
    const transferUrl = new URL(baseUrl);
    if (transferUrl.hostname === 'localhost' || transferUrl.hostname === '127.0.0.1') {
      transferUrl.protocol = 'http:';
      transferUrl.port = '5173';
    }
    const url = `${transferUrl.toString().replace(/\/$/, '')}/transfer?t=${token}`;
    return sendJson(res, 200, { url, expires_in: ttlSeconds });
  };

  const handleConsume = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token) return badRequest(res, 'invalid_token');

    const ip = getRequestIp(req);
    if (isRateLimited(`transfer:consume:ip:${ip}`, config.rateLimitTransferConsumeIpPerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }
    if (isRateLimited(`transfer:consume:token:${token}`, config.rateLimitTransferConsumeTokenPerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }

    const tokenHash = hashToken(token);
    const record = await prisma.transferToken.findFirst({ where: { tokenHash } });
    if (!record) {
      return badRequest(res, 'invalid_token');
    }
    if (record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return sendJson(res, 410, { message: 'token_expired_or_used' });
    }

    const consumeResult = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.transferToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gte: new Date() } },
        data: { usedAt: new Date() },
      });
      if (updateResult.count === 0) {
        return false;
      }
      await tx.transferToken.deleteMany({ where: { id: record.id } });
      return true;
    });

    if (!consumeResult) {
      return sendJson(res, 410, { message: 'token_expired_or_used' });
    }

    const session = await config.createSession(record.userId, req, res);
    return sendJson(res, 200, { redirect_url: config.transferRedirectUrl, session: { expiresAt: session.expiresAt } });
  };

  return {
    handleConsume,
    handleCreate,
  };
};
