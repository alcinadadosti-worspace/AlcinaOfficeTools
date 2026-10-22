import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = (p: string): string => resolve('../../packages', p)

// Mais específicos primeiro (o Vite usa o primeiro alias que casar).
const alias = {
  '@alcina/brand/global.css': pkg('brand/src/global.css'),
  '@alcina/brand': pkg('brand/src/index.ts'),
  '@alcina/ui-shell': pkg('ui-shell/src/index.ts'),
  '@alcina/updater/main': pkg('updater/src/main.ts'),
  '@alcina/updater/renderer': pkg('updater/src/renderer.ts'),
  '@alcina/updater': pkg('updater/src/index.ts'),
  '@alcina/sheets-engine': pkg('sheets-engine/src/index.ts'),
  '@alcina/editor/editor.css': pkg('editor/src/editor.css'),
  '@alcina/editor/docmodel': pkg('editor/src/docmodel.ts'),
  '@alcina/editor': pkg('editor/src/index.ts'),
  // Aliases internos do Analytics (BI) — apontam para a subárvore src/bi/.
  '@engine': resolve('src/bi/engine'),
  '@shared': resolve('src/bi/shared'),
  '@renderer': resolve('src/bi/renderer/src')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      // Libs resolvidas em runtime (empacotadas pelo electron-builder, fora do bundle do main).
      rollupOptions: { external: ['electron-updater', 'mammoth', 'docx', 'pptxgenjs', 'jszip'] }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: {
          central: resolve('src/central/preload/index.ts'),
          sheets: resolve('src/sheets/preload/index.ts'),
          docs: resolve('src/docs/preload/index.ts'),
          point: resolve('src/point/preload/index.ts'),
          notes: resolve('src/notes/preload/index.ts'),
          bi: resolve('src/bi/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    // Raiz compartilhada: cada ferramenta tem sua própria página sob src/<ferramenta>/renderer/.
    root: resolve('src'),
    resolve: { alias },
    plugins: [react()],
    // O Analytics (BI) usa um Web Worker para o motor de dados.
    worker: { format: 'es' },
    optimizeDeps: {
      include: ['papaparse', 'xlsx', 'fflate', 'immer', 'zustand', 'echarts', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers']
    },
    build: {
      chunkSizeWarningLimit: 6000,
      rollupOptions: {
        input: {
          central: resolve('src/central/renderer/index.html'),
          sheets: resolve('src/sheets/renderer/index.html'),
          docs: resolve('src/docs/renderer/index.html'),
          point: resolve('src/point/renderer/index.html'),
          notes: resolve('src/notes/renderer/index.html'),
          bi: resolve('src/bi/renderer/index.html')
        }
      }
    }
  }
})
