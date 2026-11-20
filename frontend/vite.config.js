import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser calls /api on the Vite origin and Vite forwards it to Express,
// so local runs use the same single-origin layout (and session cookie) as the EC2 deployment.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
