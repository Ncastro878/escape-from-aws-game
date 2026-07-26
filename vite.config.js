import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 80
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        backrooms: fileURLToPath(new URL('./backrooms.html', import.meta.url))
      }
    }
  }
});
