export const MEETING_LINK_MAX_LENGTH = 2048;

const meetingLinkHints = /(meet|zoom|teams|t\.me)/i;

export const looksLikeMeetingLink = (value: string) => value.includes('.') || meetingLinkHints.test(value);

export const normalizeMeetingLinkInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed) && looksLikeMeetingLink(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

export const isValidMeetingLink = (value: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
};
