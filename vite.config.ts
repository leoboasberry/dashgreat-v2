import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyConfig = {
  '/api/greatpages': {
    target: 'https://api.greatpages.com.br',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/greatpages/, '/v1'),
    headers: {
      Origin: 'https://api.greatpages.com.br',
    },
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: proxyConfig },
  preview: { proxy: proxyConfig, allowedHosts: 'all' },
})
