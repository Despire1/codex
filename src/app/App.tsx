import { useEffect } from 'react';
import { initTelegramFullscreen } from '@/shared/telegram/fullscreen';
import { initTelegramLayoutInsetsMobileOnly } from '@/shared/telegram/layoutInsets';
import { SelectedStudentProvider } from '@/entities/student/model/selectedStudent';
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
    <SelectedStudentProvider>
      <OfflineIndicator />
      <InstallAppBanner />
      <AppPage />
    </SelectedStudentProvider>
  );
};
