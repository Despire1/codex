import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 200;

type LegacyStatus = 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE';

const parseLegacyAttachments = (raw: string | null | undefined) => {
  if (!raw) return [] as Array<{ id: string; url: string; fileName: string; size: number }>;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        url: typeof item.url === 'string' ? item.url : '',
        fileName: typeof item.fileName === 'string' ? item.fileName : '',
        size: Number.isFinite(Number(item.size)) ? Math.max(0, Number(item.size)) : 0,
      }))
      .filter((item) => item.url);
  } catch {
    return [];
  }
};

const normalizeLegacyStatus = (status: string | null | undefined, isDone: boolean) => {
  const normalized = typeof status === 'string' ? status.toUpperCase() : 'DRAFT';
  if (isDone || normalized === 'DONE') return 'REVIEWED';
  if (normalized === 'ASSIGNED' || normalized === 'IN_PROGRESS') return 'SENT';
  return 'DRAFT';
};

const toTitle = (text: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Домашнее задание (legacy)';
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
};

const toSnapshot = (text: string, attachmentsRaw: string | null | undefined) => {
  const blocks: Array<Record<string, unknown>> = [];
  const normalizedText = (text ?? '').trim();
  if (normalizedText) {
    blocks.push({ id: crypto.randomUUID(), type: 'TEXT', content: normalizedText });
  }
  const attachments = parseLegacyAttachments(attachmentsRaw);
  if (attachments.length > 0) {
    blocks.push({ id: crypto.randomUUID(), type: 'MEDIA', attachments });
  }
  if (blocks.length === 0) {
    blocks.push({ id: crypto.randomUUID(), type: 'TEXT', content: 'Legacy homework' });
  }
  return blocks;
};

const run = async () => {
  let cursor: number | null = null;
  let created = 0;
  let skipped = 0;
  let processed = 0;

  while (true) {
    const batch = await prisma.homework.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;

    for (const homework of batch) {
      processed += 1;

      const existing = await (prisma as any).homeworkAssignment.findUnique({
        where: { legacyHomeworkId: homework.id },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      const snapshot = toSnapshot(homework.text, homework.attachments);
      const status = normalizeLegacyStatus(homework.status as LegacyStatus | null, homework.isDone);

      await (prisma as any).homeworkAssignment.create({
        data: {
          teacherId: homework.teacherId,
          studentId: homework.studentId,
          legacyHomeworkId: homework.id,
          title: toTitle(homework.text),
          status,
          sendMode: 'MANUAL',
          deadlineAt: homework.deadline,
          sentAt: status === 'SENT' || status === 'REVIEWED' ? homework.createdAt : null,
          reviewedAt: status === 'REVIEWED' ? homework.completedAt ?? homework.updatedAt : null,
          contentSnapshot: JSON.stringify(snapshot),
          teacherComment: null,
          autoScore: null,
          manualScore: null,
          finalScore: null,
          reminder24hSentAt: null,
          reminderMorningSentAt: null,
          reminder3hSentAt: null,
          overdueReminderCount: 0,
          lastOverdueReminderAt: null,
          createdAt: homework.createdAt,
          updatedAt: homework.updatedAt,
        },
      });

      created += 1;
    }

    cursor = batch[batch.length - 1]?.id ?? null;
    // eslint-disable-next-line no-console
    console.log(`[backfill-homework-v2] processed=${processed} created=${created} skipped=${skipped}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill-homework-v2] done processed=${processed} created=${created} skipped=${skipped}`);
};

run()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[backfill-homework-v2] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
