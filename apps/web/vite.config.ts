import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// api живёт отдельно; в dev и preview проксируем /api, в проде то же делает nginx
const apiProxy = {
  '/api': {
    target: process.env.PM_API_URL ?? 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
