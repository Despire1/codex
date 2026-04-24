import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const resolveTeacherChatId = () => {
  const raw = process.env.LOCAL_DEV_TELEGRAM_ID ?? process.env.LOCAL_DEV_CHAT_ID ?? '100200300';
  const parsed = BigInt(String(raw).trim());
  return parsed;
};

const main = async () => {
  const teacherChatId = resolveTeacherChatId();
  const teacherUsername = process.env.LOCAL_DEV_USERNAME ?? 'local_teacher';
  const teacherName = `${process.env.LOCAL_DEV_FIRST_NAME ?? 'Local'} ${process.env.LOCAL_DEV_LAST_NAME ?? 'Teacher'}`.trim();

  const teacher = await prisma.teacher.upsert({
    where: { chatId: teacherChatId },
    update: { username: teacherUsername, name: teacherName },
    create: { chatId: teacherChatId, username: teacherUsername, name: teacherName, timezone: 'Europe/Moscow' },
  });
  console.log(`Teacher: chatId=${teacher.chatId} username=${teacher.username ?? '(null)'}`);

  const seedStudents = [
    { username: 'seed_student_a', customName: 'Анна Иванова', level: 'Intermediate', price: 2000, balance: 4 },
    { username: 'seed_student_b', customName: 'Борис Петров', level: 'Advanced', price: 2500, balance: 0 },
  ];

  for (const config of seedStudents) {
    let student = await prisma.student.findFirst({ where: { username: config.username } });
    if (!student) {
      student = await prisma.student.create({
        data: { username: config.username, timezone: 'Europe/Moscow' },
      });
    }
    const existingLink = await prisma.teacherStudent.findFirst({
      where: { teacherId: teacherChatId, studentId: student.id },
    });
    if (!existingLink) {
      await prisma.teacherStudent.create({
        data: {
          teacherId: teacherChatId,
          studentId: student.id,
          customName: config.customName,
          studentLevel: config.level,
          pricePerLesson: config.price,
          balanceLessons: config.balance,
          uiColor: '#a3e635',
        },
      });
    }
    console.log(`Student: id=${student.id} username=${config.username} name=${config.customName}`);
  }

  const studentA = await prisma.student.findFirst({ where: { username: 'seed_student_a' } });
  if (studentA) {
    const inFourHours = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const hasLesson = await prisma.lesson.findFirst({
      where: { teacherId: teacherChatId, studentId: studentA.id, startAt: { gte: new Date() } },
    });
    if (!hasLesson) {
      const lesson = await prisma.lesson.create({
        data: {
          teacherId: teacherChatId,
          studentId: studentA.id,
          startAt: inFourHours,
          durationMinutes: 60,
          price: 2000,
          status: 'SCHEDULED',
          meetingLink: 'https://meet.jit.si/seed-demo',
        },
      });
      console.log(`Lesson: id=${lesson.id} at ${inFourHours.toISOString()}`);
    }
  }

  const templateTitle = 'Demo: Present Perfect — практика';
  const existingTemplate = await prisma.homeworkTemplate.findFirst({
    where: { teacherId: teacherChatId, title: templateTitle },
  });
  const template =
    existingTemplate ??
    (await prisma.homeworkTemplate.create({
      data: {
        teacherId: teacherChatId,
        creatorTeacherId: teacherChatId,
        title: templateTitle,
        subject: 'English',
        level: 'Intermediate',
        blocks: JSON.stringify([
          { type: 'TEXT', text: 'Составь 3 предложения в Present Perfect' },
          {
            type: 'QUESTION',
            question: { id: 'q1', type: 'SHORT_ANSWER', prompt: 'Переведи: я уже поел.', points: 2 },
          },
        ]),
        tags: JSON.stringify([]),
        estimatedMinutes: 15,
      },
    }));
  console.log(`Template: id=${template.id} title="${template.title}"`);

  if (studentA) {
    const existingAssignment = await prisma.homeworkAssignment.findFirst({
      where: { teacherId: teacherChatId, studentId: studentA.id, templateId: template.id, status: { in: ['SENT', 'IN_REVIEW', 'RETURNED'] } },
    });
    if (!existingAssignment) {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const assignment = await prisma.homeworkAssignment.create({
        data: {
          teacherId: teacherChatId,
          studentId: studentA.id,
          templateId: template.id,
          title: templateTitle,
          status: 'SENT',
          sendMode: 'MANUAL',
          sentAt: new Date(),
          deadlineAt: deadline,
          contentSnapshot: template.blocks,
        },
      });
      console.log(`Assignment: id=${assignment.id} deadline=${deadline.toISOString()}`);
    }
  }

  console.log('Seed complete.');
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
