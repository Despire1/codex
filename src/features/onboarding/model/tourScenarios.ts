import type { MessageKey } from '../../../shared/i18n';

export type TourTooltipSide = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
  id: string;
  anchorSelector: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  preferredSide?: TourTooltipSide;
};

export type TourFinish = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  ctaKey: MessageKey;
};

export type TourScenarioId = 'teacher-web' | 'teacher-twa' | 'student';

export type TourScenario = {
  id: TourScenarioId;
  steps: TourStep[];
  finish: TourFinish;
};

export const teacherWebScenario: TourScenario = {
  id: 'teacher-web',
  steps: [
    {
      id: 'sidebar',
      anchorSelector: '[data-tour="sidebar"]',
      titleKey: 'tour.step1.title',
      bodyKey: 'tour.step1.body',
      preferredSide: 'right',
    },
    {
      id: 'create-menu',
      anchorSelector: '[data-tour="create-menu"]',
      titleKey: 'tour.step2.title',
      bodyKey: 'tour.step2.body',
      preferredSide: 'bottom',
    },
    {
      id: 'activity-feed',
      anchorSelector: '[data-tour="activity-feed"]',
      titleKey: 'tour.step3.title',
      bodyKey: 'tour.step3.body',
      preferredSide: 'bottom',
    },
    {
      id: 'telegram',
      anchorSelector: '[data-tour="telegram"]',
      titleKey: 'tour.step5.title',
      bodyKey: 'tour.step5.body',
      preferredSide: 'left',
    },
  ],
  finish: {
    titleKey: 'tour.finish.title',
    bodyKey: 'tour.finish.body',
    ctaKey: 'tour.finish.cta',
  },
};

export const teacherTwaScenario: TourScenario = {
  id: 'teacher-twa',
  steps: [
    {
      id: 'mobile-tabs',
      anchorSelector: '[data-tour="mobile-tabs"]',
      titleKey: 'tour.twa.step1.title',
      bodyKey: 'tour.twa.step1.body',
      preferredSide: 'top',
    },
    {
      id: 'mobile-create',
      anchorSelector: '[data-tour="mobile-create"]',
      titleKey: 'tour.twa.step2.title',
      bodyKey: 'tour.twa.step2.body',
      preferredSide: 'bottom',
    },
  ],
  finish: {
    titleKey: 'tour.twa.finish.title',
    bodyKey: 'tour.twa.finish.body',
    ctaKey: 'tour.finish.cta',
  },
};

export const studentScenario: TourScenario = {
  id: 'student',
  steps: [
    {
      id: 'student-home',
      anchorSelector: '[data-tour="student-home"]',
      titleKey: 'student.tour.step1.title',
      bodyKey: 'student.tour.step1.body',
      preferredSide: 'bottom',
    },
    {
      id: 'student-homeworks',
      anchorSelector: '[data-tour="student-tab-homeworks"]',
      titleKey: 'student.tour.step2.title',
      bodyKey: 'student.tour.step2.body',
      preferredSide: 'top',
    },
    {
      id: 'student-settings',
      anchorSelector: '[data-tour="student-tab-settings"]',
      titleKey: 'student.tour.step3.title',
      bodyKey: 'student.tour.step3.body',
      preferredSide: 'top',
    },
  ],
  finish: {
    titleKey: 'student.tour.finish.title',
    bodyKey: 'student.tour.finish.body',
    ctaKey: 'tour.finish.cta',
  },
};

export const tourScenarios: Record<TourScenarioId, TourScenario> = {
  'teacher-web': teacherWebScenario,
  'teacher-twa': teacherTwaScenario,
  student: studentScenario,
};
