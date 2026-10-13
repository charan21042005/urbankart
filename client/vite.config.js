import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import net from 'node:net';

const apiProxyTarget = process.env.URBANKART_DEV_API_PROXY || 'http://127.0.0.1:5000';
const parsedApiTarget = new URL(apiProxyTarget);
const apiHost = parsedApiTarget.hostname.replace(/^\[|\]$/g, '');
const isLoopback = apiHost === 'localhost' || apiHost === '::1'
  || (net.isIP(apiHost) === 4 && apiHost.startsWith('127.'));
if (parsedApiTarget.protocol !== 'http:' || !isLoopback || parsedApiTarget.username || parsedApiTarget.password
  || parsedApiTarget.pathname !== '/' || parsedApiTarget.search || parsedApiTarget.hash) {
  throw new Error('URBANKART_DEV_API_PROXY must be a loopback HTTP origin without credentials or a path.');
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
