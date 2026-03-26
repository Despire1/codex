import {
  HomeworkAssignment,
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
import {
  HomeworkEditorDraft,
  HomeworkTemplateEditorDraft,
} from '../types';

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
  allowFiles: false,
  allowPhotos: false,
  allowDocuments: false,
  allowAudio: false,
  allowVideo: false,
  allowVoice: true,
});

export const createInitialTemplateEditorDraft = (): HomeworkTemplateEditorDraft => ({
  title: '',
  tagsText: '',
  subject: '',
  level: '',
  blocks: [createTextBlock()],
});

export const createInitialHomeworkEditorDraft = (): HomeworkEditorDraft => ({
  title: '',
  blocks: [createTextBlock()],
  assignment: {
    studentId: null,
    lessonId: null,
    groupId: null,
    deadlineAt: null,
    sendMode: 'MANUAL',
    sourceTemplateId: null,
  },
  template: {
    tagsText: '',
    subject: '',
    level: '',
  },
});

export const createTemplateEditorDraftFromTemplate = (template: HomeworkTemplate): HomeworkTemplateEditorDraft => ({
  title: template.title ?? '',
  tagsText: (template.tags ?? []).join(', '),
  subject: template.subject ?? '',
  level: template.level ?? '',
  blocks: Array.isArray(template.blocks) && template.blocks.length ? template.blocks : [createTextBlock()],
});

export const createHomeworkEditorDraftFromTemplate = (
  template: HomeworkTemplate,
  overrides?: Partial<HomeworkEditorDraft['assignment']>,
): HomeworkEditorDraft => ({
  title: template.title ?? '',
  blocks: Array.isArray(template.blocks) && template.blocks.length ? template.blocks : [createTextBlock()],
  assignment: {
    ...createInitialHomeworkEditorDraft().assignment,
    ...overrides,
    sourceTemplateId: template.id,
  },
  template: {
    tagsText: (template.tags ?? []).join(', '),
    subject: template.subject ?? '',
    level: template.level ?? '',
  },
});

export const createHomeworkEditorDraftFromAssignment = (
  assignment: HomeworkAssignment,
  template?: HomeworkTemplate | null,
): HomeworkEditorDraft => ({
  title: assignment.title ?? '',
  blocks:
    Array.isArray(assignment.contentSnapshot) && assignment.contentSnapshot.length
      ? assignment.contentSnapshot
      : [createTextBlock()],
  assignment: {
    studentId: assignment.studentId,
    lessonId: assignment.lessonId ?? null,
    groupId: assignment.groupId ?? null,
    deadlineAt: assignment.deadlineAt ?? null,
    sendMode: assignment.sendMode,
    sourceTemplateId: assignment.templateId ?? null,
  },
  template: {
    tagsText: (template?.tags ?? []).join(', '),
    subject: template?.subject ?? '',
    level: template?.level ?? '',
  },
});

export const projectHomeworkEditorToTemplateDraft = (draft: HomeworkEditorDraft): HomeworkTemplateEditorDraft => ({
  title: draft.title,
  tagsText: draft.template.tagsText,
  subject: draft.template.subject,
  level: draft.template.level,
  blocks: draft.blocks,
});

export const applyTemplateDraftToHomeworkEditorDraft = (
  currentDraft: HomeworkEditorDraft,
  templateDraft: HomeworkTemplateEditorDraft,
): HomeworkEditorDraft => ({
  ...currentDraft,
  title: templateDraft.title,
  blocks: templateDraft.blocks,
  template: {
    tagsText: templateDraft.tagsText,
    subject: templateDraft.subject,
    level: templateDraft.level,
  },
});
