/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the static build can be hosted from any path (Netlify, Vercel, GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { globals: true, environment: 'node' },
});
