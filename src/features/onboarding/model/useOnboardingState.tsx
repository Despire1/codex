import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  students: Student[];
  links: TeacherStudent[];
  lessons: Lesson[];
  studentsCount?: number | null;
  lessonsCount?: number | null;
};

const OnboardingStateContext = createContext<OnboardingStateValue | null>(null);

type PersistedOnboardingState = {
  started: boolean;
  reminderSent: boolean;
  createdStudent: CreatedStudent | null;
  createdLesson: Lesson | null;
};

const ONBOARDING_STORAGE_PREFIX = 'teacherbot_onboarding_state_v1';

const buildStorageKey = (teacherId: number) => `${ONBOARDING_STORAGE_PREFIX}:${teacherId}`;

const readOnboardingState = (key: string): PersistedOnboardingState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedOnboardingState;
  } catch {
    return null;
  }
};

const writeOnboardingState = (key: string, state: PersistedOnboardingState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore storage failures (quota, privacy modes)
  }
};

const pickActiveStudent = (links: TeacherStudent[], students: Student[]) => {
  const link = links.find((item) => !item.isArchived);
  if (!link) return null;
  const student = students.find((item) => item.id === link.studentId);
  if (!student) return null;
  return { student, link };
};

const resolveCreatedStudent = (
  current: CreatedStudent | null,
  links: TeacherStudent[],
  students: Student[],
) => {
  if (current) {
    const link = links.find((item) => item.studentId === current.student.id && !item.isArchived);
    const student = students.find((item) => item.id === current.student.id);
    if (link && student) {
      return { student, link };
    }
  }
  return pickActiveStudent(links, students);
};

const shouldUpdateCreatedStudent = (current: CreatedStudent | null, next: CreatedStudent | null) => {
  if (!next) return Boolean(current);
  if (!current) return true;
  return (
    current.student.id !== next.student.id ||
    current.student.isActivated !== next.student.isActivated ||
    current.student.username !== next.student.username ||
    current.link.customName !== next.link.customName
  );
};

const pickBestLesson = (lessons: Lesson[]) => {
  if (lessons.length === 0) return null;
  const now = Date.now();
  const upcoming = lessons
    .filter((lesson) => lesson.status !== 'CANCELED')
    .filter((lesson) => new Date(lesson.startAt).getTime() >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  if (upcoming.length > 0) return upcoming[0];
  return [...lessons].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];
};

const resolveCreatedLesson = (current: Lesson | null, lessons: Lesson[], studentId?: number | null) => {
  if (current) {
    const updated = lessons.find((lesson) => lesson.id === current.id);
    return updated ?? current;
  }
  const pool = studentId ? lessons.filter((lesson) => lesson.studentId === studentId) : lessons;
  if (pool.length === 0 && studentId) {
    return pickBestLesson(lessons);
  }
  return pickBestLesson(pool);
};

const shouldUpdateCreatedLesson = (current: Lesson | null, next: Lesson | null) => {
  if (!next) return Boolean(current);
  if (!current) return true;
  return current.id !== next.id || current.startAt !== next.startAt || current.studentId !== next.studentId;
};

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

export const useOnboardingStateInternal = ({
  teacherId,
  isZero,
  students,
  links,
  lessons,
  studentsCount,
  lessonsCount,
}: OnboardingStateConfig): OnboardingStateValue => {
  const [createdStudent, setCreatedStudent] = useState<CreatedStudent | null>(null);
  const [createdLesson, setCreatedLesson] = useState<Lesson | null>(null);
  const [reminderSent, setReminderSent] = useState(false);
  const [started, setStarted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const storageKey = useMemo(() => (teacherId ? buildStorageKey(teacherId) : null), [teacherId]);
  const prevStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setCreatedStudent(null);
      setCreatedLesson(null);
      setReminderSent(false);
      setStarted(false);
      setHydrated(false);
      prevStorageKeyRef.current = null;
      return;
    }
    const stored = readOnboardingState(storageKey);
    const isFirstKey = prevStorageKeyRef.current === null;
    setCreatedStudent((prev) => stored?.createdStudent ?? (isFirstKey ? prev : null));
    setCreatedLesson((prev) => stored?.createdLesson ?? (isFirstKey ? prev : null));
    setReminderSent((prev) => (stored ? Boolean(stored.reminderSent) : isFirstKey ? prev : false));
    setStarted((prev) => (stored ? Boolean(stored.started) : isFirstKey ? prev : false));
    setHydrated(true);
    prevStorageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    if (!isZero || started) return;
    setStarted(true);
  }, [isZero, started]);

  useEffect(() => {
    if ((createdStudent || createdLesson) && !started) {
      setStarted(true);
    }
  }, [createdLesson, createdStudent, started]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    writeOnboardingState(storageKey, {
      started,
      reminderSent,
      createdStudent,
      createdLesson,
    });
  }, [createdLesson, createdStudent, hydrated, reminderSent, started, storageKey]);

  useEffect(() => {
    if (!started || !hydrated) return;
    const hasStudents = typeof studentsCount === 'number' ? studentsCount > 0 : null;
    const hasLessons = typeof lessonsCount === 'number' ? lessonsCount > 0 : null;

    let nextStudent = createdStudent;
    if (hasStudents === false) {
      nextStudent = null;
    } else if (hasStudents === true || links.length > 0 || students.length > 0) {
      nextStudent = resolveCreatedStudent(createdStudent, links, students);
    }
    if (shouldUpdateCreatedStudent(createdStudent, nextStudent)) {
      setCreatedStudent(nextStudent);
    }

    let nextLesson = createdLesson;
    if (hasLessons === false) {
      nextLesson = null;
    } else if (hasLessons === true || lessons.length > 0) {
      nextLesson = resolveCreatedLesson(createdLesson, lessons, nextStudent?.student.id ?? null);
    }
    if (shouldUpdateCreatedLesson(createdLesson, nextLesson)) {
      setCreatedLesson(nextLesson);
    }
  }, [
    createdLesson,
    createdStudent,
    hydrated,
    lessons,
    lessonsCount,
    links,
    started,
    students,
    studentsCount,
  ]);

  const isActive = started && !reminderSent;

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
