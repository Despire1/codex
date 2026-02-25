import type { IncomingMessage, ServerResponse } from 'node:http';

type BuildCookieOptions = {
  maxAgeSeconds?: number;
  secure?: boolean;
};

type ReadRawBodyOptions = {
  maxBytes?: number;
};

type ReadBodyOptions = ReadRawBodyOptions & {
  requireJsonContentType?: boolean;
};

const DEFAULT_JSON_BODY_LIMIT_BYTES = (() => {
  const parsed = Number(process.env.API_JSON_BODY_LIMIT_BYTES ?? 1_048_576);
  if (!Number.isFinite(parsed)) return 1_048_576;
  return Math.min(Math.max(Math.trunc(parsed), 1_024), 20 * 1024 * 1024);
})();

const resolveMaxBytes = (maxBytes?: number) => {
  if (!Number.isFinite(maxBytes)) return DEFAULT_JSON_BODY_LIMIT_BYTES;
  return Math.max(1_024, Math.trunc(maxBytes as number));
};

const getSingleHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const isJsonContentType = (value: string) => {
  const normalized = value.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return normalized === 'application/json' || normalized.endsWith('+json');
};

const createHttpBodyError = (message: string, statusCode: number) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

export const serializeBigInt = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  );

export const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(JSON.stringify(serializeBigInt(payload)));
};

export const notFound = (res: ServerResponse) => sendJson(res, 404, { message: 'Not found' });

export const badRequest = (res: ServerResponse, message: string) => sendJson(res, 400, { message });

export const readRawBody = async (req: IncomingMessage, options: ReadRawBodyOptions = {}) => {
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += normalizedChunk.length;
    if (totalBytes > maxBytes) {
      throw createHttpBodyError('payload_too_large', 413);
    }
    chunks.push(normalizedChunk);
  }
  return Buffer.concat(chunks, totalBytes);
};

export const readBody = async (req: IncomingMessage, options: ReadBodyOptions = {}) => {
  const requireJsonContentType = options.requireJsonContentType ?? true;
  const rawBuffer = await readRawBody(req, { maxBytes: options.maxBytes });
  if (rawBuffer.length === 0) return {} as Record<string, unknown>;

  if (requireJsonContentType) {
    const contentType = getSingleHeader(req.headers['content-type']).trim();
    if (contentType && !isJsonContentType(contentType)) {
      throw createHttpBodyError('unsupported_media_type', 415);
    }
  }

  const raw = rawBuffer.toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpBodyError('invalid_json_body', 400);
  }
};

export const parseCookies = (header?: string) => {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return;
    cookies[rawKey] = decodeURIComponent(rawValue.join('='));
  });
  return cookies;
};

export const buildCookie = (name: string, value: string, options: BuildCookieOptions = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure ?? true) {
    segments.push('Secure');
  }
  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  return segments.join('; ');
};

export const getRequestIp = (req: IncomingMessage) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? '';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? '';
  }
  return req.socket.remoteAddress ?? '';
};

const getForwardedHost = (req: IncomingMessage) => {
  const forwardedHost = req.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string') {
    return forwardedHost.split(',')[0]?.trim() ?? '';
  }
  if (Array.isArray(forwardedHost)) {
    return forwardedHost[0] ?? '';
  }
  return '';
};

export const getBaseUrl = (req: IncomingMessage, fallbackPort: number) => {
  const configured = process.env.APP_BASE_URL ?? process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const forwardedHost = getForwardedHost(req);
  const host = forwardedHost || req.headers.host || `localhost:${fallbackPort}`;
  const isLocalhost = host.includes('localhost') || host.startsWith('127.0.0.1');
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : '';
  const forwardedProtocol = forwardedProto.split(',')[0];
  const protocol = isLocalhost ? 'http' : forwardedProtocol || 'https';
  return `${protocol}://${host}`;
};

export const isLocalhostRequest = (req: IncomingMessage) => {
  const forwardedHost = getForwardedHost(req);
  const host = forwardedHost || req.headers.host || '';
  return host.includes('localhost') || host.startsWith('127.0.0.1');
};

export const isSecureRequest = (req: IncomingMessage) => {
  const isLocalhost = isLocalhostRequest(req);
  if (isLocalhost) return false;
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : '';
  const forwardedProtocol = forwardedProto.split(',')[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === 'https';
  return true;
};
