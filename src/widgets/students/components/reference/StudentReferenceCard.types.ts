import { StudentListItem } from '../../../../entities/types';

export interface StudentReferenceCardQuickActions {
  onScheduleLesson?: (studentId: number) => void;
  onWriteStudent?: (studentId: number) => void;
  onTopUpBalance?: (studentId: number) => void;
  onAssignHomework?: (studentId: number) => void;
}

export interface StudentReferenceCardProps extends StudentReferenceCardQuickActions {
  item: StudentListItem;
  timeZone: string;
  onOpenStudent: (studentId: number) => void;
  onEditStudent: (studentId: number) => void;
  onDeleteStudent: (studentId: number) => void;
  onToggleCompletion: (studentId: number) => void;
}
