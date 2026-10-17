import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'CONVEX_');
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(env.CONVEX_URL) },
    server: {
      watch: { ignored: ['**/.verification/**'] },
      proxy: { '/api': { target: env.CONVEX_SITE_URL, changeOrigin: true } },
    },
  };
});
