import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    base: command === 'build' ? './' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: !disableHmr,
      ws: disableHmr ? false : undefined,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: disableHmr ? null : {},
    },
  };
});
