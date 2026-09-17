import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
// Fonts are self-hosted rather than pulled from the Google Fonts CDN: the API
// serves the app under `Content-Security-Policy: default-src 'self'`, which
// blocks the CDN outright, and bundled fonts also survive going offline.
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles/index.css';
import './styles/variables.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register only. This used to unregister every worker first, which left the
    // page uncontrolled on most loads and made offline support a coin flip. The
    // stale-worker problem that guarded against is handled inside sw.js, which
    // skips /api/ requests outright and claims clients on activate.
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}
