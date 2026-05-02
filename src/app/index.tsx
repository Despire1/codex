import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyDisplayModeAttributes, registerServiceWorker } from './pwa/registerServiceWorker';
import { AppProviders } from './providers';
import { store } from './providers/StoreProvider/config/store';
import { applyTheme } from '@/entities/theme/lib/applyTheme';
import { readStoredThemeMode } from '@/entities/theme/lib/initialTheme';
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

const applyInitialTheme = () => {
  const mode = readStoredThemeMode();
  const resolved = mode === 'dark' ? 'dark' : 'light';
  applyTheme(resolved);
};

const container = document.getElementById('root');

applyInitialTheme();
applyDisplayModeAttributes();
registerServiceWorker();
applyAppTitle();

if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <Provider store={store}>
        <AppProviders>
          <App />
        </AppProviders>
      </Provider>
    </ErrorBoundary>,
  );
}
