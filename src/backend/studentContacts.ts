import prisma from './prismaClient';

const normalizeTelegramUsername = (username?: string | null) => {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt.trim().toLowerCase() || null;
};

export const resolveStudentTelegramId = async (student: {
  id: number;
  username?: string | null;
  telegramId?: bigint | null;
  isActivated?: boolean | null;
}) => {
  if (student.telegramId && student.isActivated) {
    return student.telegramId;
  }

  const normalized = normalizeTelegramUsername(student.username);
  if (!normalized) return null;

  const candidates = await prisma.user.findMany({
    where: { username: { contains: normalized } },
  });
  const match = candidates.find((user) => normalizeTelegramUsername(user.username) === normalized);
  if (!match) return null;

  await prisma.student.update({
    where: { id: student.id },
    data: {
      telegramId: match.telegramUserId,
      isActivated: true,
      activatedAt: new Date(),
    },
  });

  return match.telegramUserId;
};
