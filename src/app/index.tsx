import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { applyDisplayModeAttributes, registerServiceWorker } from './pwa/registerServiceWorker';
import { AppProviders } from './providers';
import { store } from './providers/StoreProvider/config/store';
import './styles/global.css';
import './styles/safe-area.css';

const container = document.getElementById('root');

applyDisplayModeAttributes();
registerServiceWorker();

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
