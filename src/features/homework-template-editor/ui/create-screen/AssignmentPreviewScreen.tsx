import { FC, useMemo, useState } from 'react';
import type { HomeworkGroupListItem, HomeworkSubmission } from '../../../../entities/types';
import { StudentHomeworkDetailView, type StudentHomeworkSubmitPayload } from '../../../homework-submit/ui/StudentHomeworkDetailView';
import type { HomeworkEditorDraft } from '../../model/types';
import {
  buildPreviewHomeworkAssignment,
  createPreviewAttemptSubmission,
} from '../../model/lib/previewAssignment';

interface AssignmentPreviewScreenProps {
  draft: HomeworkEditorDraft;
  students: Array<{ id: number; name: string }>;
  groups: HomeworkGroupListItem[];
  onClose: () => void;
}

export const AssignmentPreviewScreen: FC<AssignmentPreviewScreenProps> = ({
  draft,
  students,
  groups,
  onClose,
}) => {
  const studentName = students.find((entry) => entry.id === draft.assignment.studentId)?.name ?? null;
  const groupTitle = groups.find((entry) => entry.id === draft.assignment.groupId)?.title ?? null;
  const assignment = useMemo(
    () =>
      buildPreviewHomeworkAssignment({
        draft,
        studentName,
        groupTitle,
      }),
    [draft, groupTitle, studentName],
  );
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);

  const handleStartAttempt = async () => {
    setSubmissions((prev) => {
      const existingDraft = prev.find((submission) => submission.status === 'DRAFT');
      if (existingDraft) return prev;
      return [createPreviewAttemptSubmission(assignment), ...prev];
    });
    return true;
  };

  const handleSubmitPayload = async (_payload: StudentHomeworkSubmitPayload) => {
    onClose();
    return true;
  };

  return (
    <StudentHomeworkDetailView
      assignment={assignment}
      submissions={submissions}
      loading={false}
      submitting={false}
      requestError={null}
      onBack={onClose}
      onRefresh={() => undefined}
      onStartAttempt={handleStartAttempt}
      onSubmitPayload={handleSubmitPayload}
      preview={{
        enabled: true,
        onFinish: onClose,
      }}
    />
  );
};
