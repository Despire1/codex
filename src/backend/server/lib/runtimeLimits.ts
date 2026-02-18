type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export const isRateLimited = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (existing.count >= limit) return true;
  existing.count += 1;
  return false;
};

export const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const isValidTimeString = (value: string) => /^\d{2}:\d{2}$/.test(value);
