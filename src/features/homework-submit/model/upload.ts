import { HomeworkAttachment } from '../../../entities/types';
import { api } from '../../../shared/api/client';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();

const createAttachmentId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const resolveBaseUrl = () => {
  if (API_BASE) return API_BASE;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};

const normalizeContentType = (value: string | null | undefined) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'application/octet-stream';
  const [mime = ''] = raw.split(';');
  const normalized = mime.trim();
  if (!normalized || !normalized.includes('/')) return 'application/octet-stream';
  return normalized;
};

export const resolveHomeworkStorageUrl = (value: string) => {
  if (!value) return value;
  if (isAbsoluteUrl(value) || value.startsWith('blob:') || value.startsWith('data:')) return value;
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

export const uploadFileToHomeworkStorage = async (
  file: File,
  scope: 'homework-student-attachment' | 'homework-student-voice' = 'homework-student-attachment',
): Promise<HomeworkAttachment> => {
  const contentType = normalizeContentType(file.type);
  let presign: Awaited<ReturnType<typeof api.createFilePresignV2>>;
  try {
    presign = await api.createFilePresignV2({
      fileName: file.name,
      contentType,
      size: file.size,
      scope,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'presign_request_failed';
    throw new Error(`presign_failed:${message}`);
  }

  const headers = new Headers(presign.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  let response: Response;
  try {
    response = await fetch(resolveHomeworkStorageUrl(presign.uploadUrl), {
      method: presign.method,
      headers,
      body: file,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upload_network_failed';
    throw new Error(`upload_failed:${message}`);
  }
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `upload_failed_${response.status}`);
  }

  return {
    id: createAttachmentId(),
    fileName: file.name,
    size: file.size,
    url: resolveHomeworkStorageUrl(presign.fileUrl),
    status: 'ready',
  };
};
