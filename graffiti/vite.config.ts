import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'admin-hash-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/admin' || req.url === '/admin/') {
            res.statusCode = 302;
            res.setHeader('Location', '/#/admin');
            res.end();
            return;
          }
          if (req.url === '/walk' || req.url === '/walk/') {
            res.statusCode = 302;
            res.setHeader('Location', '/#/walk');
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/dist/**', '**/data/**'],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/walk-app': 'http://localhost:3001',
    },
  },
});
