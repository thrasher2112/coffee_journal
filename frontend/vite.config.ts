import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || 'http://localhost:8000')
    },
    server: {
      port: 5173,
      host: true
    }
  };
});
