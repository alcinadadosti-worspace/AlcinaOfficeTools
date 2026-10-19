// AlcinaDocs: editor de documentos com aba Página Inicial completa.
import { useEffect, useRef, useState, type ReactNode, type JSX, type ChangeEvent } from 'react'
import { MenuList, MenuItem, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, Input, Field, Checkbox } from '@fluentui/react-components'
import {
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  TextStrikethrough24Regular,
  TextSubscript24Regular,
  TextSuperscript24Regular,
  TextFont24Regular,
  FontIncrease24Regular,
  TextClearFormatting24Regular,
  TextBulletList24Regular,
  TextNumberListLtr24Regular,
  TextIndentIncrease24Regular,
  TextIndentDecrease24Regular,
  TextAlignLeft24Regular,
  TextAlignCenter24Regular,
  TextAlignRight24Regular,
  TextAlignJustify24Regular,
  TextT24Regular,
  TextHeader124Regular,
  TextHeader224Regular,
  TextHeader324Regular,
  Search24Regular,
  ArrowUndo24Regular,
  ArrowRedo24Regular,
  DocumentAdd24Regular,
  FolderOpen24Regular,
  Save24Regular,
  DocumentTable24Regular,
  ArrowDownload24Regular,
  DocumentPdf24Regular,
  Image24Regular,
  TextQuote24Regular,
  Table24Regular
} from '@fluentui/react-icons'
import type { Command } from 'prosemirror-state'
import { AppShell, type RibbonTab } from '@alcina/ui-shell'
import { getUpdater } from '@alcina/updater/renderer'
import type { UpdateStatus } from '@alcina/updater'
import { Editor, cmd, setColor, setHighlight, setFontSize, setFontFamily, setLineHeight, changeCase as cmdCase, insertImage, insertTable, table, type EditorApi, type Snapshot } from '@alcina/editor'
import { saveDoc, openDoc, importDocx, exportDocx, exportPdf, baseName } from './io'

const EMPTY: Snapshot = { strong: false, em: false, underline: false, strike: false, sub: false, sup: false, heading: 0, align: null, canUndo: false, canRedo: false }

const FONTS = ['', 'Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']
const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48]
const TEXT_COLORS: [string, string][] = [['', 'Automática'], ['#16211a', 'Preto'], ['#0f7a34', 'Verde'], ['#9a6d0c', 'Dourado'], ['#b64a38', 'Vermelho'], ['#1a5fb4', 'Azul'], ['#6d3fb0', 'Roxo']]
const HIGHLIGHTS: [string, string][] = [['', 'Nenhum'], ['#fff3a3', 'Amarelo'], ['#bdf0c6', 'Verde'], ['#ffd1dc', 'Rosa'], ['#cfe3ff', 'Azul'], ['#e7d4ff', 'Roxo']]

function swatch(c: string): JSX.Element {
  return <span style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 3, background: c || '#ffffff', border: '1px solid var(--ao-border)' }} />
}
function txt(t: string): JSX.Element {
  return <span style={{ fontWeight: 700, fontSize: 13 }}>{t}</span>
}

export function App(): ReactNode {
  const apiRef = useRef<EditorApi | null>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [path, setPath] = useState<string | null>(null)
  const [fr, setFr] = useState<{ open: boolean; find: string; replace: string; matchCase: boolean }>({ open: false, find: '', replace: '', matchCase: false })
  const [notice, setNotice] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.alcinaApp?.getVersion().then(setVersion).catch(() => undefined)
    const off = getUpdater()?.onStatus(setStatus)
    return () => off?.()
  }, [])

  const exec = (c: Command): void => void apiRef.current?.exec(c)
  const run = (fn: (api: EditorApi) => Promise<unknown>) => (): void => {
    const api = apiRef.current
    if (api) void fn(api)
  }
  const name = baseName(path)

  const runFindReplace = (): void => {
    const n = apiRef.current?.replaceAll(fr.find, fr.replace, fr.matchCase) ?? 0
    setNotice(`${n} substituição(ões) feita(s).`)
    setFr((f) => ({ ...f, open: false }))
  }

  const onPickImage = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0]
    if (f) {
      const reader = new FileReader()
      reader.onload = () => exec(insertImage(String(reader.result)))
      reader.readAsDataURL(f)
    }
    e.target.value = ''
  }

  const wordCount = (): void => {
    const s = apiRef.current?.stats()
    if (s) setNotice(`${s.words} palavra(s) · ${s.chars} caractere(s) (${s.charsNoSpaces} sem espaços).`)
  }

  const colorMenu = (apply: (c: string) => Command, list: [string, string][]): ReactNode => (
    <MenuList>
      {list.map(([v, label]) => (
        <MenuItem key={v || 'x'} icon={swatch(v)} onClick={() => exec(apply(v))}>
          {label}
        </MenuItem>
      ))}
    </MenuList>
  )

  const ribbon: RibbonTab[] = [
    {
      key: 'home',
      label: 'Página Inicial',
      groups: [
        {
          label: 'Fonte',
          items: [
            { key: 'font', label: 'Fonte', icon: <TextFont24Regular />, menu: <MenuList>{FONTS.map((f) => (<MenuItem key={f || 'def'} onClick={() => exec(setFontFamily(f))} style={{ fontFamily: f || undefined }}>{f || 'Padrão'}</MenuItem>))}</MenuList> },
            { key: 'size', label: 'Tamanho', icon: <FontIncrease24Regular />, menu: <MenuList>{SIZES.map((s) => (<MenuItem key={s} onClick={() => exec(setFontSize(s))}>{s}</MenuItem>))}</MenuList> },
            { key: 'b', label: 'Negrito', icon: <TextBold24Regular />, active: snap.strong, onClick: () => exec(cmd.bold) },
            { key: 'i', label: 'Itálico', icon: <TextItalic24Regular />, active: snap.em, onClick: () => exec(cmd.italic) },
            { key: 'u', label: 'Sublinhado', icon: <TextUnderline24Regular />, active: snap.underline, onClick: () => exec(cmd.underline) },
            { key: 's', label: 'Tachado', icon: <TextStrikethrough24Regular />, active: snap.strike, onClick: () => exec(cmd.strike) },
            { key: 'sub', label: 'Subscrito', icon: <TextSubscript24Regular />, active: snap.sub, onClick: () => exec(cmd.sub) },
            { key: 'sup', label: 'Sobrescrito', icon: <TextSuperscript24Regular />, active: snap.sup, onClick: () => exec(cmd.sup) },
            { key: 'case', label: 'Maiúsc/Minúsc', icon: txt('Aa'), menu: <MenuList><MenuItem onClick={() => exec(cmdCase('upper'))}>MAIÚSCULAS</MenuItem><MenuItem onClick={() => exec(cmdCase('lower'))}>minúsculas</MenuItem><MenuItem onClick={() => exec(cmdCase('title'))}>Iniciais Maiúsculas</MenuItem></MenuList> },
            { key: 'tcolor', label: 'Cor da fonte', icon: <span style={{ fontWeight: 700, borderBottom: '3px solid #b64a38' }}>A</span>, menu: colorMenu(setColor, TEXT_COLORS) },
            { key: 'hl', label: 'Realce', icon: swatch('#fff3a3'), menu: colorMenu(setHighlight, HIGHLIGHTS) },
            { key: 'clear', label: 'Limpar formatação', icon: <TextClearFormatting24Regular />, onClick: () => exec(cmd.clearFormat) }
          ]
        },
        {
          label: 'Parágrafo',
          items: [
            { key: 'ul', label: 'Marcadores', icon: <TextBulletList24Regular />, onClick: () => exec(cmd.bullet) },
            { key: 'ol', label: 'Numerada', icon: <TextNumberListLtr24Regular />, onClick: () => exec(cmd.ordered) },
            { key: 'indless', label: 'Diminuir recuo', icon: <TextIndentDecrease24Regular />, onClick: () => exec(cmd.indentLess) },
            { key: 'indmore', label: 'Aumentar recuo', icon: <TextIndentIncrease24Regular />, onClick: () => exec(cmd.indentMore) },
            { key: 'al', label: 'Esquerda', icon: <TextAlignLeft24Regular />, active: snap.align === 'left' || snap.align === null, onClick: () => exec(cmd.alignLeft) },
            { key: 'ac', label: 'Centro', icon: <TextAlignCenter24Regular />, active: snap.align === 'center', onClick: () => exec(cmd.alignCenter) },
            { key: 'ar', label: 'Direita', icon: <TextAlignRight24Regular />, active: snap.align === 'right', onClick: () => exec(cmd.alignRight) },
            { key: 'aj', label: 'Justificar', icon: <TextAlignJustify24Regular />, active: snap.align === 'justify', onClick: () => exec(cmd.alignJustify) },
            { key: 'ls', label: 'Espaçamento', icon: txt('↕'), menu: <MenuList><MenuItem onClick={() => exec(setLineHeight(null))}>Simples</MenuItem><MenuItem onClick={() => exec(setLineHeight('1.15'))}>1,15</MenuItem><MenuItem onClick={() => exec(setLineHeight('1.5'))}>1,5</MenuItem><MenuItem onClick={() => exec(setLineHeight('2'))}>Duplo</MenuItem></MenuList> }
          ]
        },
        {
          label: 'Estilos',
          items: [
            { key: 'p', label: 'Normal', icon: <TextT24Regular />, active: snap.heading === 0, onClick: () => exec(cmd.paragraph) },
            { key: 'h1', label: 'Título 1', icon: <TextHeader124Regular />, active: snap.heading === 1, onClick: () => exec(cmd.h1) },
            { key: 'h2', label: 'Título 2', icon: <TextHeader224Regular />, active: snap.heading === 2, onClick: () => exec(cmd.h2) },
            { key: 'h3', label: 'Título 3', icon: <TextHeader324Regular />, active: snap.heading === 3, onClick: () => exec(cmd.h3) }
          ]
        },
        {
          label: 'Edição',
          items: [
            { key: 'find', label: 'Localizar', icon: <Search24Regular />, onClick: () => setFr((f) => ({ ...f, open: true })) },
            { key: 'undo', label: 'Desfazer', icon: <ArrowUndo24Regular />, disabled: !snap.canUndo, onClick: () => exec(cmd.undo) },
            { key: 'redo', label: 'Refazer', icon: <ArrowRedo24Regular />, disabled: !snap.canRedo, onClick: () => exec(cmd.redo) }
          ]
        }
      ]
    },
    {
      key: 'insert',
      label: 'Inserir',
      groups: [
        {
          label: 'Ilustrações',
          items: [{ key: 'img', label: 'Imagem', icon: <Image24Regular />, onClick: () => imgInput.current?.click() }]
        },
        {
          label: 'Tabelas',
          items: [{ key: 'tbl', label: 'Tabela', icon: <Table24Regular />, onClick: () => exec(insertTable(3, 3)) }]
        },
        {
          label: 'Elementos',
          items: [
            { key: 'hr', label: 'Linha horizontal', icon: txt('—'), onClick: () => exec(cmd.hr) },
            { key: 'quote', label: 'Citação', icon: <TextQuote24Regular />, onClick: () => exec(cmd.quote) }
          ]
        }
      ]
    },
    {
      key: 'review',
      label: 'Revisão',
      groups: [
        {
          label: 'Revisão de texto',
          items: [{ key: 'wc', label: 'Contar palavras', icon: txt('123'), onClick: wordCount }]
        }
      ]
    },
    {
      key: 'table',
      label: 'Tabela',
      groups: [
        {
          label: 'Linhas e colunas',
          items: [
            { key: 'ar', label: 'Inserir linha', icon: txt('+L'), onClick: () => exec(table.addRowAfter) },
            { key: 'ac', label: 'Inserir coluna', icon: txt('+C'), onClick: () => exec(table.addColumnAfter) },
            { key: 'dr', label: 'Excluir linha', icon: txt('−L'), onClick: () => exec(table.deleteRow) },
            { key: 'dc', label: 'Excluir coluna', icon: txt('−C'), onClick: () => exec(table.deleteColumn) }
          ]
        },
        {
          label: 'Células',
          items: [
            { key: 'mg', label: 'Mesclar', icon: txt('⊞'), onClick: () => exec(table.mergeCells) },
            { key: 'sp', label: 'Dividir', icon: txt('⊟'), onClick: () => exec(table.splitCell) }
          ]
        },
        {
          label: 'Tabela',
          items: [{ key: 'dt', label: 'Excluir tabela', icon: txt('✕'), onClick: () => exec(table.deleteTable) }]
        }
      ]
    },
    {
      key: 'file',
      label: 'Arquivo',
      groups: [
        {
          label: 'Documento',
          items: [
            { key: 'new', label: 'Novo', icon: <DocumentAdd24Regular />, onClick: () => { apiRef.current?.setJSON({ type: 'doc', content: [{ type: 'paragraph' }] }); setPath(null) } },
            { key: 'open', label: 'Abrir', icon: <FolderOpen24Regular />, onClick: run(async (a) => { const p = await openDoc(a); if (p) setPath(p) }) },
            { key: 'save', label: 'Salvar', icon: <Save24Regular />, onClick: run(async (a) => { const p = await saveDoc(a, name); if (p) setPath(p) }) }
          ]
        },
        {
          label: 'Word e PDF',
          items: [
            { key: 'idocx', label: 'Abrir Word', icon: <DocumentTable24Regular />, onClick: run(async (a) => { const p = await importDocx(a); if (p) setPath(null) }) },
            { key: 'edocx', label: 'Salvar Word', icon: <ArrowDownload24Regular />, onClick: run(async (a) => { await exportDocx(a, name) }) },
            { key: 'epdf', label: 'Exportar PDF', icon: <DocumentPdf24Regular />, onClick: run(async (a) => { await exportPdf(a, name) }) }
          ]
        }
      ]
    }
  ]

  return (
    <AppShell appName={`${name} — Documento`} headerRight={version ? <span style={{ fontSize: 12, opacity: 0.85 }}>v{version}</span> : null} ribbon={ribbon} update={{ status, onInstall: () => void getUpdater()?.install() }}>
      {notice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'var(--ao-green-soft)', borderBottom: '1px solid var(--ao-border)', fontSize: 12, flex: 'none' }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ao-text-2)' }}>×</button>
        </div>
      )}
      <input ref={imgInput} type="file" accept="image/*" hidden onChange={onPickImage} />
      <div className="ao-doc-scroll">
        <div className="ao-doc-page">
          <Editor apiRef={apiRef} onState={setSnap} />
        </div>
      </div>

      <Dialog open={fr.open} onOpenChange={(_, d) => setFr((f) => ({ ...f, open: d.open }))}>
        <DialogSurface style={{ maxWidth: 440 }}>
          <DialogBody>
            <DialogTitle>Localizar e substituir</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Localizar">
                  <Input value={fr.find} onChange={(_, d) => setFr((f) => ({ ...f, find: d.value }))} />
                </Field>
                <Field label="Substituir por">
                  <Input value={fr.replace} onChange={(_, d) => setFr((f) => ({ ...f, replace: d.value }))} />
                </Field>
                <Checkbox label="Diferenciar maiúsculas de minúsculas" checked={fr.matchCase} onChange={(_, d) => setFr((f) => ({ ...f, matchCase: !!d.checked }))} />
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFr((f) => ({ ...f, open: false }))}>Cancelar</Button>
              <Button appearance="primary" onClick={runFindReplace} disabled={!fr.find}>Substituir tudo</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  )
}
