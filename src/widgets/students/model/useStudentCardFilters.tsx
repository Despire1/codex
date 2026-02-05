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
import {
  type HomeworkStatus,
  type LessonDateRange,
  type LessonPaymentFilter,
  type LessonSortOrder,
  type LessonStatusFilter,
} from '../../../entities/types';

const STUDENT_CARD_FILTERS_KEY = 'student_card_filters';

type StudentCardFiltersState = {
  homeworkFilter?: 'all' | HomeworkStatus | 'overdue';
  lessonPaymentFilter?: LessonPaymentFilter;
  lessonStatusFilter?: LessonStatusFilter;
  lessonDateRange?: LessonDateRange;
  lessonSortOrder?: LessonSortOrder;
  paymentFilter?: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate?: string;
};

const DEFAULT_LESSON_DATE_RANGE: LessonDateRange = {
  from: '',
  to: '',
  fromTime: '00:00',
  toTime: '23:59',
};

const isHomeworkFilter = (value: unknown): value is 'all' | HomeworkStatus | 'overdue' =>
  typeof value === 'string' &&
  (value === 'all' ||
    value === 'overdue' ||
    value === 'DRAFT' ||
    value === 'ASSIGNED' ||
    value === 'IN_PROGRESS' ||
    value === 'DONE');

const isLessonPaymentFilter = (value: unknown): value is LessonPaymentFilter =>
  value === 'all' || value === 'paid' || value === 'unpaid';

const isLessonStatusFilter = (value: unknown): value is LessonStatusFilter =>
  value === 'all' || value === 'completed' || value === 'not_completed';

const isLessonSortOrder = (value: unknown): value is LessonSortOrder => value === 'asc' || value === 'desc';

const isPaymentFilter = (value: unknown): value is 'all' | 'topup' | 'charges' | 'manual' =>
  value === 'all' || value === 'topup' || value === 'charges' || value === 'manual';

const parseLessonDateRange = (value: unknown): LessonDateRange | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.from !== 'string' ||
    typeof record.to !== 'string' ||
    typeof record.fromTime !== 'string' ||
    typeof record.toTime !== 'string'
  ) {
    return null;
  }
  return {
    from: record.from,
    to: record.to,
    fromTime: record.fromTime,
    toTime: record.toTime,
  };
};

const loadStudentCardFilters = (): StudentCardFiltersState => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STUDENT_CARD_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: StudentCardFiltersState = {};
    if (isHomeworkFilter(parsed.homeworkFilter)) {
      result.homeworkFilter = parsed.homeworkFilter;
    }
    if (isLessonPaymentFilter(parsed.lessonPaymentFilter)) {
      result.lessonPaymentFilter = parsed.lessonPaymentFilter;
    }
    if (isLessonStatusFilter(parsed.lessonStatusFilter)) {
      result.lessonStatusFilter = parsed.lessonStatusFilter;
    }
    const parsedDateRange = parseLessonDateRange(parsed.lessonDateRange);
    if (parsedDateRange) {
      result.lessonDateRange = parsedDateRange;
    }
    if (isLessonSortOrder(parsed.lessonSortOrder)) {
      result.lessonSortOrder = parsed.lessonSortOrder;
    }
    if (isPaymentFilter(parsed.paymentFilter)) {
      result.paymentFilter = parsed.paymentFilter;
    }
    if (typeof parsed.paymentDate === 'string') {
      result.paymentDate = parsed.paymentDate;
    }
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load student card filters', error);
    return {};
  }
};

const saveStudentCardFilters = (state: StudentCardFiltersState) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_CARD_FILTERS_KEY, JSON.stringify(state));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save student card filters', error);
  }
};

export type StudentCardFiltersContextValue = {
  homeworkFilter: 'all' | HomeworkStatus | 'overdue';
  setHomeworkFilter: Dispatch<SetStateAction<'all' | HomeworkStatus | 'overdue'>>;
  lessonPaymentFilter: LessonPaymentFilter;
  setLessonPaymentFilter: Dispatch<SetStateAction<LessonPaymentFilter>>;
  lessonStatusFilter: LessonStatusFilter;
  setLessonStatusFilter: Dispatch<SetStateAction<LessonStatusFilter>>;
  lessonDateRange: LessonDateRange;
  setLessonDateRange: Dispatch<SetStateAction<LessonDateRange>>;
  lessonSortOrder: LessonSortOrder;
  setLessonSortOrder: Dispatch<SetStateAction<LessonSortOrder>>;
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  setPaymentFilter: Dispatch<SetStateAction<'all' | 'topup' | 'charges' | 'manual'>>;
  paymentDate: string;
  setPaymentDate: Dispatch<SetStateAction<string>>;
};

const StudentCardFiltersContext = createContext<StudentCardFiltersContextValue | null>(null);

export const StudentsCardFiltersProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: StudentCardFiltersContextValue }>) => {
  return <StudentCardFiltersContext.Provider value={value}>{children}</StudentCardFiltersContext.Provider>;
};

export const useStudentCardFilters = () => {
  const context = useContext(StudentCardFiltersContext);
  if (!context) {
    throw new Error('useStudentCardFilters must be used within StudentsCardFiltersProvider');
  }
  return context;
};

export const useStudentCardFiltersInternal = (): StudentCardFiltersContextValue => {
  const storedFilters = useMemo(() => loadStudentCardFilters(), []);
  const [homeworkFilter, setHomeworkFilter] = useState<'all' | HomeworkStatus | 'overdue'>(
    storedFilters.homeworkFilter ?? 'all',
  );
  const [lessonPaymentFilter, setLessonPaymentFilter] = useState<LessonPaymentFilter>(
    storedFilters.lessonPaymentFilter ?? 'all',
  );
  const [lessonStatusFilter, setLessonStatusFilter] = useState<LessonStatusFilter>(
    storedFilters.lessonStatusFilter ?? 'all',
  );
  const [lessonSortOrder, setLessonSortOrder] = useState<LessonSortOrder>(
    storedFilters.lessonSortOrder ?? 'asc',
  );
  const [lessonDateRange, setLessonDateRange] = useState<LessonDateRange>(
    storedFilters.lessonDateRange ?? DEFAULT_LESSON_DATE_RANGE,
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'topup' | 'charges' | 'manual'>(
    storedFilters.paymentFilter ?? 'all',
  );
  const [paymentDate, setPaymentDate] = useState(storedFilters.paymentDate ?? '');

  useEffect(() => {
    saveStudentCardFilters({
      homeworkFilter,
      lessonPaymentFilter,
      lessonStatusFilter,
      lessonDateRange,
      lessonSortOrder,
      paymentFilter,
      paymentDate,
    });
  }, [
    homeworkFilter,
    lessonDateRange,
    lessonPaymentFilter,
    lessonSortOrder,
    lessonStatusFilter,
    paymentDate,
    paymentFilter,
  ]);

  return useMemo(
    () => ({
      homeworkFilter,
      setHomeworkFilter,
      lessonPaymentFilter,
      setLessonPaymentFilter,
      lessonStatusFilter,
      setLessonStatusFilter,
      lessonDateRange,
      setLessonDateRange,
      lessonSortOrder,
      setLessonSortOrder: (value) =>
        setLessonSortOrder((prev) => (typeof value === 'function' ? value(prev) : value === prev ? prev : value)),
      paymentFilter,
      setPaymentFilter,
      paymentDate,
      setPaymentDate,
    }),
    [
      homeworkFilter,
      lessonDateRange,
      lessonPaymentFilter,
      lessonSortOrder,
      lessonStatusFilter,
      paymentDate,
      paymentFilter,
    ],
  );
};
