import type { IncomingMessage, ServerResponse } from 'node:http';

type BuildCookieOptions = {
  maxAgeSeconds?: number;
  secure?: boolean;
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

export const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as Record<string, unknown>;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON body');
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
