import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET?.trim();
const allowedHosts = [
  'admin.aiqaver.com',
  process.env.RAILWAY_PUBLIC_DOMAIN ?? '',
  ...(process.env.PREVIEW_ALLOWED_HOSTS ?? '').split(','),
]
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 4175),
    strictPort: true,
    allowedHosts,
    // The Admin host proxies requests to the shared API; its cookies remain host-only.
    // Deployment must never fall back to the developer's local API.
    proxy: apiTarget ? { '/api': { target: apiTarget, changeOrigin: true } } : {},
  },
});
