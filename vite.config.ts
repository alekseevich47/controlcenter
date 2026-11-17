import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { lccLocalApiPlugin } from './vite.localApi.ts'

const host = process.env.TAURI_DEV_HOST
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

/** Только эти пути dev-сервера уходят на api.sweb.ru. Другие хосты и классы не проксируются. */
const SWEB_PROXY_PATHS: ReadonlySet<string> = new Set([
  '/sweb/vps',
  '/sweb/vps/ip',
  '/sweb/notAuthorized',
  '/sweb/notAuthorized/',
])

function swebDevBypass(url: string | undefined): string | undefined {
  const raw = url ?? ''
  if (raw.includes('..') || raw.includes('\\') || raw.includes('%') || raw.includes('?') || raw.includes('#')) {
    return '/__sweb_blocked'
  }
  return SWEB_PROXY_PATHS.has(raw) ? undefined : '/__sweb_blocked'
}

function swebDevRewrite(path: string): string {
  const bare = path.split('?')[0] ?? ''
  if (bare === '/sweb/vps') return '/vps'
  if (bare === '/sweb/vps/ip') return '/vps/ip'
  if (bare === '/sweb/notAuthorized' || bare === '/sweb/notAuthorized/') return '/notAuthorized/'
  return '/__lcc_sweb_blocked'
}

export default defineConfig({
  plugins: [react(), lccLocalApiPlugin()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    // Win: `false`/`localhost` часто даёт только ::1; Tauri ждёт IPv4 → таймаут.
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/sweb': {
        target: 'https://api.sweb.ru',
        changeOrigin: true,
        secure: true,
        rewrite: swebDevRewrite,
        bypass(req) {
          return swebDevBypass(req.url)
        },
      },
    },
  },
})
