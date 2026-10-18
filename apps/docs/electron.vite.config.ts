import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = (p: string): string => resolve('../../packages', p)

const alias = {
  '@alcina/brand/global.css': pkg('brand/src/global.css'),
  '@alcina/brand': pkg('brand/src/index.ts'),
  '@alcina/ui-shell': pkg('ui-shell/src/index.ts'),
  '@alcina/updater/main': pkg('updater/src/main.ts'),
  '@alcina/updater/renderer': pkg('updater/src/renderer.ts'),
  '@alcina/updater': pkg('updater/src/index.ts')
}

export default defineConfig({
  main: {
    resolve: { alias },
    // libs pesadas resolvidas em runtime (node_modules empacotado pelo electron-builder).
    build: { rollupOptions: { external: ['electron-updater', 'mammoth', 'docx'] } }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    resolve: { alias },
    plugins: [react()]
  }
})
