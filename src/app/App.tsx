import { useEffect } from 'react';
import { initTelegramFullscreen } from '@/shared/telegram/fullscreen';
import { SelectedStudentProvider } from '@/entities/student/model/selectedStudent';
import { AppPage } from './AppPage';

export const App = () => {
  useEffect(() => {
    initTelegramFullscreen();
  }, []);

  return (
    <SelectedStudentProvider>
      <AppPage />
    </SelectedStudentProvider>
  );
};
