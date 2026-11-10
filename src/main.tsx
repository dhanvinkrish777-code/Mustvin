import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JarvisPreferencesProvider } from './contexts/JarvisPreferencesContext';
import { JarvisSessionProvider } from './contexts/JarvisSessionContext';
import './index.css';

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('Jarvis 2.5 offline service worker ready.');
  },
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <JarvisPreferencesProvider>
      <JarvisSessionProvider>
        <App />
      </JarvisSessionProvider>
    </JarvisPreferencesProvider>
  </ErrorBoundary>
);
