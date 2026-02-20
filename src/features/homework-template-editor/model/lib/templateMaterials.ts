import { HomeworkAttachment } from '../../../../entities/types';

export type TemplateMaterialKind = 'pdf' | 'word' | 'image' | 'audio' | 'video' | 'link' | 'file';

export const MAX_TEMPLATE_MATERIAL_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const TEMPLATE_MATERIAL_FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.mp3,.mp4';
export const TEMPLATE_MATERIAL_FILE_HINT = 'PDF, DOC, JPG, PNG, MP3, MP4 до 50MB';

const HTTP_PROTOCOL_REGEXP = /^https?:\/\//i;
const EXTENSION_REGEXP = /\.([a-z0-9]{1,10})$/i;

const WORD_EXTENSIONS = new Set(['doc', 'docx', 'odt', 'rtf']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v']);

const createAttachmentId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const parseHttpUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
};

const normalizeUrlInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const prepared = HTTP_PROTOCOL_REGEXP.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = parseHttpUrl(prepared);
  if (!parsed) return null;
  return parsed.toString();
};

const extractExtension = (value: string): string | null => {
  const match = value.trim().toLowerCase().match(EXTENSION_REGEXP);
  return match?.[1] ?? null;
};

const getPathTail = (value: string): string => {
  const url = parseHttpUrl(value.trim());
  if (!url) return '';
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) return '';
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return parts[parts.length - 1];
  }
};

const prettifyText = (value: string) =>
  value
    .replace(/\.[a-z0-9]{1,10}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

const resolveFromUrlName = (url: string): string => {
  const pathTail = getPathTail(url);
  if (pathTail) {
    const pretty = prettifyText(pathTail);
    if (pretty) return pretty;
    return pathTail;
  }
  const parsed = parseHttpUrl(url.trim());
  if (!parsed) return url;
  return parsed.hostname.replace(/^www\./i, '');
};

const resolveExtensionFromAttachment = (attachment: HomeworkAttachment): string | null => {
  const fileName = attachment.fileName?.trim();
  if (fileName && fileName !== attachment.url?.trim()) {
    const fileNameExt = extractExtension(fileName);
    if (fileNameExt) return fileNameExt;
  }

  const fromPath = getPathTail(attachment.url ?? '');
  if (fromPath) {
    const pathExt = extractExtension(fromPath);
    if (pathExt) return pathExt;
  }

  return null;
};

export const isTemplateMaterialExternalLink = (attachment: HomeworkAttachment): boolean => {
  const url = attachment.url?.trim() ?? '';
  if (!parseHttpUrl(url)) return false;
  if (Number(attachment.size) > 0) return false;
  const fileName = attachment.fileName?.trim() ?? '';
  return !fileName || fileName === url;
};

export const resolveTemplateMaterialKind = (attachment: HomeworkAttachment): TemplateMaterialKind => {
  if (isTemplateMaterialExternalLink(attachment)) return 'link';
  const extension = resolveExtensionFromAttachment(attachment);
  if (!extension) return 'file';
  if (extension === 'pdf') return 'pdf';
  if (WORD_EXTENSIONS.has(extension)) return 'word';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'file';
};

export const resolveTemplateMaterialDisplayName = (attachment: HomeworkAttachment): string => {
  if (isTemplateMaterialExternalLink(attachment)) return resolveFromUrlName(attachment.url);
  const fileName = attachment.fileName?.trim();
  if (fileName) return fileName;
  const resolved = resolveFromUrlName(attachment.url);
  return resolved || 'Файл';
};

export const resolveTemplateMaterialLinkSubtitle = (attachment: HomeworkAttachment): string => {
  const value = attachment.url?.trim();
  return value || 'Ссылка';
};

export const formatTemplateMaterialSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  const kb = Math.max(1, Math.round(size / 1024));
  return `${kb} KB`;
};

export const formatTemplateMaterialAddedAt = (
  addedAt: number | undefined,
  kind: TemplateMaterialKind,
  now = Date.now(),
): string => {
  const prefix = kind === 'link' ? 'Добавлено' : 'Загружен';
  if (!addedAt || !Number.isFinite(addedAt)) return `${prefix} недавно`;

  const deltaMs = Math.max(0, now - addedAt);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) return `${prefix} только что`;
  if (deltaMs < hour) return `${prefix} ${Math.max(1, Math.round(deltaMs / minute))} мин назад`;
  if (deltaMs < day) return `${prefix} ${Math.max(1, Math.round(deltaMs / hour))} ч назад`;
  if (deltaMs < day * 2) return `${prefix} вчера`;
  return `${prefix} ${Math.max(2, Math.round(deltaMs / day))} дн назад`;
};

export const createAttachmentFromUrl = (value: string): HomeworkAttachment | null => {
  const normalized = normalizeUrlInput(value);
  if (!normalized) return null;
  return {
    id: createAttachmentId(),
    url: normalized,
    fileName: normalized,
    size: 0,
    status: 'ready',
  };
};
