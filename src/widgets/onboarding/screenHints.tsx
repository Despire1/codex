import { type FC } from 'react';
import { useOnboardingState } from '../../features/onboarding/model/useOnboardingState';
import { FirstTimeHint } from './FirstTimeHint/FirstTimeHint';

const useTeacherUserId = () => {
  const { teacherId } = useOnboardingState();
  return teacherId;
};

export const TeacherScheduleHints: FC = () => {
  const userId = useTeacherUserId();
  if (userId === null) return null;
  return (
    <>
      <FirstTimeHint
        area="teacher.schedule.create"
        userId={userId}
        anchorSelector='[data-tour="create-menu"]'
        titleKey="hint.teacher.schedule.create.title"
        bodyKey="hint.teacher.schedule.create.body"
        side="bottom"
      />
      <FirstTimeHint
        area="teacher.schedule.views"
        userId={userId}
        anchorSelector='[data-hint="schedule-view-toggle"]'
        titleKey="hint.teacher.schedule.views.title"
        bodyKey="hint.teacher.schedule.views.body"
        side="bottom"
      />
    </>
  );
};

export const TeacherStudentsHints: FC = () => {
  const userId = useTeacherUserId();
  if (userId === null) return null;
  return (
    <FirstTimeHint
      area="teacher.student.tabs"
      userId={userId}
      anchorSelector='[data-hint="student-tabs"]'
      titleKey="hint.teacher.student.tabs.title"
      bodyKey="hint.teacher.student.tabs.body"
      side="top"
    />
  );
};

export const TeacherHomeworksHints: FC = () => {
  const userId = useTeacherUserId();
  if (userId === null) return null;
  return (
    <>
      <FirstTimeHint
        area="teacher.homework.modes"
        userId={userId}
        anchorSelector='[data-tour="create-menu"]'
        titleKey="hint.teacher.homework.modes.title"
        bodyKey="hint.teacher.homework.modes.body"
        side="bottom"
      />
      <FirstTimeHint
        area="teacher.homework.templates"
        userId={userId}
        anchorSelector='[data-hint="homework-template-card"]'
        titleKey="hint.teacher.homework.templates.title"
        bodyKey="hint.teacher.homework.templates.body"
        side="bottom"
      />
    </>
  );
};

export const TeacherSettingsHints: FC = () => {
  const userId = useTeacherUserId();
  if (userId === null) return null;
  return (
    <>
      <FirstTimeHint
        area="teacher.settings.notifications"
        userId={userId}
        anchorSelector='[data-hint="settings-notifications"]'
        titleKey="hint.teacher.settings.notifications.title"
        bodyKey="hint.teacher.settings.notifications.body"
        side="top"
      />
      <FirstTimeHint
        area="teacher.settings.billing"
        userId={userId}
        anchorSelector='[data-hint="settings-billing"]'
        titleKey="hint.teacher.settings.billing.title"
        bodyKey="hint.teacher.settings.billing.body"
        side="top"
      />
    </>
  );
};

interface StudentHintsProps {
  userId: number | null;
}

export const StudentHomeworksHints: FC<StudentHintsProps> = ({ userId }) => {
  if (userId === null) return null;
  return (
    <>
      <FirstTimeHint
        area="student.homework.open"
        userId={userId}
        anchorSelector='[data-hint="student-homework-card"]'
        titleKey="hint.student.homework.open.title"
        bodyKey="hint.student.homework.open.body"
        side="top"
      />
      <FirstTimeHint
        area="student.homework.statuses"
        userId={userId}
        anchorSelector='[data-hint="student-homework-status"]'
        titleKey="hint.student.homework.statuses.title"
        bodyKey="hint.student.homework.statuses.body"
        side="bottom"
      />
    </>
  );
};

export const StudentSettingsHints: FC<StudentHintsProps> = ({ userId }) => {
  if (userId === null) return null;
  return (
    <FirstTimeHint
      area="student.settings.teachers"
      userId={userId}
      anchorSelector='[data-hint="student-settings-teachers"]'
      titleKey="hint.student.settings.teachers.title"
      bodyKey="hint.student.settings.teachers.body"
      side="top"
    />
  );
};
