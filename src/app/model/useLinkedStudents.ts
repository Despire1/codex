import { useMemo } from 'react';
import { type Homework, type LinkedStudent, type Student, type TeacherStudent } from '../../entities/types';

type UseLinkedStudentsOptions = {
  students: Student[];
  links: TeacherStudent[];
  homeworks: Homework[];
};

export const useLinkedStudents = ({ students, links, homeworks }: UseLinkedStudentsOptions): LinkedStudent[] =>
  useMemo(() => {
    const studentsById = new Map<number, Student>(students.map((student) => [student.id, student]));
    const homeworksByStudentId = new Map<number, Homework[]>();

    homeworks.forEach((homework) => {
      const existing = homeworksByStudentId.get(homework.studentId);
      if (existing) {
        existing.push(homework);
        return;
      }
      homeworksByStudentId.set(homework.studentId, [homework]);
    });

    const linkedStudents: LinkedStudent[] = [];
    links.forEach((link) => {
      const student = studentsById.get(link.studentId);
      if (!student) return;
      linkedStudents.push({
        ...student,
        link,
        homeworks: homeworksByStudentId.get(link.studentId) ?? [],
      });
    });

    return linkedStudents;
  }, [homeworks, links, students]);
