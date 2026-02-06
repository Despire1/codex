import { useEffect } from 'react';
import { initTelegramFullscreen } from '@/shared/telegram/fullscreen';
import { initTelegramLayoutInsetsMobileOnly } from '@/shared/telegram/layoutInsets';
import { SelectedStudentProvider } from '@/entities/student/model/selectedStudent';
import { AppPage } from './AppPage';

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
      <AppPage />
    </SelectedStudentProvider>
  );
};
