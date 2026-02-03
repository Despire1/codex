const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const normalizeEmail = (value?: string | null) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

export const isValidEmail = (value: string) => {
  if (!value) return false;
  if (value.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(value);
};
