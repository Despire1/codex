export type { LessonMutationAction, LessonMutationPreview, LessonSeriesScope } from '../../../entities/types';

export type LessonCancelRefundMode = 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID';

export type LessonModalFocus = 'full' | 'focus_date' | 'focus_time';

export type RescheduleDraft = {
  date: string;
  time: string;
  endTime: string;
};
