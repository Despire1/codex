import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { AppProviders } from './providers';
import { store } from './providers/StoreProvider/config/store';
import './styles/global.css';

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <AppProviders>
          <App />
        </AppProviders>
      </Provider>
    </React.StrictMode>,
  );
}
