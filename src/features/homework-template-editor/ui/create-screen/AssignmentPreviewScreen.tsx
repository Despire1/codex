import { FC, useMemo, useState } from 'react';
import type { HomeworkGroupListItem, HomeworkSubmission } from '../../../../entities/types';
import {
  StudentHomeworkDetailView,
  type StudentHomeworkSubmitPayload,
} from '../../../homework-submit/ui/StudentHomeworkDetailView';
import type { HomeworkEditorDraft } from '../../model/types';
import { buildPreviewHomeworkAssignment, createPreviewAttemptSubmission } from '../../model/lib/previewAssignment';
import { useIsMobile } from '../../../../shared/lib/useIsMobile';
import styles from './AssignmentPreviewScreen.module.css';

interface AssignmentPreviewScreenProps {
  draft: HomeworkEditorDraft;
  students: Array<{ id: number; name: string }>;
  groups: HomeworkGroupListItem[];
  onClose: () => void;
}

type PreviewViewport = 'desktop' | 'mobile';

export const AssignmentPreviewScreen: FC<AssignmentPreviewScreenProps> = ({ draft, students, groups, onClose }) => {
  const isMobileDevice = useIsMobile(900);
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
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

  const detail = (
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

  // На реальном мобильном устройстве переключатель не нужен — ученик и так увидит mobile-вид.
  if (isMobileDevice) {
    return detail;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar} role="tablist" aria-label="Режим превью">
        <button
          type="button"
          role="tab"
          aria-selected={viewport === 'desktop'}
          className={`${styles.toggleButton} ${viewport === 'desktop' ? styles.toggleButtonActive : ''}`}
          onClick={() => setViewport('desktop')}
        >
          Desktop
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewport === 'mobile'}
          className={`${styles.toggleButton} ${viewport === 'mobile' ? styles.toggleButtonActive : ''}`}
          onClick={() => setViewport('mobile')}
        >
          Mobile
        </button>
      </div>

      {viewport === 'mobile' ? (
        <div className={styles.mobileFrameWrap}>
          <div className={styles.mobileFrame}>{detail}</div>
        </div>
      ) : (
        detail
      )}
    </div>
  );
};
