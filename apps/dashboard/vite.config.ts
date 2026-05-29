import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// kepler.gl expects Node-style `global` / `process.env` globals and a single
// copy of styled-components + react. The defines + dedupe below keep its bundle
// happy under Vite's ESM dev server and build.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // kepler.gl utils import Node's `assert`; map it to a browser shim.
      assert: fileURLToPath(new URL('./src/shims/assert.ts', import.meta.url)),
    },
    dedupe: ['styled-components', 'react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      '@kepler.gl/components',
      '@kepler.gl/actions',
      '@kepler.gl/reducers',
      'react-redux',
      'redux',
      'react-palm/tasks',
      'styled-components',
    ],
  },
});
