// Exibição de relatório: tela com a página atual, visuais e abas de páginas.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Input, Menu, MenuItem, MenuList, MenuPopover, Tooltip } from '@fluentui/react-components'
import { Add16Regular, ChevronLeft16Regular, ChevronRight16Regular, EyeOff16Regular } from '@fluentui/react-icons'
import type { FieldRef } from '@engine/vq/types'
import { useDoc } from '../../state/doc'
import { useUi } from '../../state/ui'
import { VisualContainer } from './VisualContainer'
import {
  addFieldToVisual,
  addPage,
  addVisual,
  clearSelection,
  copyVisuals,
  deletePage,
  deleteVisuals,
  duplicatePage,
  duplicateVisuals,
  movePage,
  pasteVisuals,
  renamePage,
  roleForField,
  setPageProps,
  updateVisual
} from '../../actions/report'
import type { PageDef } from '../../report/types'
import { hexToRgba } from '../../util/fmt'

export const FIELD_MIME = 'application/x-alcinabi-field'

export interface DraggedField {
  field: FieldRef
  isNumeric: boolean
  isDate: boolean
}

export function ReportView() {
  const pages = useDoc((s) => s.doc.report.pages)
  const theme = useDoc((s) => s.doc.report.theme)
  const activeId = useUi((s) => s.activePageId)
  const selectedIds = useUi((s) => s.selectedVisualIds)
  const focusId = useUi((s) => s.focusVisualId)
  const page = pages.find((p) => p.id === activeId) ?? pages[0]
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useLayoutEffect(() => {
    const el = host.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!activeId && pages[0]) useUi.getState().set({ activePageId: pages[0].id })
  }, [activeId, pages])

  // Atalhos de teclado do relatório
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('.cm-editor') || t.closest('[role="dialog"]'))) return
      const ui = useUi.getState()
      if (ui.view !== 'report' || ui.showStart || ui.queryEditor.open || ui.dialog) return
      const ids = ui.selectedVisualIds
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault()
        deleteVisuals(page.id, ids)
      } else if (e.key === 'Escape') {
        if (ui.focusVisualId) ui.set({ focusVisualId: null })
        else ui.set({ selectedVisualIds: [] })
        clearSelection(page.id)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && ids.length) copyVisuals(page.id, ids)
      else if (e.ctrlKey && e.key.toLowerCase() === 'v') pasteVisuals(page.id)
      else if (e.ctrlKey && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault()
        duplicateVisuals(page.id, ids)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        ui.set({ selectedVisualIds: page.visuals.map((v) => v.id) })
      } else if (ids.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        for (const id of ids)
          updateVisual(
            page.id,
            id,
            'Mover visual',
            (v) => {
              v.x = Math.max(0, Math.min(page.width - v.w, v.x + dx))
              v.y = Math.max(0, Math.min(page.height - v.h, v.y + dy))
            },
            `nudge:${ids.join(',')}`
          )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page])

  if (!page) return null
  const pad = 24
  const scaleFit = Math.min((size.w - pad * 2) / page.width, (size.h - pad * 2) / page.height)
  const scale = page.display === 'actual' ? 1 : page.display === 'fitWidth' ? (size.w - pad * 2) / page.width : Math.max(0.1, scaleFit)
  const focusVisual = focusId ? page.visuals.find((v) => v.id === focusId) : null
  const pageBg = theme.pageBackground && page.background.color === '#ffffff' ? theme.pageBackground : page.background.color

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(FIELD_MIME)
    if (!raw) return
    e.preventDefault()
    const d = JSON.parse(raw) as DraggedField
    const pageEl = (e.currentTarget as HTMLElement).querySelector('[data-report-page]') as HTMLElement
    const rect = pageEl.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    // Sobre um visual existente?
    const target = [...page.visuals].sort((a, b) => b.z - a.z).find((v) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h)
    if (target) {
      const role = roleForField(target, d.field, d.isNumeric, d.isDate)
      if (role) {
        const f = role.kind === 'measure' && !d.field.measure && !d.field.aggregation ? { ...d.field, aggregation: d.isNumeric ? ('sum' as const) : ('count' as const) } : d.field
        addFieldToVisual(page.id, target.id, role.name, f)
        useUi.getState().set({ selectedVisualIds: [target.id] })
      }
      return
    }
    const measureLike = !!d.field.measure || d.isNumeric
    if (measureLike) addVisual('column', { values: [d.field.measure ? d.field : { ...d.field, aggregation: 'sum' }] }, { x: x - 200, y: y - 120 })
    else if (d.isDate) addVisual('line', { category: [d.field] }, { x: x - 200, y: y - 120 })
    else addVisual('table', { values: [d.field] }, { x: x - 200, y: y - 120 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div
        ref={host}
        style={{ flex: 1, position: 'relative', overflow: 'auto', background: 'var(--ab-canvas-bg)' }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.reportPage !== undefined) {
            useUi.getState().set({ selectedVisualIds: [] })
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FIELD_MIME)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={onDrop}
      >
        <div
          style={{
            width: page.width * scale,
            height: page.height * scale,
            margin: `${pad}px auto`,
            position: 'relative',
            left: page.display === 'actual' && page.width * scale < size.w ? 0 : undefined
          }}
        >
          <div
            data-report-page=""
            style={{
              width: page.width,
              height: page.height,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              left: 0,
              top: 0,
              background: hexToRgba(pageBg, 1 - page.background.transparency / 100),
              boxShadow: 'var(--ab-shadow)'
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                useUi.getState().set({ selectedVisualIds: [] })
                clearSelection(page.id)
              }
            }}
          >
            {focusVisual ? (
              <VisualContainer v={{ ...focusVisual, x: 8, y: 8, w: page.width - 16, h: page.height - 16 }} page={page} scale={scale} selected={false} editMode={false} focus />
            ) : (
              [...page.visuals]
                .filter((v) => !v.hidden)
                .sort((a, b) => a.z - b.z)
                .map((v) => <VisualContainer key={v.id} v={v} page={page} scale={scale} selected={selectedIds.includes(v.id)} editMode />)
            )}
          </div>
        </div>
      </div>
      <PageTabs pages={pages} activeId={page.id} />
    </div>
  )
}

function PageTabs({ pages, activeId }: { pages: PageDef[]; activeId: string }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const idx = pages.findIndex((p) => p.id === activeId)
  return (
    <div style={{ height: 34, display: 'flex', alignItems: 'stretch', background: 'var(--ab-app-bg)', borderTop: '1px solid var(--ab-border)', fontSize: 12 }}>
      <button className="ab-tabnav" onClick={() => scroller.current?.scrollBy({ left: -160, behavior: 'smooth' })} style={navBtn}>
        <ChevronLeft16Regular />
      </button>
      <button className="ab-tabnav" onClick={() => scroller.current?.scrollBy({ left: 160, behavior: 'smooth' })} style={navBtn}>
        <ChevronRight16Regular />
      </button>
      <div ref={scroller} style={{ display: 'flex', overflow: 'hidden', alignItems: 'stretch' }}>
        {pages.map((p, i) => {
          const active = p.id === activeId
          return (
            <div
              key={p.id}
              draggable={editing !== p.id}
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== p.id) movePage(dragId, i)
                setDragId(null)
              }}
              onClick={() => useUi.getState().set({ activePageId: p.id, selectedVisualIds: [], focusVisualId: null })}
              onDoubleClick={() => setEditing(p.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: p.id, x: e.clientX, y: e.clientY })
              }}
              style={{
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: active ? '#ffffff' : 'transparent',
                borderBottom: active ? '3px solid var(--ab-accent)' : '3px solid transparent',
                fontWeight: active ? 600 : 400,
                color: p.hidden ? 'var(--ab-text-3)' : 'var(--ab-text)'
              }}
            >
              {p.hidden && <EyeOff16Regular />}
              {editing === p.id ? (
                <Input
                  size="small"
                  autoFocus
                  defaultValue={p.name}
                  style={{ width: 140 }}
                  onBlur={(e) => {
                    renamePage(p.id, e.target.value)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                p.name
              )}
            </div>
          )
        })}
      </div>
      <Tooltip content="Nova página" relationship="label">
        <button onClick={addPage} style={{ ...navBtn, width: 34 }}>
          <Add16Regular />
        </button>
      </Tooltip>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', color: 'var(--ab-text-2)' }}>
        Página {idx + 1} de {pages.length}
      </div>
      {menu && (
        <Menu open onOpenChange={(_, d) => !d.open && setMenu(null)} positioning={{ target: { getBoundingClientRect: () => ({ x: menu.x, y: menu.y, left: menu.x, top: menu.y, right: menu.x, bottom: menu.y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect }, position: 'above' }}>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={() => setEditing(menu.id)}>Renomear página</MenuItem>
              <MenuItem onClick={() => duplicatePage(menu.id)}>Duplicar página</MenuItem>
              <MenuItem onClick={() => setPageProps(menu.id, { hidden: !pages.find((p) => p.id === menu.id)?.hidden })}>
                {pages.find((p) => p.id === menu.id)?.hidden ? 'Reexibir página' : 'Ocultar página'}
              </MenuItem>
              <MenuItem onClick={() => useUi.getState().openDialog({ kind: 'pageSettings', pageId: menu.id })}>Configurações da página</MenuItem>
              <MenuItem disabled={pages.length <= 1} onClick={() => deletePage(menu.id)}>
                Excluir página
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  width: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--ab-text-2)'
}
