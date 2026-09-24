import { defineConfig } from 'vite';

// Deployment settings use runtime variables, independently of the local dev config.
const apiTarget = process.env.API_PROXY_TARGET?.trim();
const allowedHosts = [
  'office.aiqaver.com',
  'lawcheckbo-production.up.railway.app',
  process.env.RAILWAY_PUBLIC_DOMAIN ?? '',
  ...(process.env.PREVIEW_ALLOWED_HOSTS ?? '').split(','),
]
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 4174),
    strictPort: true,
    allowedHosts,
    // Never fall back to the API on the developer's computer.
    proxy: apiTarget ? { '/api': { target: apiTarget, changeOrigin: true } } : {},
  },
});
