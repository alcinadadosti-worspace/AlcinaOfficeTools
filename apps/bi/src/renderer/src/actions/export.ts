// Exportação: dados dos visuais (CSV) e relatório (PDF).
import { fromJsonScalar, type JsonScalar } from '@engine/query/types'
import { engine } from '../engine/client'
import { enqueue } from './model'
import { getDoc, useDoc } from '../state/doc'
import { useUi } from '../state/ui'
import type { PageDef, VisualDef } from '../report/types'
import { buildQuery } from '../visuals/query'
import { formatKey } from '../util/fmt'
import { fileTitle } from './file'

function csvCell(s: string): string {
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rawText(v: JsonScalar): string {
  if (v === null || v === undefined) return ''
  const s = fromJsonScalar(v)
  if (typeof s === 'number') return String(s).replace('.', ',')
  if (typeof s === 'boolean') return s ? 'Verdadeiro' : 'Falso'
  if (typeof s === 'string') return s
  return formatKey(v)
}

export async function exportVisualCsv(page: PageDef, v: VisualDef): Promise<void> {
  const ui = useUi.getState()
  const built = buildQuery(v, { report: getDoc().report, page, selection: ui.selection[page.id] ?? null })
  if (!built) {
    ui.toast({ intent: 'warning', title: 'O visual não tem dados para exportar.' })
    return
  }
  const r = await enqueue(() => engine.executeVisual({ ...built.query, limit: 1_000_000 }))
  const lines = [r.columns.map((c) => csvCell(c.name)).join(';')]
  for (const row of r.rows) lines.push(row.map((x, i) => csvCell(r.columns[i].kind === 'group' ? (x === null ? '' : formatKey(x, r.columns[i].field, r.columns[i].format, r.columns[i].type)) : rawText(x))).join(';'))
  const path = await window.alcina.dialog.save({ title: 'Exportar dados', defaultPath: 'dados.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] })
  if (!path) return
  const bytes = new TextEncoder().encode('﻿' + lines.join('\r\n'))
  await window.alcina.fs.write(path, bytes)
  ui.toast({ intent: 'success', title: 'Dados exportados', body: `${r.rows.length.toLocaleString('pt-BR')} linha(s).` })
}

/** Exporta todas as páginas visíveis do relatório como PDF. */
export async function exportPdf(): Promise<void> {
  const ui = useUi.getState()
  const doc = getDoc()
  const path = await window.alcina.dialog.save({
    title: 'Exportar para PDF',
    defaultPath: `${fileTitle(useDoc.getState().filePath)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!path) return
  const original = ui.activePageId
  const prevView = ui.view
  const prevSelection = ui.selectedVisualIds
  // Sem sobreposição de carregamento: a página é capturada da tela.
  ui.set({ view: 'report', selectedVisualIds: [], focusVisualId: null })
  ui.toast({ intent: 'info', title: 'Exportando para PDF...', body: 'Aguarde enquanto as páginas são capturadas.' })
  const images: { data: string; w: number; h: number }[] = []
  try {
    for (const p of doc.report.pages.filter((x) => !x.hidden)) {
      ui.set({ activePageId: p.id })
      await new Promise((r) => setTimeout(r, 1400))
      const el = document.querySelector('[data-report-page]') as HTMLElement | null
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const png = await window.alcina.window.capture({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      const b64 = btoa(Array.from(png, (c) => String.fromCharCode(c)).join(''))
      images.push({ data: `data:image/png;base64,${b64}`, w: p.width, h: p.height })
    }
    const w = images[0]?.w ?? 1280
    const h = images[0]?.h ?? 720
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0;padding:0}img{display:block;width:${w}px;height:${h}px;page-break-after:always}</style></head><body>${images
      .map((i) => `<img src="${i.data}">`)
      .join('')}</body></html>`
    await window.alcina.app.exportPdf({ path, html, landscape: w > h, widthPx: w, heightPx: h })
    ui.toast({ intent: 'success', title: 'PDF exportado', body: path })
  } catch (e) {
    ui.openDialog({ kind: 'error', title: 'Falha ao exportar PDF', message: e instanceof Error ? e.message : String(e) })
  } finally {
    useUi.getState().set({ activePageId: original, view: prevView, selectedVisualIds: prevSelection, loading: null })
  }
}
