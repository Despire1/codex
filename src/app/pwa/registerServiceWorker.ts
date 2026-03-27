import { isStandaloneDisplayMode } from '@/shared/lib/pwa';

export const applyDisplayModeAttributes = () => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const body = document.body;
  const update = () => {
    const standalone = isStandaloneDisplayMode();
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
