// Faixa de opções (ribbon) com as abas de comandos.
import { useState, type ReactElement, type ReactNode } from 'react'
import { Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MenuDivider, Tooltip } from '@fluentui/react-components'
import {
  ClipboardPaste24Regular,
  Cut20Regular,
  Copy20Regular,
  Database24Regular,
  DocumentTable24Regular,
  TableEdit24Regular,
  TableSettings24Regular,
  ArrowSync24Regular,
  DataBarVerticalAdd24Regular,
  TextT24Regular,
  Calculator24Regular,
  DocumentAdd24Regular,
  CursorClick24Regular,
  Shapes24Regular,
  Image24Regular,
  Organization24Regular,
  TableInsertColumn24Regular,
  TableAdd24Regular,
  CalendarLtr24Regular,
  Color24Regular,
  PageFit24Regular,
  Filter24Regular,
  PaintBrush24Regular,
  DocumentPdf24Regular,
  QuestionCircle24Regular,
  Info24Regular,
  Keyboard24Regular,
  Globe24Regular,
  DocumentText24Regular,
  Braces24Regular,
  Folder24Regular,
  AlignLeft24Regular,
  ChevronDown12Regular,
  Database20Regular,
  Settings24Regular,
  Wand24Regular,
  DataBarVertical24Regular,
  PanelLeft24Regular,
  Lightbulb24Regular
} from '@fluentui/react-icons'
import { useUi } from '../state/ui'
import { useDoc } from '../state/doc'
import { commands, getData, newColumn, newMeasure, newTable } from '../actions/commands'
import { activePage, addPage, addVisual, alignVisuals, bringTo, copyVisuals, deleteVisuals, duplicatePage, pasteVisuals, setPageProps } from '../actions/report'
import { autoDetectRelationships, setTableProps } from '../actions/model'
import { VISUALS, GALLERY_ORDER } from '../visuals/registry'
import { VisualIcon } from '../visuals/icons'
import { THEMES } from '../report/themes'
import { updateDoc } from '../state/doc'
import { Backstage } from './Backstage'

type TabKey = 'home' | 'insert' | 'modeling' | 'view' | 'help'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Página Inicial' },
  { key: 'insert', label: 'Inserir' },
  { key: 'modeling', label: 'Modelagem' },
  { key: 'view', label: 'Exibir' },
  { key: 'help', label: 'Ajuda' }
]

function Big({ icon, label, onClick, disabled, menu }: { icon: ReactElement; label: string; onClick?: () => void; disabled?: boolean; menu?: ReactNode }) {
  const btn = (
    <button
      className="ab-ribbon-big"
      disabled={disabled}
      onClick={menu ? undefined : onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 2,
        minWidth: 54,
        maxWidth: 82,
        height: 72,
        padding: '6px 4px 2px',
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        color: disabled ? 'var(--ab-text-3)' : 'var(--ab-text)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12,
        lineHeight: '14px',
        textAlign: 'center'
      }}
    >
      <span style={{ color: disabled ? 'var(--ab-text-3)' : 'var(--ab-accent-strong)', display: 'flex' }}>{icon}</span>
      <span style={{ whiteSpace: 'normal' }}>
        {label}
        {menu && <ChevronDown12Regular style={{ marginLeft: 2, verticalAlign: 'middle' }} />}
      </span>
    </button>
  )
  if (!menu) return btn
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>{btn}</MenuTrigger>
      <MenuPopover>
        <MenuList>{menu}</MenuList>
      </MenuPopover>
    </Menu>
  )
}

function Small({ icon, label, onClick, disabled }: { icon: ReactElement; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      className="ab-ribbon-small"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 6px',
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        color: disabled ? 'var(--ab-text-3)' : 'var(--ab-text)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 12,
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{ display: 'flex', color: disabled ? 'var(--ab-text-3)' : 'var(--ab-accent-strong)' }}>{icon}</span>
      {label}
    </button>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 6px', borderRight: '1px solid var(--ab-border)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1 }}>{children}</div>
      <div style={{ fontSize: 11, color: 'var(--ab-text-3)', textAlign: 'center', paddingBottom: 3 }}>{label}</div>
    </div>
  )
}

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 4 }}>{children}</div>
}

function GetDataMenu() {
  return (
    <>
      <MenuItem icon={<DocumentTable24Regular />} onClick={() => void getData('excel')}>
        Pasta de trabalho do Excel
      </MenuItem>
      <MenuItem icon={<DocumentText24Regular />} onClick={() => void getData('csv')}>
        Texto/CSV
      </MenuItem>
      <MenuItem icon={<Braces24Regular />} onClick={() => void getData('json')}>
        JSON
      </MenuItem>
      <MenuItem icon={<Folder24Regular />} onClick={() => void getData('folder')}>
        Pasta
      </MenuItem>
      <MenuItem icon={<Globe24Regular />} onClick={() => void getData('web')}>
        Web
      </MenuItem>
      <MenuItem icon={<Database20Regular />} onClick={() => void getData('database')}>
        Banco de dados (PostgreSQL, MySQL, SQL Server)
      </MenuItem>
      <MenuItem icon={<TableEdit24Regular />} onClick={() => void getData('enterData')}>
        Inserir dados
      </MenuItem>
      <MenuDivider />
      <MenuItem onClick={() => useUi.getState().openDialog({ kind: 'getData' })}>Mais...</MenuItem>
    </>
  )
}

function VisualGallery() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 30px)', gap: 2, padding: 6 }}>
      {GALLERY_ORDER.map((t) => {
        const def = VISUALS.find((v) => v.type === t)!
        return (
          <Tooltip key={t} content={def.name} relationship="label">
            <button
              onClick={() => addVisual(t)}
              style={{ width: 30, height: 30, border: 'none', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--ab-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <VisualIcon type={t} />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

export function Ribbon() {
  const [tab, setTab] = useState<TabKey>('home')
  const [backstage, setBackstage] = useState(false)
  const hasModel = useDoc((s) => s.doc.model.tables.length > 0)
  const hasQueries = useDoc((s) => s.doc.queries.length > 0)
  const selected = useUi((s) => s.selectedVisualIds)
  const view = useUi((s) => s.view)
  const panes = useUi((s) => s.panes)
  const theme = useDoc((s) => s.doc.report.theme)
  const fieldSel = useUi((s) => s.fieldSelection)
  const page = activePage()

  const togglePane = (k: keyof typeof panes) => useUi.getState().set({ panes: { ...panes, [k]: !panes[k] } })

  return (
    <div style={{ background: 'var(--ab-ribbon-bg)', borderBottom: '1px solid var(--ab-border)', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 32, paddingLeft: 4, gap: 2 }}>
        <button
          onClick={() => setBackstage(true)}
          style={{ height: 30, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--ab-text)' }}
        >
          Arquivo
        </button>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              height: 30,
              padding: '0 12px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              color: tab === t.key ? 'var(--ab-accent-strong)' : 'var(--ab-text)',
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? '3px solid var(--ab-accent)' : '3px solid transparent'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', height: 92, padding: '2px 4px', overflowX: 'auto', overflowY: 'hidden' }}>
        {tab === 'home' && (
          <>
            <Group label="Área de transferência">
              <Big icon={<ClipboardPaste24Regular />} label="Colar" onClick={() => page && pasteVisuals(page.id)} />
              <Stack>
                <Small
                  icon={<Cut20Regular />}
                  label="Recortar"
                  disabled={!selected.length}
                  onClick={() => {
                    if (!page) return
                    copyVisuals(page.id, selected)
                    deleteVisuals(page.id, selected)
                  }}
                />
                <Small icon={<Copy20Regular />} label="Copiar" disabled={!selected.length} onClick={() => page && copyVisuals(page.id, selected)} />
              </Stack>
            </Group>
            <Group label="Dados">
              <Big icon={<Database24Regular />} label="Obter dados" menu={<GetDataMenu />} />
              <Big icon={<DocumentTable24Regular />} label="Pasta de trabalho do Excel" onClick={() => void getData('excel')} />
              <Big icon={<DocumentText24Regular />} label="Texto/ CSV" onClick={() => void getData('csv')} />
              <Big icon={<TableEdit24Regular />} label="Inserir dados" onClick={() => void getData('enterData')} />
            </Group>
            <Group label="Consultas">
              <Big icon={<TableSettings24Regular />} label="Transformar dados" onClick={commands.transform} disabled={!hasQueries} />
              <Big icon={<ArrowSync24Regular />} label="Atualizar" onClick={commands.refresh} disabled={!hasQueries} />
            </Group>
            <Group label="Inserir">
              <Big icon={<DataBarVerticalAdd24Regular />} label="Novo visual" onClick={() => addVisual('stackedColumn')} disabled={view !== 'report'} />
              <Big icon={<TextT24Regular />} label="Caixa de texto" onClick={() => addVisual('text')} disabled={view !== 'report'} />
              <Big icon={<DataBarVertical24Regular />} label="Mais visuais" menu={<VisualGallery />} />
            </Group>
            <Group label="Cálculos">
              <Big icon={<Calculator24Regular />} label="Nova medida" onClick={() => newMeasure()} disabled={!hasModel} />
              <Big icon={<Wand24Regular />} label="Medida rápida" onClick={() => useUi.getState().openDialog({ kind: 'measure', table: fieldSel?.table ?? '', kindOf: 'measure' })} disabled={!hasModel} />
            </Group>
            <Group label="Compartilhar">
              <Big icon={<DocumentPdf24Regular />} label="Exportar PDF" onClick={commands.exportPdf} />
            </Group>
          </>
        )}
        {tab === 'insert' && (
          <>
            <Group label="Páginas">
              <Big
                icon={<DocumentAdd24Regular />}
                label="Nova página"
                menu={
                  <>
                    <MenuItem onClick={addPage}>Página em branco</MenuItem>
                    <MenuItem onClick={() => page && duplicatePage(page.id)}>Duplicar página</MenuItem>
                  </>
                }
              />
            </Group>
            <Group label="Visuais">
              <Big icon={<DataBarVerticalAdd24Regular />} label="Novo visual" onClick={() => addVisual('stackedColumn')} />
              <VisualGallery />
            </Group>
            <Group label="Elementos">
              <Big icon={<TextT24Regular />} label="Caixa de texto" onClick={() => addVisual('text')} />
              <Big icon={<CursorClick24Regular />} label="Botão" onClick={() => addVisual('button')} />
              <Big
                icon={<Shapes24Regular />}
                label="Formas"
                menu={
                  <>
                    {[
                      ['rectangle', 'Retângulo'],
                      ['rounded', 'Retângulo arredondado'],
                      ['ellipse', 'Oval'],
                      ['line', 'Linha']
                    ].map(([k, label]) => (
                      <MenuItem
                        key={k}
                        onClick={() => {
                          const id = addVisual('shape')
                          const p = activePage()
                          if (id && p)
                            updateDoc('Forma', (d) => {
                              const v = d.report.pages.find((x) => x.id === p.id)?.visuals.find((x) => x.id === id)
                              if (v) v.format.shape = { kind: k }
                            })
                        }}
                      >
                        {label}
                      </MenuItem>
                    ))}
                  </>
                }
              />
              <Big
                icon={<Image24Regular />}
                label="Imagem"
                onClick={async () => {
                  const paths = await window.alcina.dialog.open({ title: 'Inserir imagem', filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }] })
                  if (!paths?.[0]) return
                  const bytes = await window.alcina.fs.read(paths[0])
                  const ext = paths[0].split('.').pop()!.toLowerCase()
                  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
                  let bin = ''
                  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
                  const url = `data:${mime};base64,${btoa(bin)}`
                  const id = addVisual('image')
                  const p = activePage()
                  if (id && p)
                    updateDoc('Imagem', (d) => {
                      const v = d.report.pages.find((x) => x.id === p.id)?.visuals.find((x) => x.id === id)
                      if (v) v.image = url
                    })
                }}
              />
            </Group>
          </>
        )}
        {tab === 'modeling' && (
          <>
            <Group label="Relações">
              <Big icon={<Organization24Regular />} label="Gerenciar relações" onClick={commands.manageRelationships} disabled={!hasModel} />
              <Big
                icon={<Lightbulb24Regular />}
                label="Detectar relações"
                disabled={!hasModel}
                onClick={async () => {
                  const n = await autoDetectRelationships()
                  useUi.getState().toast({ intent: n ? 'success' : 'info', title: n ? `${n} relação(ões) encontrada(s).` : 'Nenhuma nova relação encontrada.' })
                }}
              />
            </Group>
            <Group label="Cálculos">
              <Big icon={<Calculator24Regular />} label="Nova medida" onClick={() => newMeasure()} disabled={!hasModel} />
              <Big icon={<TableInsertColumn24Regular />} label="Nova coluna" onClick={() => newColumn()} disabled={!hasModel} />
              <Big icon={<TableAdd24Regular />} label="Nova tabela" onClick={newTable} />
            </Group>
            <Group label="Calendários">
              <Big
                icon={<CalendarLtr24Regular />}
                label="Marcar como tabela de datas"
                disabled={!fieldSel?.column}
                onClick={() => fieldSel?.column && setTableProps(fieldSel.table, { dateColumn: fieldSel.column })}
              />
              <Big
                icon={<TableAdd24Regular />}
                label="Nova tabela de calendário"
                onClick={() => useUi.getState().set({ formula: { kind: 'table', table: '', text: 'Calendario = ADDCOLUMNS(CALENDARAUTO(), "Ano", YEAR([Date]), "Mês", FORMAT([Date], "MMMM"), "Nº Mês", MONTH([Date]), "Trimestre", "T" & QUARTER([Date]))' } })}
              />
            </Group>
            <Group label="Opções">
              <Big icon={<Settings24Regular />} label="Opções do modelo" onClick={() => useUi.getState().openDialog({ kind: 'options' })} />
            </Group>
          </>
        )}
        {tab === 'view' && (
          <>
            <Group label="Temas">
              <div style={{ display: 'flex', gap: 6, padding: '6px 4px' }}>
                {THEMES.map((t) => (
                  <Tooltip key={t.name} content={t.name} relationship="label">
                    <button
                      onClick={() => updateDoc(`Tema ${t.name}`, (d) => void (d.report.theme = t))}
                      style={{
                        width: 64,
                        height: 52,
                        border: theme.name === t.name ? '2px solid var(--ab-accent)' : '1px solid var(--ab-border)',
                        borderRadius: 6,
                        background: t.background,
                        cursor: 'pointer',
                        padding: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <span style={{ fontSize: 10, color: t.foreground, textAlign: 'left' }}>Aa</span>
                      <span style={{ display: 'flex', gap: 2 }}>
                        {t.dataColors.slice(0, 5).map((c) => (
                          <span key={c} style={{ width: 9, height: 14, background: c, borderRadius: 2 }} />
                        ))}
                      </span>
                    </button>
                  </Tooltip>
                ))}
              </div>
              <Big icon={<Color24Regular />} label="Personalizar tema" onClick={() => useUi.getState().openDialog({ kind: 'theme' })} />
            </Group>
            <Group label="Dimensionar">
              <Big
                icon={<PageFit24Regular />}
                label="Exibição da página"
                menu={
                  <>
                    <MenuItem onClick={() => page && setPageProps(page.id, { display: 'fit' })}>Ajustar à página</MenuItem>
                    <MenuItem onClick={() => page && setPageProps(page.id, { display: 'fitWidth' })}>Ajustar à largura</MenuItem>
                    <MenuItem onClick={() => page && setPageProps(page.id, { display: 'actual' })}>Tamanho real</MenuItem>
                  </>
                }
              />
            </Group>
            <Group label="Mostrar painéis">
              <Big icon={<Filter24Regular />} label="Filtros" onClick={() => togglePane('filters')} />
              <Big icon={<PaintBrush24Regular />} label="Visualizações" onClick={() => togglePane('visualizations')} />
              <Big icon={<PanelLeft24Regular />} label="Dados" onClick={() => togglePane('data')} />
            </Group>
            <Group label="Organizar">
              <Big
                icon={<AlignLeft24Regular />}
                label="Alinhar"
                disabled={selected.length < 2}
                menu={
                  <>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'left')}>Alinhar à esquerda</MenuItem>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'center')}>Alinhar ao centro</MenuItem>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'right')}>Alinhar à direita</MenuItem>
                    <MenuDivider />
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'top')}>Alinhar na parte superior</MenuItem>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'middle')}>Alinhar ao meio</MenuItem>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'bottom')}>Alinhar na parte inferior</MenuItem>
                    <MenuDivider />
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'hdistribute')}>Distribuir horizontalmente</MenuItem>
                    <MenuItem onClick={() => page && alignVisuals(page.id, selected, 'vdistribute')}>Distribuir verticalmente</MenuItem>
                  </>
                }
              />
              <Stack>
                <Small icon={<ChevronDown12Regular style={{ transform: 'rotate(180deg)' }} />} label="Trazer para a frente" disabled={!selected.length} onClick={() => page && bringTo(page.id, selected, 'front')} />
                <Small icon={<ChevronDown12Regular />} label="Enviar para trás" disabled={!selected.length} onClick={() => page && bringTo(page.id, selected, 'back')} />
              </Stack>
            </Group>
          </>
        )}
        {tab === 'help' && (
          <>
            <Group label="Ajuda">
              <Big icon={<Keyboard24Regular />} label="Atalhos de teclado" onClick={() => useUi.getState().openDialog({ kind: 'about' })} />
              <Big icon={<QuestionCircle24Regular />} label="Referência DAX" onClick={() => useUi.getState().set({ view: 'dax' })} />
              <Big icon={<Info24Regular />} label="Sobre" onClick={() => useUi.getState().openDialog({ kind: 'about' })} />
            </Group>
          </>
        )}
      </div>
      {backstage && <Backstage onClose={() => setBackstage(false)} />}
    </div>
  )
}
