// IPC compartilhado por todas as ferramentas da suíte — registrado UMA vez no app único.
// (No modelo antigo, cada app registrava estes mesmos canais; aqui eles existem uma só vez.)
import { app, BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

interface DialogOpts {
  filters?: FileFilter[]
  defaultPath?: string
}

export function registerCommonIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  ipcMain.handle('dialog:open', async (e, opts: DialogOpts) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(w!, { filters: opts?.filters, properties: ['openFile'] })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('dialog:save', async (e, opts: DialogOpts) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showSaveDialog(w!, { filters: opts?.filters, defaultPath: opts?.defaultPath })
    return res.canceled || !res.filePath ? null : res.filePath
  })
  ipcMain.handle('fs:read', async (_e, path: string) => {
    const b = await fs.readFile(path)
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  })
  ipcMain.handle('fs:write', async (_e, path: string, data: Uint8Array) => {
    await fs.writeFile(path, Buffer.from(data))
  })

  // Impressão em PDF (usada por Documentos e Notas). Documentos passa cabeçalho/rodapé opcionais;
  // Notas chama sem opções — o mesmo handler atende os dois.
  ipcMain.handle('pdf:print', async (_e, html: string, path: string, opts?: { header?: string; footer?: string; pageNumbers?: boolean }) => {
    const tmp = join(tmpdir(), `alcinaoffice-${process.pid}-${Date.now()}.html`)
    await fs.writeFile(tmp, html, 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
    try {
      await win.loadFile(tmp)
      const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const useHF = !!(opts && (opts.header || opts.footer || opts.pageNumbers))
      const pdfOpts: Parameters<typeof win.webContents.printToPDF>[0] = { printBackground: true }
      if (useHF) {
        const pn = opts!.pageNumbers ? ' <span class="pageNumber"></span> / <span class="totalPages"></span>' : ''
        pdfOpts.displayHeaderFooter = true
        pdfOpts.margins = { top: 1.2, bottom: 1.2, left: 0.8, right: 0.8 }
        pdfOpts.headerTemplate = `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 1.5cm;">${esc(opts!.header ?? '')}</div>`
        pdfOpts.footerTemplate = `<div style="font-size:9px;width:100%;text-align:center;color:#666;padding:0 1.5cm;">${esc(opts!.footer ?? '')}${pn}</div>`
      } else {
        pdfOpts.margins = { top: 1, bottom: 1, left: 0.8, right: 0.8 }
      }
      const pdf = await win.webContents.printToPDF(pdfOpts)
      await fs.writeFile(path, pdf)
    } finally {
      win.destroy()
      await fs.unlink(tmp).catch(() => undefined)
    }
  })
}
