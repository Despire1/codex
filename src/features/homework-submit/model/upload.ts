import { HomeworkAttachment } from '../../../entities/types';
import { api } from '../../../shared/api/client';

const createAttachmentId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const uploadFileToHomeworkStorage = async (
  file: File,
  scope: 'homework-student-attachment' | 'homework-student-voice' = 'homework-student-attachment',
): Promise<HomeworkAttachment> => {
  const presign = await api.createFilePresignV2({
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    scope,
  });

  const response = await fetch(presign.uploadUrl, {
    method: presign.method,
    headers: {
      ...presign.headers,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error('Не удалось загрузить файл');
  }

  return {
    id: createAttachmentId(),
    fileName: file.name,
    size: file.size,
    url: presign.fileUrl,
    status: 'ready',
  };
};

