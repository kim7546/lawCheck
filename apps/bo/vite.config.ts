import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { searchIndexing } from '../../packages/config/search-indexing';

export default defineConfig({
  plugins: [react(), searchIndexing()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
