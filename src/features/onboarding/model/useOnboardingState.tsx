import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Lesson, Student, TeacherStudent } from '../../../entities/types';

export type CreatedStudent = { student: Student; link: TeacherStudent };

export type OnboardingStateValue = {
  teacherId: number | null;
  started: boolean;
  isActive: boolean;
  createdStudent: CreatedStudent | null;
  createdLesson: Lesson | null;
  reminderSent: boolean;
  setCreatedStudent: Dispatch<SetStateAction<CreatedStudent | null>>;
  setCreatedLesson: Dispatch<SetStateAction<Lesson | null>>;
  setReminderSent: Dispatch<SetStateAction<boolean>>;
};

export type OnboardingStateConfig = {
  teacherId: number | null;
  isZero: boolean;
};

const OnboardingStateContext = createContext<OnboardingStateValue | null>(null);

export const OnboardingStateProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: OnboardingStateValue }>) => {
  return <OnboardingStateContext.Provider value={value}>{children}</OnboardingStateContext.Provider>;
};

export const useOnboardingState = () => {
  const context = useContext(OnboardingStateContext);
  if (!context) {
    throw new Error('useOnboardingState must be used within OnboardingStateProvider');
  }
  return context;
};

export const useOnboardingStateInternal = ({ teacherId, isZero }: OnboardingStateConfig): OnboardingStateValue => {
  const [createdStudent, setCreatedStudent] = useState<CreatedStudent | null>(null);
  const [createdLesson, setCreatedLesson] = useState<Lesson | null>(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isZero) {
      setStarted(true);
    }
  }, [isZero]);

  const hasProgress = Boolean(createdStudent) || Boolean(createdLesson);
  const isActive = started && !reminderSent && (isZero || hasProgress);

  return useMemo(
    () => ({
      teacherId,
      started,
      isActive,
      createdStudent,
      createdLesson,
      reminderSent,
      setCreatedStudent,
      setCreatedLesson,
      setReminderSent,
    }),
    [
      createdLesson,
      createdStudent,
      isActive,
      reminderSent,
      started,
      teacherId,
    ],
  );
};
