const truncate = (value: string | null | undefined, max = 96) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};

export const formatDisplayIp = (ip: string | null | undefined): string | null => {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;

  const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(trimmed);
  if (v4Mapped) return v4Mapped[1] ?? null;

  if (trimmed === '::1' || trimmed === '127.0.0.1') return 'локальное устройство';
  if (trimmed === '::' || trimmed === '0.0.0.0') return null;
  if (trimmed.toLowerCase() === 'unknown') return null;

  return trimmed;
};

export const describeUserAgent = (userAgent: string | null | undefined) => {
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
