import { type PropsWithChildren, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { trackEvent } from '../../../shared/lib/analytics';
import { tourScenarios, type TourScenario, type TourScenarioId } from './tourScenarios';

type TourState = {
  scenarioId: TourScenarioId | null;
  stepIndex: number;
  showFinish: boolean;
};

type TourContextValue = {
  scenario: TourScenario | null;
  stepIndex: number;
  showFinish: boolean;
  isActive: boolean;
  start: (scenarioId: TourScenarioId, source?: string) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
};

const initialState: TourState = {
  scenarioId: null,
  stepIndex: 0,
  showFinish: false,
};

const TourContext = createContext<TourContextValue | null>(null);

export const TourProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<TourState>(initialState);

  const scenario = state.scenarioId ? tourScenarios[state.scenarioId] : null;

  const start = useCallback((scenarioId: TourScenarioId, source = 'unknown') => {
    setState({ scenarioId, stepIndex: 0, showFinish: false });
    trackEvent('tour_started', { scenarioId, source });
    trackEvent('tour_step_shown', { scenarioId, stepIndex: 0, stepId: tourScenarios[scenarioId].steps[0]?.id });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev.scenarioId) return prev;
      const sc = tourScenarios[prev.scenarioId];
      const nextIndex = prev.stepIndex + 1;
      if (nextIndex >= sc.steps.length) {
        trackEvent('tour_finish_shown', { scenarioId: prev.scenarioId });
        return { ...prev, showFinish: true };
      }
      trackEvent('tour_step_shown', {
        scenarioId: prev.scenarioId,
        stepIndex: nextIndex,
        stepId: sc.steps[nextIndex]?.id,
      });
      return { ...prev, stepIndex: nextIndex };
    });
  }, []);

  const back = useCallback(() => {
    setState((prev) => {
      if (!prev.scenarioId) return prev;
      if (prev.showFinish) {
        return { ...prev, showFinish: false };
      }
      if (prev.stepIndex === 0) return prev;
      return { ...prev, stepIndex: prev.stepIndex - 1 };
    });
  }, []);

  const skip = useCallback(() => {
    setState((prev) => {
      if (prev.scenarioId) {
        trackEvent('tour_skipped', { scenarioId: prev.scenarioId, stepIndex: prev.stepIndex });
      }
      return initialState;
    });
  }, []);

  const finish = useCallback(() => {
    setState((prev) => {
      if (prev.scenarioId) {
        trackEvent('tour_completed', { scenarioId: prev.scenarioId });
      }
      return initialState;
    });
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      scenario,
      stepIndex: state.stepIndex,
      showFinish: state.showFinish,
      isActive: state.scenarioId !== null,
      start,
      next,
      back,
      skip,
      finish,
    }),
    [back, finish, next, scenario, skip, start, state.scenarioId, state.showFinish, state.stepIndex],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within TourProvider');
  }
  return ctx;
};
