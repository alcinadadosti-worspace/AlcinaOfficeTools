import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@engine': resolve('src/engine'),
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer/src'),
  '@alcina/updater/main': resolve('../../packages/updater/src/main.ts'),
  '@alcina/updater': resolve('../../packages/updater/src/index.ts')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      // Tudo é empacotado no bundle, exceto o electron-updater (resolvido em runtime).
      externalizeDeps: false,
      rollupOptions: { external: ['electron-updater'] }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    worker: {
      format: 'es'
    },
    // Pré-empacota as dependências pesadas do motor/UI para evitar o recarregamento
    // automático do Vite no meio da primeira carga (quando descobre papaparse/xlsx etc.).
    optimizeDeps: {
      include: ['papaparse', 'xlsx', 'fflate', 'immer', 'zustand', 'echarts', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers']
    },
    build: {
      chunkSizeWarningLimit: 6000
    }
  }
})
