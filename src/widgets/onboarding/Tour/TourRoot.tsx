import { type FC, useEffect } from 'react';
import { useTour } from '../../../features/onboarding/model/useTour';
import { useAnchorRect } from '../../../features/onboarding/model/useAnchorRect';
import { useT } from '../../../shared/i18n';
import { TourOverlay } from './TourOverlay';
import { TourTooltip } from './TourTooltip';

export const TourRoot: FC = () => {
  const { scenario, stepIndex, showFinish, isActive, next, back, skip, finish } = useTour();
  const t = useT();

  const currentStep = scenario && !showFinish ? scenario.steps[stepIndex] : null;
  const anchorSelector = currentStep?.anchorSelector ?? null;
  const rect = useAnchorRect(anchorSelector);

  useEffect(() => {
    if (!isActive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isActive]);

  if (!isActive || !scenario) return null;

  const total = scenario.steps.length;

  if (showFinish) {
    return (
      <>
        <TourOverlay rect={null} />
        <TourTooltip
          rect={null}
          preferredSide="bottom"
          title={t(scenario.finish.titleKey)}
          body={t(scenario.finish.bodyKey)}
          progress={null}
          showBack={false}
          showSkip={false}
          primaryLabel={t(scenario.finish.ctaKey)}
          backLabel={t('tour.controls.back')}
          skipLabel={t('tour.controls.skip')}
          onNext={finish}
          onBack={back}
          onSkip={skip}
        />
      </>
    );
  }

  if (!currentStep) return null;

  const isLastStep = stepIndex === total - 1;
  const primaryLabel = isLastStep ? t('tour.controls.finish') : t('tour.controls.next');
  const progress = t('tour.controls.progress', { step: stepIndex + 1, total });
  const tooltipRect = rect ?? null;

  return (
    <>
      <TourOverlay rect={tooltipRect} />
      <TourTooltip
        rect={tooltipRect}
        preferredSide={currentStep.preferredSide ?? 'bottom'}
        title={t(currentStep.titleKey)}
        body={t(currentStep.bodyKey)}
        progress={progress}
        showBack={stepIndex > 0}
        showSkip
        primaryLabel={primaryLabel}
        backLabel={t('tour.controls.back')}
        skipLabel={t('tour.controls.skip')}
        onNext={next}
        onBack={back}
        onSkip={skip}
      />
    </>
  );
};
