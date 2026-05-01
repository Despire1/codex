import { useEffect } from 'react';
import { initTelegramFullscreen } from '@/shared/telegram/fullscreen';
import { initTelegramLayoutInsetsMobileOnly } from '@/shared/telegram/layoutInsets';
import { SelectedStudentProvider } from '@/entities/student/model/selectedStudent';
import { LocaleProvider } from '@/shared/i18n';
import { TourProvider } from '@/features/onboarding/model/useTour';
import { HintRegistryProvider } from '@/features/onboarding/model/hintRegistry';
import { TourRoot } from '@/widgets/onboarding/Tour/TourRoot';
import { AppPage } from './AppPage';
import { InstallAppBanner } from './components/InstallAppBanner';
import { OfflineIndicator } from './components/OfflineIndicator';

export const App = () => {
  useEffect(() => {
    const cleanupInsets = initTelegramLayoutInsetsMobileOnly(document.documentElement);
    const cleanupFullscreen = initTelegramFullscreen();
    return () => {
      cleanupFullscreen?.();
      cleanupInsets?.();
    };
  }, []);

  return (
    <LocaleProvider>
      <TourProvider>
        <HintRegistryProvider>
          <SelectedStudentProvider>
            <OfflineIndicator />
            <InstallAppBanner />
            <AppPage />
            <TourRoot />
          </SelectedStudentProvider>
        </HintRegistryProvider>
      </TourProvider>
    </LocaleProvider>
  );
};
