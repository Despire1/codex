import { HomeworkAttachment, HomeworkStatus, Student, TeacherStudent } from '../../entities/types';

export type SelectedStudent = Student & { link: TeacherStudent };

export interface HomeworkDraft {
  text: string;
  deadline: string;
  status: HomeworkStatus;
  attachments: HomeworkAttachment[];
  timeSpentMinutes: string;
}

export interface NewHomeworkDraft {
  text: string;
  deadline: string;
  status: HomeworkStatus;
  baseStatus: HomeworkStatus;
  sendNow: boolean;
  remindBefore: boolean;
  timeSpentMinutes: string;
}

export interface HomeworkStatusInfo {
  status: HomeworkStatus;
  isOverdue: boolean;
}
