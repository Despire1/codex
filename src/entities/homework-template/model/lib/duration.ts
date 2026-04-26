import { HomeworkBlock } from '../../../types';

const MINUTES_PER_TEST_QUESTION = 3;
const MINUTES_PER_MEDIA_ATTACHMENT = 3;
const WORDS_PER_TEXT_MINUTE = 120;
const RESPONSE_TEXT_MINUTES = 5;
const RESPONSE_VOICE_MINUTES = 4;
const RESPONSE_FILE_MINUTES = 3;
const MIN_HOMEWORK_DURATION_MINUTES = 5;

const countTextWords = (content: string | null | undefined) =>
  (content ?? '').trim().split(/\s+/).filter(Boolean).length;

export const estimateHomeworkBlocksDurationMinutes = (blocks: HomeworkBlock[]): number => {
  if (!Array.isArray(blocks) || blocks.length === 0) return MIN_HOMEWORK_DURATION_MINUTES;

  let total = 0;
  for (const block of blocks) {
    if (block.type === 'TEST') {
      const questions = Array.isArray(block.questions) ? block.questions.length : 0;
      total += questions * MINUTES_PER_TEST_QUESTION;
    } else if (block.type === 'TEXT') {
      const words = countTextWords(block.content);
      if (words > 0) total += Math.max(1, Math.ceil(words / WORDS_PER_TEXT_MINUTE));
    } else if (block.type === 'MEDIA') {
      const attachments = Array.isArray(block.attachments) ? block.attachments.length : 0;
      total += attachments * MINUTES_PER_MEDIA_ATTACHMENT;
    } else if (block.type === 'STUDENT_RESPONSE') {
      let response = 0;
      if (block.allowText) response += RESPONSE_TEXT_MINUTES;
      if (block.allowVoice) response += RESPONSE_VOICE_MINUTES;
      if (block.allowFiles || block.allowDocuments || block.allowPhotos || block.allowAudio || block.allowVideo) {
        response += RESPONSE_FILE_MINUTES;
      }
      total += response;
    }
  }

  return Math.max(MIN_HOMEWORK_DURATION_MINUTES, total);
};

export const resolveHomeworkDurationMinutes = (blocks: HomeworkBlock[], explicitMinutes?: number | null): number => {
  if (typeof explicitMinutes === 'number' && Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.max(1, Math.round(explicitMinutes));
  }
  return estimateHomeworkBlocksDurationMinutes(blocks);
};
