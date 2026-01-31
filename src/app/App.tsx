import { useEffect } from 'react';
import { initTelegramFullscreen } from '@/shared/telegram/fullscreen';
import { AppPage } from './AppPage';

export const App = () => {
  useEffect(() => {
    initTelegramFullscreen();
  }, []);

  return <AppPage />;
};
