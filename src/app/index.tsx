import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { applyDisplayModeAttributes, registerServiceWorker } from './pwa/registerServiceWorker';
import { AppProviders } from './providers';
import { store } from './providers/StoreProvider/config/store';
import './styles/global.css';
import './styles/safe-area.css';

const APP_NAME = 'TeacherBot';

const applyAppTitle = () => {
  document.title = APP_NAME;

  const updateMeta = (selector: string) => {
    const element = document.querySelector<HTMLMetaElement>(selector);
    if (!element) return;
    element.content = APP_NAME;
  };

  updateMeta('meta[name="application-name"]');
  updateMeta('meta[name="apple-mobile-web-app-title"]');
};

const container = document.getElementById('root');

applyDisplayModeAttributes();
registerServiceWorker();
applyAppTitle();

if (container) {
  const root = createRoot(container);
  root.render(
    <Provider store={store}>
      <AppProviders>
        <App />
      </AppProviders>
    </Provider>,
  );
}
