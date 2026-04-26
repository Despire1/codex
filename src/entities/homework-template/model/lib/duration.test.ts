import { describe, expect, it } from 'vitest';
import { HomeworkBlock } from '../../../types';
import { estimateHomeworkBlocksDurationMinutes, resolveHomeworkDurationMinutes } from './duration';

const testBlock = (questionsCount: number): HomeworkBlock =>
  ({
    type: 'TEST',
    questions: Array.from({ length: questionsCount }).map((_, index) => ({
      id: `q-${index}`,
      type: 'SINGLE_CHOICE',
      prompt: '',
      options: [],
      points: 1,
    })),
  }) as unknown as HomeworkBlock;

const textBlock = (content: string): HomeworkBlock => ({ type: 'TEXT', content }) as unknown as HomeworkBlock;

const mediaBlock = (attachmentsCount: number): HomeworkBlock =>
  ({
    type: 'MEDIA',
    attachments: Array.from({ length: attachmentsCount }).map((_, index) => ({ id: `att-${index}` })),
  }) as unknown as HomeworkBlock;

const responseBlock = (overrides: Record<string, boolean> = {}): HomeworkBlock =>
  ({
    type: 'STUDENT_RESPONSE',
    allowText: false,
    allowVoice: false,
    allowFiles: false,
    allowDocuments: false,
    allowPhotos: false,
    allowAudio: false,
    allowVideo: false,
    ...overrides,
  }) as unknown as HomeworkBlock;

describe('estimateHomeworkBlocksDurationMinutes', () => {
  it('returns minimum 5 for empty blocks', () => {
    expect(estimateHomeworkBlocksDurationMinutes([])).toBe(5);
  });

  it('counts test questions at 3 minutes per question, with min of 5', () => {
    expect(estimateHomeworkBlocksDurationMinutes([testBlock(1)])).toBe(5);
    expect(estimateHomeworkBlocksDurationMinutes([testBlock(2)])).toBe(6);
    expect(estimateHomeworkBlocksDurationMinutes([testBlock(5)])).toBe(15);
  });

  it('counts text by 1 minute per ~120 words, min 1 if any words', () => {
    const shortText = textBlock('one two three');
    expect(estimateHomeworkBlocksDurationMinutes([shortText])).toBe(5);
    const longText = textBlock(Array.from({ length: 240 }).fill('word').join(' '));
    expect(estimateHomeworkBlocksDurationMinutes([longText])).toBe(5);
    const veryLongText = textBlock(Array.from({ length: 720 }).fill('word').join(' '));
    expect(estimateHomeworkBlocksDurationMinutes([veryLongText])).toBe(6);
  });

  it('sums media attachments and student responses', () => {
    expect(
      estimateHomeworkBlocksDurationMinutes([
        testBlock(2),
        mediaBlock(2),
        responseBlock({ allowText: true, allowVoice: true }),
      ]),
    ).toBe(6 + 6 + (5 + 4));
  });
});

describe('resolveHomeworkDurationMinutes', () => {
  it('prefers explicit positive minutes over derived estimate', () => {
    expect(resolveHomeworkDurationMinutes([testBlock(2)], 25)).toBe(25);
  });

  it('falls back to estimate when explicit minutes missing or invalid', () => {
    expect(resolveHomeworkDurationMinutes([testBlock(2)], null)).toBe(6);
    expect(resolveHomeworkDurationMinutes([testBlock(2)], 0)).toBe(6);
    expect(resolveHomeworkDurationMinutes([testBlock(2)], NaN)).toBe(6);
  });
});
