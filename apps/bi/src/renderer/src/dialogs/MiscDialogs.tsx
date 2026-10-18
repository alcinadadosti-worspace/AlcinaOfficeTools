// Diálogos gerais: erro, salvar alterações, sobre, mostrar dados, tema, opções e página.
import { useEffect, useState } from 'react'
import { Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, Switch, Input, Field, Spinner, TabList, Tab } from '@fluentui/react-components'
import type { AppInfo } from '@shared/ipc'
import type { VQResult } from '@engine/vq/types'
import type { TableDataResult } from '@engine/service'
import { toJsonScalar } from '@engine/query/types'
import { useUi } from '../state/ui'
import { getDoc, updateDoc, useDoc } from '../state/doc'
import { continueAfterSave, fileTitle } from '../actions/file'
import { engine } from '../engine/client'
import { enqueue } from '../actions/model'
import { buildQuery } from '../visuals/query'
import { PreviewGrid, type GridCell } from '../components/PreviewGrid'
import { formatKey, formatValue } from '../util/fmt'
import { Logo } from '../components/Logo'
import { Kbd } from '../components/ui'
import { THEMES, parseThemeJson, themeToJson } from '../report/themes'
import type { ReportTheme } from '../report/types'
import { ColorInput } from '../panes/FormatPane'
import { setPageProps } from '../actions/report'
import { formatScalar } from '@engine/data/format'
import { fromJsonScalar } from '@engine/query/types'

const close = () => useUi.getState().closeDialog()

export function ErrorDialog({ title, message }: { title: string; message: string }) {
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 620 }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className="ab-selectable" style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto', fontSize: 13 }}>
              {message}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => void navigator.clipboard.writeText(message)}>Copiar detalhes</Button>
            <Button appearance="primary" onClick={close}>
              Fechar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function SaveChangesDialog({ then, path }: { then: 'close' | 'new' | 'open'; path?: string }) {
  const filePath = useDoc((s) => s.filePath)
  const run = (choice: 'save' | 'discard') => {
    close()
    void continueAfterSave(choice, then, path)
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 460 }}>
        <DialogBody>
          <DialogTitle>Deseja salvar as alterações?</DialogTitle>
          <DialogContent>Há alterações não salvas em "{fileTitle(filePath)}".</DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => run('save')}>
              Salvar
            </Button>
            <Button onClick={() => run('discard')}>Não salvar</Button>
            <Button onClick={close}>Cancelar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function AboutDialog() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.alcina.info().then(setInfo)
  }, [])
  const shortcuts: [string, string][] = [
    ['Ctrl+S', 'Salvar'],
    ['Ctrl+Shift+S', 'Salvar como'],
    ['Ctrl+O', 'Abrir'],
    ['Ctrl+N', 'Novo relatório'],
    ['Ctrl+Z / Ctrl+Y', 'Desfazer / Refazer'],
    ['Ctrl+C / Ctrl+V', 'Copiar / Colar visual'],
    ['Ctrl+D', 'Duplicar visual'],
    ['Delete', 'Excluir visual'],
    ['Setas (Shift)', 'Mover visual 1px (10px)'],
    ['Ctrl+clique', 'Seleção múltipla de dados/visuais'],
    ['F5', 'Executar consulta DAX'],
    ['Esc', 'Sair do modo de foco / limpar seleção']
  ]
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Logo size={28} /> AlcinaBi Desktop
            </span>
          </DialogTitle>
          <DialogContent>
            <div style={{ color: 'var(--ab-text-2)', marginBottom: 12 }}>
              Versão {info?.version ?? '...'} · Electron {info?.electron} · Chromium {info?.chrome}
            </div>
            <div style={{ marginBottom: 12 }}>Análise de dados, modelagem com fórmulas DAX e relatórios interativos — tudo localmente, no seu computador.</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Atalhos de teclado</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13 }}>
              {shortcuts.map(([k, d]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <div>
                    <Kbd>{k}</Kbd>
                  </div>
                  <div>{d}</div>
                </div>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={close}>
              Fechar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function ShowDataDialog({ visualId }: { visualId: string }) {
  const [tab, setTab] = useState<'data' | 'rows'>('data')
  const [result, setResult] = useState<VQResult | null>(null)
  const [detail, setDetail] = useState<TableDataResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const doc = getDoc()
  const page = doc.report.pages.find((p) => p.visuals.some((v) => v.id === visualId))
  const visual = page?.visuals.find((v) => v.id === visualId)
  useEffect(() => {
    if (!page || !visual) return
    const built = buildQuery(visual, { report: doc.report, page, selection: useUi.getState().selection[page.id] ?? null })
    if (!built) {
      setError('O visual não tem campos.')
      return
    }
    enqueue(() => engine.executeVisual({ ...built.query, limit: 100_000 }))
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // Linhas de detalhe: tabela fato do primeiro valor (ou da primeira coluna).
    const firstVal = built.values[0]?.field ?? built.groups[0]?.field
    if (firstVal) {
      const measureTable = firstVal.measure ? doc.model.tables.find((t) => t.measures.some((m) => m.name === firstVal.measure))?.name : firstVal.table
      if (measureTable) {
        enqueue(() => engine.detailRows(measureTable, built.query.filters, 2000))
          .then(setDetail)
          .catch(() => undefined)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualId])
  const dataRows: GridCell[][] =
    result?.rows.map((row) => row.map((v, i) => (v === null ? null : result.columns[i].kind === 'group' ? formatKey(v, result.columns[i].field, result.columns[i].format, result.columns[i].type) : formatValue(v, result.columns[i].format, result.columns[i].type)))) ?? []
  const detailRows: GridCell[][] = detail?.rows.map((row) => row.map((v, i) => (v === null ? null : formatScalar(fromJsonScalar(v), detail.columns[i].format, detail.columns[i].type)))) ?? []
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 1100, width: '92vw' }}>
        <DialogBody>
          <DialogTitle>Dados do visual</DialogTitle>
          <DialogContent>
            <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'data' | 'rows')}>
              <Tab value="data">Dados</Tab>
              <Tab value="rows">Registros (detalhes)</Tab>
            </TabList>
            <div style={{ height: 420, marginTop: 8, border: '1px solid var(--ab-border)', borderRadius: 4, overflow: 'hidden' }}>
              {error && <div style={{ padding: 12, color: 'var(--ab-danger)' }}>{error}</div>}
              {!error && tab === 'data' && (result ? <PreviewGrid columns={result.columns.map((c) => ({ name: c.name, type: c.kind === 'value' ? 'number' : c.type }))} rows={dataRows} rowNumbers /> : <Spinner />)}
              {!error && tab === 'rows' && (detail ? <PreviewGrid columns={detail.columns.map((c) => ({ name: c.name, type: c.type }))} rows={detailRows} rowCount={detail.rowCount} /> : <Spinner />)}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={close}>
              Fechar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function ThemeDialog() {
  const current = useDoc((s) => s.doc.report.theme)
  const [t, setT] = useState<ReportTheme>(current)
  const apply = () => {
    updateDoc('Tema', (d) => void (d.report.theme = t))
    close()
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 640 }}>
        <DialogBody>
          <DialogTitle>Personalizar tema</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {THEMES.map((x) => (
                <Button key={x.name} size="small" appearance={t.name === x.name ? 'primary' : 'secondary'} onClick={() => setT(x)}>
                  {x.name}
                </Button>
              ))}
            </div>
            <Field label="Nome">
              <Input value={t.name} onChange={(_, d) => setT({ ...t, name: d.value })} />
            </Field>
            <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>Cores dos dados</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {t.dataColors.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, fontSize: 12, color: 'var(--ab-text-3)' }}>{i + 1}</span>
                  <ColorInput value={c} allowAuto={false} onChange={(v) => setT({ ...t, dataColors: t.dataColors.map((x, k) => (k === i ? v || x : x)) })} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
              <Field label="Destaque das tabelas">
                <ColorInput value={t.tableAccent} allowAuto={false} onChange={(v) => setT({ ...t, tableAccent: v || t.tableAccent })} />
              </Field>
              <Field label="Plano de fundo das páginas">
                <ColorInput value={t.pageBackground ?? ''} onChange={(v) => setT({ ...t, pageBackground: v || undefined })} />
              </Field>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ab-text-2)', marginTop: 12 }}>
              As paletas padrão foram escolhidas para continuar distinguíveis por pessoas com daltonismo. Ao trocar cores, prefira tons com contraste entre vizinhos.
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={async () => {
                const p = await window.alcina.dialog.open({ title: 'Importar tema', filters: [{ name: 'Tema JSON', extensions: ['json'] }] })
                if (!p?.[0]) return
                try {
                  const bytes = await window.alcina.fs.read(p[0])
                  setT(parseThemeJson(new TextDecoder().decode(bytes)))
                } catch (e) {
                  useUi.getState().toast({ intent: 'error', title: 'Tema inválido', body: e instanceof Error ? e.message : String(e) })
                }
              }}
            >
              Importar tema...
            </Button>
            <Button
              onClick={async () => {
                const path = await window.alcina.dialog.save({ title: 'Exportar tema', defaultPath: `${t.name}.json`, filters: [{ name: 'Tema JSON', extensions: ['json'] }] })
                if (path) await window.alcina.fs.write(path, new TextEncoder().encode(themeToJson(t)))
              }}
            >
              Exportar...
            </Button>
            <Button appearance="primary" onClick={apply}>
              Aplicar
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function OptionsDialog() {
  const autoDate = useDoc((s) => s.doc.model.autoDateTime)
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 560 }}>
        <DialogBody>
          <DialogTitle>Opções</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Switch
                checked={autoDate}
                label="Data/hora automática: criar hierarquia (Ano, Trimestre, Mês, Dia) para colunas de data"
                onChange={(_, d) => updateDoc('Data/hora automática', (doc) => void (doc.model.autoDateTime = d.checked))}
              />
              <div style={{ fontSize: 12, color: 'var(--ab-text-2)' }}>
                Os dados são processados localmente pelo motor do AlcinaBi. Arquivos .alcbi guardam o modelo, o relatório e uma cópia compactada dos dados carregados.
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={close}>
              OK
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function PageSettingsDialog({ pageId }: { pageId: string }) {
  const page = useDoc((s) => s.doc.report.pages.find((p) => p.id === pageId))
  if (!page) return null
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 420 }}>
        <DialogBody>
          <DialogTitle>Configurações da página</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Largura (px)">
                <Input type="number" value={String(page.width)} onChange={(_, d) => Number(d.value) >= 200 && setPageProps(pageId, { width: Number(d.value) })} />
              </Field>
              <Field label="Altura (px)">
                <Input type="number" value={String(page.height)} onChange={(_, d) => Number(d.value) >= 150 && setPageProps(pageId, { height: Number(d.value) })} />
              </Field>
            </div>
            <Field label="Cor da tela de fundo" style={{ marginTop: 8 }}>
              <ColorInput value={page.background.color} allowAuto={false} onChange={(c) => setPageProps(pageId, { background: { ...page.background, color: c || '#ffffff' } })} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={close}>
              OK
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export { toJsonScalar }
