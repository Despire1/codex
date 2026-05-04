export type FileLimitContext =
  | 'lesson'
  | 'series'
  | 'homeworkTemplate'
  | 'homeworkSubmission'
  | 'homeworkSubmissionVoice';

export const FILE_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxStorageBytesPerUser: 2 * 1024 * 1024 * 1024,
  maxFilesPerLesson: 5,
  maxFilesPerSeries: 5,
  maxFilesPerHomeworkTemplate: 5,
  maxFilesPerHomeworkAssignment: 5,
  maxFilesPerSubmission: 5,
  maxVoiceFilesPerSubmission: 5,
} as const;

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export const FILE_ACCEPT_ATTRIBUTE =
  '.pdf,.doc,.docx,.odt,.rtf,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov';

export const FILE_HINT_TEXT = 'PDF, DOC, JPG, PNG, MP3, MP4 до 25 МБ';

export const isMimeAllowed = (mime: string | null | undefined): boolean => {
  if (!mime) return false;
  return ALLOWED_MIME_TYPES.has(mime.trim().toLowerCase());
};

export const getMaxFilesForContext = (ctx: FileLimitContext): number => {
  switch (ctx) {
    case 'lesson':
      return FILE_LIMITS.maxFilesPerLesson;
    case 'series':
      return FILE_LIMITS.maxFilesPerSeries;
    case 'homeworkTemplate':
      return FILE_LIMITS.maxFilesPerHomeworkTemplate;
    case 'homeworkSubmission':
      return FILE_LIMITS.maxFilesPerSubmission;
    case 'homeworkSubmissionVoice':
      return FILE_LIMITS.maxVoiceFilesPerSubmission;
  }
};

const formatMb = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} МБ` : `${mb.toFixed(1).replace(/\.0$/, '')} МБ`;
};

const formatGb = (bytes: number) => {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 10 ? `${Math.round(gb)} ГБ` : `${gb.toFixed(1).replace(/\.0$/, '')} ГБ`;
};

const upgradeHint = 'Расширенные лимиты будут доступны в будущих тарифах.';

export const FILE_LIMIT_MESSAGES = {
  fileTooLarge: (maxBytes = FILE_LIMITS.maxFileBytes) =>
    `Файл слишком большой. Максимум ${formatMb(maxBytes)} на файл. ${upgradeHint}`,
  tooManyFiles: (ctx: FileLimitContext, max = getMaxFilesForContext(ctx)) => {
    const where =
      ctx === 'lesson'
        ? 'на урок'
        : ctx === 'series'
          ? 'на серию уроков'
          : ctx === 'homeworkTemplate'
            ? 'в материалах ДЗ'
            : ctx === 'homeworkSubmissionVoice'
              ? 'голосовых на одну попытку'
              : 'в одной попытке ДЗ';
    return `Достигнут лимит: максимум ${max} файлов ${where}. ${upgradeHint}`;
  },
  storageQuotaExceeded: (quotaBytes = FILE_LIMITS.maxStorageBytesPerUser, usedBytes?: number) => {
    const used = typeof usedBytes === 'number' ? ` (использовано ${formatGb(usedBytes)})` : '';
    return `Закончилось место в хранилище: ${formatGb(quotaBytes)}${used}. Удалите неиспользуемые материалы. ${upgradeHint}`;
  },
  unsupportedMime: () => 'Этот тип файла не поддерживается.',
} as const;

export const formatBytesShort = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 КБ';
  if (bytes >= 1024 * 1024 * 1024) return formatGb(bytes);
  if (bytes >= 1024 * 1024) return formatMb(bytes);
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} КБ`;
};
