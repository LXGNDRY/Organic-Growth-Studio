import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the "@/*" path alias from tsconfig.json. Without it, Vitest cannot
// resolve any module that imports through "@/", which previously made
// src/lib/analyzer.ts untestable.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
