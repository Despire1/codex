import fs from 'node:fs/promises';
import path from 'node:path';

const STORAGE_DIR = path.resolve(process.cwd(), 'tmp', 'uploads');
const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const URL_OBJECT_PREFIX = '/api/v2/files/object/';

const collectStorageKeysFromValue = (value: unknown, into: Set<string>): void => {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.startsWith(URL_OBJECT_PREFIX)) {
      into.add(value.slice(URL_OBJECT_PREFIX.length));
    } else if (value.includes(URL_OBJECT_PREFIX)) {
      const idx = value.indexOf(URL_OBJECT_PREFIX);
      const tail = value.slice(idx + URL_OBJECT_PREFIX.length).split(/[?#]/)[0];
      if (tail) into.add(tail);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStorageKeysFromValue(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStorageKeysFromValue(v, into);
    }
  }
};

const collectFileObjectIdsFromValue = (value: unknown, into: Set<string>): void => {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectFileObjectIdsFromValue(item, into);
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fid = obj.fileObjectId;
    if (typeof fid === 'string' && fid.length > 0) into.add(fid);
    for (const v of Object.values(obj)) collectFileObjectIdsFromValue(v, into);
  }
};

const safeParseJson = (raw: string | null | undefined): unknown => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export type StorageCleanupResult = {
  scannedFileObjects: number;
  orphanFileObjects: number;
  deletedFileObjects: number;
  deletedDiskFiles: number;
  orphanDiskFilesWithoutRecord: number;
  dryRun: boolean;
};

export const runStorageCleanupTick = async (params: {
  prisma: any;
  dryRun?: boolean;
}): Promise<StorageCleanupResult> => {
  const { prisma } = params;
  const dryRun = params.dryRun ?? true;

  const usedFileObjectIds = new Set<string>();
  const usedStorageKeys = new Set<string>();

  const lessonAttachmentRows = await prisma.lessonAttachment.findMany({
    select: { fileObjectId: true, url: true },
  });
  for (const row of lessonAttachmentRows) {
    if (row.fileObjectId) usedFileObjectIds.add(row.fileObjectId);
    if (typeof row.url === 'string' && row.url.startsWith(URL_OBJECT_PREFIX)) {
      usedStorageKeys.add(row.url.slice(URL_OBJECT_PREFIX.length));
    }
  }

  const seriesAttachmentRows = await prisma.seriesAttachment.findMany({
    select: { fileObjectId: true },
  });
  for (const row of seriesAttachmentRows) {
    if (row.fileObjectId) usedFileObjectIds.add(row.fileObjectId);
  }

  const templateRows = await prisma.homeworkTemplate.findMany({ select: { blocks: true } });
  for (const row of templateRows) {
    const parsed = safeParseJson(row.blocks);
    collectFileObjectIdsFromValue(parsed, usedFileObjectIds);
    collectStorageKeysFromValue(parsed, usedStorageKeys);
  }

  const assignmentRows = await prisma.homeworkAssignment.findMany({
    select: { contentSnapshot: true },
  });
  for (const row of assignmentRows) {
    const parsed = safeParseJson(row.contentSnapshot);
    collectFileObjectIdsFromValue(parsed, usedFileObjectIds);
    collectStorageKeysFromValue(parsed, usedStorageKeys);
  }

  const submissionRows = await prisma.homeworkSubmission.findMany({
    select: { attachments: true, voice: true },
  });
  for (const row of submissionRows) {
    const a = safeParseJson(row.attachments);
    const v = safeParseJson(row.voice);
    collectFileObjectIdsFromValue(a, usedFileObjectIds);
    collectStorageKeysFromValue(a, usedStorageKeys);
    collectFileObjectIdsFromValue(v, usedFileObjectIds);
    collectStorageKeysFromValue(v, usedStorageKeys);
  }

  const legacyHomeworkRows = await prisma.homework.findMany({ select: { attachments: true } });
  for (const row of legacyHomeworkRows) {
    const parsed = safeParseJson(row.attachments);
    collectStorageKeysFromValue(parsed, usedStorageKeys);
    collectFileObjectIdsFromValue(parsed, usedFileObjectIds);
  }

  const cutoff = new Date(Date.now() - ORPHAN_TTL_MS);
  const oldFileObjects = await prisma.fileObject.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
  });

  const scanned = oldFileObjects.length;
  let orphanCount = 0;
  let deletedRecords = 0;
  let deletedDisk = 0;

  for (const fo of oldFileObjects) {
    const isUsed = usedFileObjectIds.has(fo.id) || usedStorageKeys.has(fo.storageKey);
    if (isUsed) continue;
    orphanCount += 1;
    if (dryRun) continue;
    const fullPath = path.join(STORAGE_DIR, fo.storageKey);
    const normalizedRoot = path.resolve(STORAGE_DIR);
    const normalizedPath = path.resolve(fullPath);
    if (!normalizedPath.startsWith(normalizedRoot)) continue;
    try {
      await fs.unlink(normalizedPath);
      deletedDisk += 1;
    } catch {
      // файла уже могло не быть
    }
    try {
      await prisma.fileObject.delete({ where: { id: fo.id } });
      deletedRecords += 1;
    } catch {
      // запись могла удалиться cascade'ом
    }
  }

  let orphanDiskFiles = 0;
  try {
    const allFiles = await fs.readdir(STORAGE_DIR);
    if (allFiles.length > 0) {
      const knownKeys = await prisma.fileObject.findMany({ select: { storageKey: true } });
      const known = new Set<string>(knownKeys.map((k: { storageKey: string }) => k.storageKey));
      for (const fileName of allFiles) {
        if (!known.has(fileName) && !usedStorageKeys.has(fileName)) {
          orphanDiskFiles += 1;
          if (dryRun) continue;
          const fullPath = path.join(STORAGE_DIR, fileName);
          const normalizedRoot = path.resolve(STORAGE_DIR);
          const normalizedPath = path.resolve(fullPath);
          if (!normalizedPath.startsWith(normalizedRoot)) continue;
          try {
            const stat = await fs.stat(normalizedPath);
            if (stat.isFile() && Date.now() - stat.mtimeMs > ORPHAN_TTL_MS) {
              await fs.unlink(normalizedPath);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // каталог может не существовать
  }

  return {
    scannedFileObjects: scanned,
    orphanFileObjects: orphanCount,
    deletedFileObjects: deletedRecords,
    deletedDiskFiles: deletedDisk,
    orphanDiskFilesWithoutRecord: orphanDiskFiles,
    dryRun,
  };
};
