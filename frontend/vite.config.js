import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiToken = env.APIMON_API_TOKEN;
  const apiTarget = env.APIMON_API_ORIGIN || 'http://127.0.0.1:8787';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', proxyRequest => {
              // Local-only server-side proxy: the token never enters browser code.
              proxyRequest.removeHeader('origin');
              if (apiToken) proxyRequest.setHeader('Authorization', 'Bearer ' + apiToken);
            });
          }
        }
      }
    }
  };
});
