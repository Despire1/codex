import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createInitialHomeworkEditorDraft } from './blocks';
import {
  areHomeworkEditorDraftsEqual,
  cloneHomeworkEditorDraft,
  resolveOpenedHomeworkEditorDraft,
} from './homeworkEditorDirty';

test('draft equality ignores generated ids and surrounding whitespace', () => {
  const left = {
    ...createInitialHomeworkEditorDraft(),
    title: '  Present Perfect  ',
    blocks: [
      {
        id: 'left-text',
        type: 'TEXT' as const,
        content: '  Fill in the gaps  ',
      },
    ],
    assignment: {
      studentId: 42,
      lessonId: null,
      groupId: null,
      scheduledFor: null,
      deadlineAt: null,
      sendMode: 'MANUAL' as const,
      sourceTemplateId: 7,
    },
    template: {
      tagsText: ' grammar, present perfect ',
      subject: ' English ',
      level: ' A2 ',
      selectedType: 'TEST' as const,
    },
  };

  const right = {
    ...createInitialHomeworkEditorDraft(),
    title: 'Present Perfect',
    blocks: [
      {
        id: 'right-text',
        type: 'TEXT' as const,
        content: 'Fill in the gaps',
      },
    ],
    assignment: {
      studentId: 42,
      lessonId: null,
      groupId: null,
      scheduledFor: null,
      deadlineAt: null,
      sendMode: 'MANUAL' as const,
      sourceTemplateId: 7,
    },
    template: {
      tagsText: 'grammar, present perfect',
      subject: 'English',
      level: 'A2',
      selectedType: 'TEST' as const,
    },
  };

  assert.equal(areHomeworkEditorDraftsEqual(left, right), true);
});

test('opened draft baseline uses restored draft when it exists', () => {
  const sourceDraft = createInitialHomeworkEditorDraft();
  const restoredDraft = {
    ...sourceDraft,
    title: 'Recovered draft',
  };

  assert.equal(resolveOpenedHomeworkEditorDraft(sourceDraft), sourceDraft);
  assert.equal(resolveOpenedHomeworkEditorDraft(sourceDraft, restoredDraft), restoredDraft);
});

test('cloneHomeworkEditorDraft creates an isolated copy', () => {
  const sourceDraft = {
    ...createInitialHomeworkEditorDraft(),
    blocks: [
      {
        id: 'text-block',
        type: 'TEXT' as const,
        content: 'Original content',
      },
    ],
  };

  const clonedDraft = cloneHomeworkEditorDraft(sourceDraft);
  const sourceBlock = sourceDraft.blocks[0];
  const clonedBlock = clonedDraft.blocks[0];

  assert.equal(sourceBlock?.type, 'TEXT');
  assert.equal(clonedBlock?.type, 'TEXT');

  if (!sourceBlock || sourceBlock.type !== 'TEXT' || !clonedBlock || clonedBlock.type !== 'TEXT') {
    assert.fail('Expected text blocks in draft clone test');
  }

  clonedDraft.blocks[0] = {
    ...clonedBlock,
    content: 'Updated content',
  };

  assert.equal(sourceBlock.content, 'Original content');
  assert.equal(clonedDraft.blocks[0]?.type, 'TEXT');
  if (!clonedDraft.blocks[0] || clonedDraft.blocks[0].type !== 'TEXT') {
    assert.fail('Expected updated text block in draft clone test');
  }
  assert.equal(clonedDraft.blocks[0].content, 'Updated content');
});
