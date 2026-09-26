import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Genereert favicon, apple-touch-icon en PWA-iconen uit public/icon.svg (npm run icons).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background: '#2f6f5e' } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: '#2f6f5e' } },
  },
  images: ['public/icon.svg'],
});
