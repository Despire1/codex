type IOSNavigator = Navigator & {
  standalone?: boolean;
};

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (window.navigator as IOSNavigator).standalone === true;
};

export const applyDisplayModeAttributes = () => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const body = document.body;
  const update = () => {
    const standalone = isStandaloneDisplay();
    root.classList.toggle('display-standalone', standalone);
    body.classList.toggle('display-standalone', standalone);
  };

  update();
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', update);
};

export const registerServiceWorker = () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Failed to register service worker', error);
    });
  });
};
