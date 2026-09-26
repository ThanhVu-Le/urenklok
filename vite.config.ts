/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vaste tijdzone voor tests, zodat middernacht- en zomertijdtests overal hetzelfde uitpakken.
process.env.TZ = 'Europe/Amsterdam';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
