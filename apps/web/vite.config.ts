import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// The monorepo keeps a single root .env; only VITE_* variables are visible to the browser.
export default defineConfig({
  plugins:[react()],
  envDir:fileURLToPath(new URL('../../',import.meta.url)),
  server:{host:'127.0.0.1',port:5173,proxy:{
    '/api':{target:'http://127.0.0.1:4000',changeOrigin:true},
    '/maps':{target:'http://127.0.0.1:8081',changeOrigin:false}
  }},
  preview:{host:'127.0.0.1'}
});
