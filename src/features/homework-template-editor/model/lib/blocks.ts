import {
  HomeworkBlock,
  HomeworkBlockMedia,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkBlockText,
  HomeworkTemplate,
  HomeworkTestMatchingPair,
  HomeworkTestOption,
  HomeworkTestQuestion,
  HomeworkTestQuestionType,
} from '../../../../entities/types';
import { HomeworkTemplateEditorDraft } from '../types';

export const createHomeworkBlockId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const createTextBlock = (): HomeworkBlockText => ({
  id: createHomeworkBlockId(),
  type: 'TEXT',
  content: '',
});

export const createMediaBlock = (): HomeworkBlockMedia => ({
  id: createHomeworkBlockId(),
  type: 'MEDIA',
  attachments: [],
});

const createOption = (): HomeworkTestOption => ({
  id: createHomeworkBlockId(),
  text: '',
});

const createMatchingPair = (): HomeworkTestMatchingPair => ({
  id: createHomeworkBlockId(),
  left: '',
  right: '',
});

export const createTestQuestion = (type: HomeworkTestQuestionType = 'SINGLE_CHOICE'): HomeworkTestQuestion => {
  if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
    return {
      id: createHomeworkBlockId(),
      type,
      prompt: '',
      options: [createOption(), createOption()],
      correctOptionIds: [],
      explanation: null,
      points: null,
    };
  }
  if (type === 'SHORT_ANSWER') {
    return {
      id: createHomeworkBlockId(),
      type,
      prompt: '',
      acceptedAnswers: [],
      explanation: null,
      points: null,
    };
  }
  return {
    id: createHomeworkBlockId(),
    type: 'MATCHING',
    prompt: '',
    matchingPairs: [createMatchingPair(), createMatchingPair()],
    explanation: null,
    points: null,
  };
};

export const createTestBlock = (): HomeworkBlockTest => ({
  id: createHomeworkBlockId(),
  type: 'TEST',
  title: '',
  questions: [createTestQuestion('SINGLE_CHOICE')],
});

export const createStudentResponseBlock = (): HomeworkBlockStudentResponse => ({
  id: createHomeworkBlockId(),
  type: 'STUDENT_RESPONSE',
  allowText: true,
  allowFiles: true,
  allowPhotos: true,
  allowDocuments: true,
  allowAudio: true,
  allowVideo: true,
  allowVoice: true,
});

export const createInitialTemplateEditorDraft = (): HomeworkTemplateEditorDraft => ({
  title: '',
  tagsText: '',
  subject: '',
  level: '',
  blocks: [createTextBlock(), createStudentResponseBlock()],
});

export const createTemplateEditorDraftFromTemplate = (template: HomeworkTemplate): HomeworkTemplateEditorDraft => ({
  title: template.title ?? '',
  tagsText: (template.tags ?? []).join(', '),
  subject: template.subject ?? '',
  level: template.level ?? '',
  blocks: Array.isArray(template.blocks) && template.blocks.length ? template.blocks : [createStudentResponseBlock()],
});

export const ensureTemplateHasStudentResponseBlock = (blocks: HomeworkBlock[]) => {
  const hasStudentResponse = blocks.some((block) => block.type === 'STUDENT_RESPONSE');
  if (hasStudentResponse) return blocks;
  return [...blocks, createStudentResponseBlock()];
};
