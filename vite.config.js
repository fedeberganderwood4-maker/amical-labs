import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { app: path.resolve(process.cwd(), 'src/app-entry.js') },
      output: { entryFileNames: 'assets/amical-app.js' },
    },
  },
});
