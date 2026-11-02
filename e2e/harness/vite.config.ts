import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
const h = (f: string) => path.resolve(__dirname, f);
export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: /^(.*\/contexts|\.)\/AuthContext$/, replacement: h('AuthContext.tsx') },
    { find: /^(.*\/contexts|\.)\/CampaignDataContext$/, replacement: h('CampaignDataContext.tsx') },
    { find: /^.*\/contexts\/ConfirmContext$/, replacement: h('ConfirmContext.tsx') },
    { find: /^(\.{1,2}\/)+(lib\/)?entityService$/, replacement: h('entityService.ts') },
    { find: /^(\.{1,2}\/)+(lib\/)?(play\/)?live$/, replacement: h('live.ts') },
    { find: /^(\.{1,2}\/)+(lib\/)?chat\/service$/, replacement: h('service.ts') },
    { find: /^.*\/firebase$/, replacement: h('firebase.ts') },
    { find: /^.*\/contexts\/ActiveScenesContext$/, replacement: h('ActiveScenesContext.tsx') },
    { find: /^.*\/contexts\/PeekContext$/, replacement: h('PeekContext.tsx') },
    { find: /^.*\/hooks\/useScene$/, replacement: h('useScene.ts') },
    { find: /^.*\/hooks\/useImageSrc$/, replacement: h('useImageSrc.ts') },
    { find: /^(\.{1,2}\/)+(lib\/)?(battle\/)?sceneService$/, replacement: h('sceneService.ts') },
  ] },
  server: { port: 5310, strictPort: true },
});
