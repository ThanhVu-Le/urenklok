/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // Vaste tijdzone zodat middernacht- en DST-tests overal hetzelfde uitpakken.
    env: { TZ: 'Europe/Amsterdam' },
  },
});
