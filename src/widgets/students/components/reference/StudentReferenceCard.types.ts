import { StudentListItem } from '../../../../entities/types';

export interface StudentReferenceCardProps {
  item: StudentListItem;
  timeZone: string;
  onOpenStudent: (studentId: number) => void;
  onEditStudent: (studentId: number) => void;
  onDeleteStudent: (studentId: number) => void;
}
