import { HomeworkAssignment, HomeworkBlockStudentResponse } from '../../../types';

export type AssignmentResponseConfig = {
  hasTest: boolean;
  hasStudentResponse: boolean;
  allowText: boolean;
  allowFiles: boolean;
  allowPhotos: boolean;
  allowDocuments: boolean;
  allowAudio: boolean;
  allowVideo: boolean;
  allowVoice: boolean;
  allowsAnyManualResponse: boolean;
  canSubmit: boolean;
  attachmentAccept: string | undefined;
};

const responseFieldKeys: Array<keyof Omit<HomeworkBlockStudentResponse, 'id' | 'type'>> = [
  'allowText',
  'allowFiles',
  'allowPhotos',
  'allowDocuments',
  'allowAudio',
  'allowVideo',
  'allowVoice',
];

const resolveAttachmentAccept = (config: Omit<AssignmentResponseConfig, 'attachmentAccept'>) => {
  if (config.allowFiles) return undefined;

  const mime: string[] = [];
  if (config.allowPhotos) mime.push('image/*');
  if (config.allowAudio) mime.push('audio/*');
  if (config.allowVideo) mime.push('video/*');
  if (config.allowDocuments) {
    mime.push('.pdf', '.doc', '.docx', '.txt', '.rtf', '.ppt', '.pptx', '.xls', '.xlsx');
  }
  return mime.length ? mime.join(',') : undefined;
};

export const resolveAssignmentResponseConfig = (assignment: HomeworkAssignment): AssignmentResponseConfig => {
  const responseBlocks = assignment.contentSnapshot.filter(
    (block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE',
  );
  const hasTest = assignment.contentSnapshot.some((block) => block.type === 'TEST' && (block.questions?.length ?? 0) > 0);

  const merged = responseFieldKeys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = responseBlocks.some((block) => Boolean(block[key]));
    return acc;
  }, {});

  const base = {
    hasTest,
    hasStudentResponse: responseBlocks.length > 0,
    allowText: Boolean(merged.allowText),
    allowFiles: Boolean(merged.allowFiles),
    allowPhotos: Boolean(merged.allowPhotos),
    allowDocuments: Boolean(merged.allowDocuments),
    allowAudio: Boolean(merged.allowAudio),
    allowVideo: Boolean(merged.allowVideo),
    allowVoice: Boolean(merged.allowVoice),
    allowsAnyManualResponse:
      Boolean(merged.allowText) ||
      Boolean(merged.allowFiles) ||
      Boolean(merged.allowPhotos) ||
      Boolean(merged.allowDocuments) ||
      Boolean(merged.allowAudio) ||
      Boolean(merged.allowVideo) ||
      Boolean(merged.allowVoice),
    canSubmit:
      hasTest ||
      Boolean(merged.allowText) ||
      Boolean(merged.allowFiles) ||
      Boolean(merged.allowPhotos) ||
      Boolean(merged.allowDocuments) ||
      Boolean(merged.allowAudio) ||
      Boolean(merged.allowVideo) ||
      Boolean(merged.allowVoice),
  };

  return {
    ...base,
    attachmentAccept: resolveAttachmentAccept(base),
  };
};
