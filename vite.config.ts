import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawK1 =
    env.VITE_GEMINI_API_KEY_1 ||
    env.GEMINI_API_KEY_1 ||
    env.VITE_GEMINI_API_KEY ||
    env.GEMINI_API_KEY ||
    env.GOOGLE_API_KEY ||
    env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY_1 ||
    process.env.GEMINI_API_KEY_1 ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    '';
  const rawK2 =
    env.VITE_GEMINI_API_KEY_2 ||
    env.GEMINI_API_KEY_2 ||
    env.GOOGLE_API_KEY_2 ||
    env.API_KEY_2 ||
    process.env.VITE_GEMINI_API_KEY_2 ||
    process.env.GEMINI_API_KEY_2 ||
    process.env.GOOGLE_API_KEY_2 ||
    process.env.API_KEY_2 ||
    '';
  const cleanKey = (k: string) => (k && k.trim() !== 'MY_GEMINI_API_KEY' ? k.trim() : '');

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __ENV_GEMINI_KEY_1__: JSON.stringify(cleanKey(rawK1)),
      __ENV_GEMINI_KEY_2__: JSON.stringify(cleanKey(rawK2)),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
