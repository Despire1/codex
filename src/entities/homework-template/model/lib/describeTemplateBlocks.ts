import { HomeworkBlock } from '../../../types';

export type TemplateBlockDescriptor = {
  id: string;
  title: string;
  details?: string;
};

export type TemplateBlocksDescription = {
  totalBlocks: number;
  items: TemplateBlockDescriptor[];
  firstTextPreview: string | null;
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
};

const describeStudentResponseBlock = (block: HomeworkBlock & { type: 'STUDENT_RESPONSE' }) => {
  const enabled: string[] = [];
  if (block.allowText) enabled.push('текст');
  if (block.allowFiles || block.allowDocuments) enabled.push('файлы');
  if (block.allowPhotos) enabled.push('фото');
  if (block.allowAudio) enabled.push('аудио');
  if (block.allowVideo) enabled.push('видео');
  if (block.allowVoice) enabled.push('voice');
  return enabled.length ? enabled.join(', ') : 'без формата ответа';
};

export const describeTemplateBlocks = (blocks: HomeworkBlock[]): TemplateBlocksDescription => {
  const items: TemplateBlockDescriptor[] = [];
  let firstTextPreview: string | null = null;

  blocks.forEach((block) => {
    if (block.type === 'TEXT') {
      const content = block.content?.trim() ?? '';
      if (!firstTextPreview && content) {
        firstTextPreview = truncateText(content, 160);
      }
      items.push({
        id: block.id,
        title: 'Текст',
        details: content ? truncateText(content, 72) : 'Без текста',
      });
      return;
    }

    if (block.type === 'MEDIA') {
      items.push({
        id: block.id,
        title: 'Медиа',
        details: `${block.attachments?.length ?? 0} влож.`,
      });
      return;
    }

    if (block.type === 'TEST') {
      items.push({
        id: block.id,
        title: 'Тест',
        details: `${block.questions?.length ?? 0} вопросов`,
      });
      return;
    }

    if (block.type === 'STUDENT_RESPONSE') {
      items.push({
        id: block.id,
        title: 'Ответ ученика',
        details: describeStudentResponseBlock(block),
      });
    }
  });

  return {
    totalBlocks: blocks.length,
    items,
    firstTextPreview,
  };
};

