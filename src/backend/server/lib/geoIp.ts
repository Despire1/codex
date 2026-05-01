type GeoInfo = {
  city?: string;
  region?: string;
  country?: string;
};

const FETCH_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;
const ENDPOINT = 'https://ipinfo.io';

const cache = new Map<string, { result: GeoInfo | null; expiresAt: number }>();

const isPrivateIp = (ip: string): boolean => {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!normalized) return true;
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  if (/^fc00:/i.test(normalized) || /^fd[0-9a-f]{2}:/i.test(normalized)) return true;
  return false;
};

const COUNTRY_NAMES: Record<string, string> = {
  RU: 'Россия',
  BY: 'Беларусь',
  UA: 'Украина',
  KZ: 'Казахстан',
  KG: 'Кыргызстан',
  UZ: 'Узбекистан',
  AM: 'Армения',
  GE: 'Грузия',
  AZ: 'Азербайджан',
  TJ: 'Таджикистан',
  MD: 'Молдова',
  US: 'США',
  GB: 'Великобритания',
  DE: 'Германия',
  FR: 'Франция',
  IT: 'Италия',
  ES: 'Испания',
  PL: 'Польша',
  TR: 'Турция',
  CN: 'Китай',
  JP: 'Япония',
  KR: 'Южная Корея',
  IN: 'Индия',
  CA: 'Канада',
  BR: 'Бразилия',
  AU: 'Австралия',
  TH: 'Таиланд',
  VN: 'Вьетнам',
  AE: 'ОАЭ',
  IL: 'Израиль',
  CY: 'Кипр',
  RS: 'Сербия',
  ME: 'Черногория',
  CZ: 'Чехия',
  PT: 'Португалия',
  NL: 'Нидерланды',
  FI: 'Финляндия',
  SE: 'Швеция',
  NO: 'Норвегия',
  EE: 'Эстония',
  LV: 'Латвия',
  LT: 'Литва',
};

const expandCountry = (code: string | undefined) => {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] ?? upper;
};

export const lookupIpLocation = async (ip: string | null | undefined): Promise<GeoInfo | null> => {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed || isPrivateIp(trimmed)) return null;

  const cached = cache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const cacheResult = (result: GeoInfo | null) => {
    cache.set(trimmed, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(trimmed)}/json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return cacheResult(null);
    }
    const data = (await response.json()) as { city?: string; region?: string; country?: string };
    if (!data || (typeof data.city !== 'string' && typeof data.country !== 'string')) {
      return cacheResult(null);
    }
    return cacheResult({
      city: typeof data.city === 'string' && data.city.trim() ? data.city.trim() : undefined,
      region: typeof data.region === 'string' && data.region.trim() ? data.region.trim() : undefined,
      country: typeof data.country === 'string' && data.country.trim() ? data.country.trim() : undefined,
    });
  } catch (_error) {
    return cacheResult(null);
  } finally {
    clearTimeout(timeout);
  }
};

export const formatLocation = (geo: GeoInfo | null | undefined) => {
  if (!geo) return null;
  const country = expandCountry(geo.country);
  const city = geo.city;
  const parts: string[] = [];
  if (city) parts.push(city);
  if (country && country !== city) parts.push(country);
  return parts.length > 0 ? parts.join(', ') : null;
};
