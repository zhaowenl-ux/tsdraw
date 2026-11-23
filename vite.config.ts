import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'TSDraw',
      fileName: (format) => `tsdraw.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
  },
});
