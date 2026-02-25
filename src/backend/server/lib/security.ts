import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { isLocalhostRequest, isSecureRequest } from './http';

const DEFAULT_CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_CORS_HEADERS = 'Content-Type, X-User-Role, X-Student-Id, X-Teacher-Id';
const DEFAULT_HSTS_MAX_AGE_SEC = 15_552_000;

type SecurityConfig = {
  allowedOrigins: Set<string>;
  enforceMutationOriginCheck: boolean;
  allowMissingOrigin: boolean;
  corsAllowMethods: string;
  corsAllowHeaders: string;
  corsMaxAgeSec: number;
  hstsMaxAgeSec: number;
  yookassaWebhookRequireAuth: boolean;
  yookassaShopId: string;
  yookassaSecretKey: string;
};

const getSingleHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getForwardedHeaderValue = (value: string) => value.split(',')[0]?.trim() ?? '';

const parseCsv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeOrigin = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
};

const parseNumber = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
};

const addOriginIfValid = (set: Set<string>, value: string | undefined) => {
  const origin = normalizeOrigin(value ?? '');
  if (origin) set.add(origin);
};

const resolveRequestHost = (req: IncomingMessage) => {
  const forwardedHost = getForwardedHeaderValue(getSingleHeader(req.headers['x-forwarded-host']));
  if (forwardedHost) return forwardedHost.toLowerCase();
  return getSingleHeader(req.headers.host).trim().toLowerCase();
};

const isSameHostOrigin = (req: IncomingMessage, origin: string) => {
  const requestHost = resolveRequestHost(req);
  if (!requestHost) return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
};

const appendVaryHeader = (res: ServerResponse, value: string) => {
  const existing = res.getHeader('Vary');
  const parts = new Set(
    (Array.isArray(existing) ? existing.join(',') : typeof existing === 'string' ? existing : '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  parts.add(value);
  res.setHeader('Vary', Array.from(parts).join(', '));
};

const safeEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const isMutationMethod = (method: string) => {
  const normalized = method.toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
};

const mutationOriginBypassPaths = [/^\/api\/yookassa\/webhook$/, /^\/api\/v2\/files\/upload\/[a-zA-Z0-9-]+$/];

const buildAllowedOrigins = () => {
  const origins = new Set<string>();

  addOriginIfValid(origins, process.env.APP_BASE_URL);
  addOriginIfValid(origins, process.env.PUBLIC_BASE_URL);
  addOriginIfValid(origins, process.env.TELEGRAM_WEBAPP_URL);
  parseCsv(process.env.CORS_ALLOWED_ORIGINS).forEach((origin) => {
    addOriginIfValid(origins, origin);
  });

  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:4173');
    origins.add('http://127.0.0.1:4173');
  }

  return origins;
};

export const createSecurityConfig = (): SecurityConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    allowedOrigins: buildAllowedOrigins(),
    enforceMutationOriginCheck: parseBoolean(
      process.env.SECURITY_ENFORCE_ORIGIN_CHECK,
      nodeEnv === 'production',
    ),
    allowMissingOrigin: parseBoolean(
      process.env.SECURITY_ALLOW_MISSING_ORIGIN,
      nodeEnv !== 'production',
    ),
    corsAllowMethods: process.env.CORS_ALLOW_METHODS?.trim() || DEFAULT_CORS_METHODS,
    corsAllowHeaders: process.env.CORS_ALLOW_HEADERS?.trim() || DEFAULT_CORS_HEADERS,
    corsMaxAgeSec: parseNumber(process.env.CORS_MAX_AGE_SEC, 600, 0, 86_400),
    hstsMaxAgeSec: parseNumber(process.env.SECURITY_HSTS_MAX_AGE_SEC, DEFAULT_HSTS_MAX_AGE_SEC, 300, 63_072_000),
    yookassaWebhookRequireAuth: parseBoolean(
      process.env.YOOKASSA_WEBHOOK_REQUIRE_AUTH,
      nodeEnv === 'production',
    ),
    yookassaShopId: (process.env.YOOKASSA_SHOP_ID ?? '').trim(),
    yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY ?? '',
  };
};

const setCorsHeaders = (res: ServerResponse, config: SecurityConfig, origin: string) => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', config.corsAllowMethods);
  res.setHeader('Access-Control-Allow-Headers', config.corsAllowHeaders);
  res.setHeader('Access-Control-Max-Age', String(config.corsMaxAgeSec));
  appendVaryHeader(res, 'Origin');
};

export const applyCorsHeaders = (
  req: IncomingMessage,
  res: ServerResponse,
  config: SecurityConfig,
): { allowed: boolean; origin: string | null } => {
  const rawOrigin = getSingleHeader(req.headers.origin).trim();
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) {
    return { allowed: true, origin: null };
  }
  if (!config.allowedOrigins.has(origin) && !isSameHostOrigin(req, origin)) {
    return { allowed: false, origin };
  }
  setCorsHeaders(res, config, origin);
  return { allowed: true, origin };
};

const resolveOriginFromRequest = (req: IncomingMessage) => {
  const origin = normalizeOrigin(getSingleHeader(req.headers.origin).trim());
  if (origin) return origin;
  const refererRaw = getSingleHeader(req.headers.referer).trim();
  if (!refererRaw) return null;
  try {
    return new URL(refererRaw).origin;
  } catch {
    return null;
  }
};

export const isMutationOriginValid = (req: IncomingMessage, pathname: string, config: SecurityConfig) => {
  if (!config.enforceMutationOriginCheck) return true;
  if (!isMutationMethod(req.method ?? 'GET')) return true;
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/auth/')) return true;
  if (mutationOriginBypassPaths.some((matcher) => matcher.test(pathname))) return true;

  const origin = resolveOriginFromRequest(req);
  if (!origin) return config.allowMissingOrigin;
  return config.allowedOrigins.has(origin) || isSameHostOrigin(req, origin);
};

export const applySecurityHeaders = (req: IncomingMessage, res: ServerResponse, config: SecurityConfig) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  if (!isLocalhostRequest(req) && isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', `max-age=${config.hstsMaxAgeSec}; includeSubDomains`);
  }
};

export const isYookassaWebhookAuthorized = (req: IncomingMessage, config: SecurityConfig) => {
  if (!config.yookassaWebhookRequireAuth) return true;
  if (!config.yookassaShopId || !config.yookassaSecretKey) return false;

  const authorization = getSingleHeader(req.headers.authorization);
  if (!authorization.startsWith('Basic ')) return false;
  const encodedCredentials = authorization.slice('Basic '.length).trim();
  if (!encodedCredentials) return false;

  let decoded = '';
  try {
    decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex <= 0) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return safeEqual(username, config.yookassaShopId) && safeEqual(password, config.yookassaSecretKey);
};
