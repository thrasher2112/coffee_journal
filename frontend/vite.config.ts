import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // In production the API and the SPA are served from one origin, so the base is
  // empty and requests go out as relative `/api/...` paths. The dev server keeps
  // that shape by proxying `/api` to the backend instead of making the browser
  // talk cross-origin - dev then matches prod rather than diverging from it.
  // VITE_PROXY_TARGET exists because the backend is `localhost:8000` on the host
  // but `api:8000` inside the compose network.
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000';

  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL ?? '')
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: false }
      }
    }
  };
});
