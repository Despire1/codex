import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useCallback,
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
  dismissed: boolean;
  createdStudent: CreatedStudent | null;
  createdLesson: Lesson | null;
  reminderSent: boolean;
  setDismissed: (value: boolean) => void;
  setCreatedStudent: Dispatch<SetStateAction<CreatedStudent | null>>;
  setCreatedLesson: Dispatch<SetStateAction<Lesson | null>>;
  setReminderSent: Dispatch<SetStateAction<boolean>>;
};

export type OnboardingStateConfig = {
  teacherId: number | null;
  isZero: boolean;
};

const STORAGE_PREFIX = 'onboarding_empty_dismissed';

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

const loadDismissed = (storageKey: string | null) => {
  if (!storageKey || typeof window === 'undefined') return false;
  return window.localStorage.getItem(storageKey) === 'true';
};

export const useOnboardingStateInternal = ({ teacherId, isZero }: OnboardingStateConfig): OnboardingStateValue => {
  const storageKey = teacherId ? `${STORAGE_PREFIX}:${teacherId}` : null;
  const [dismissed, setDismissedState] = useState(false);
  const [createdStudent, setCreatedStudent] = useState<CreatedStudent | null>(null);
  const [createdLesson, setCreatedLesson] = useState<Lesson | null>(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setDismissedState(loadDismissed(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (isZero) {
      setStarted(true);
    }
  }, [isZero]);

  const setDismissed = useCallback(
    (value: boolean) => {
      setDismissedState(value);
      if (!storageKey || typeof window === 'undefined') return;
      if (value) {
        window.localStorage.setItem(storageKey, 'true');
      } else {
        window.localStorage.removeItem(storageKey);
      }
    },
    [storageKey],
  );

  const hasProgress = Boolean(createdStudent) || Boolean(createdLesson);
  const isActive = started && !reminderSent && (isZero || hasProgress);

  return useMemo(
    () => ({
      teacherId,
      started,
      isActive,
      dismissed,
      createdStudent,
      createdLesson,
      reminderSent,
      setDismissed,
      setCreatedStudent,
      setCreatedLesson,
      setReminderSent,
    }),
    [
      createdLesson,
      createdStudent,
      dismissed,
      isActive,
      reminderSent,
      setDismissed,
      started,
      teacherId,
    ],
  );
};
