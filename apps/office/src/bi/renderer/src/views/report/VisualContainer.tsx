// Moldura de um visual no relatório: seleção, mover, redimensionar e cabeçalho.
import { memo, useRef, useState, type CSSProperties } from 'react'
import { Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MenuDivider } from '@fluentui/react-components'
import {
  MoreHorizontal16Regular,
  ArrowMaximize16Regular,
  ArrowUp16Regular,
  ArrowDown16Regular,
  ArrowSortDown16Regular,
  Copy16Regular,
  Delete16Regular,
  ArrowDownload16Regular,
  Table16Regular,
  ArrowExpand16Regular,
  ArrowMinimize16Regular,
  ArrowCircleUp16Regular,
  ArrowCircleDown16Regular
} from '@fluentui/react-icons'
import type { PageDef, VisualDef } from '../../report/types'
import { useUi } from '../../state/ui'
import { fmt } from '../../visuals/registry'
import { VisualBody, visualTitle } from './VisualBody'
import { bringTo, deleteVisuals, drill, duplicateVisuals, updateVisual, updateVisual as upd } from '../../actions/report'
import { exportVisualCsv } from '../../actions/export'
import { hexToRgba } from '../../util/fmt'
import { fieldLabel } from '../../util/fmt'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]

const handlePos: Record<Handle, CSSProperties> = {
  nw: { left: -4, top: -4, cursor: 'nwse-resize' },
  n: { left: 'calc(50% - 4px)', top: -4, cursor: 'ns-resize' },
  ne: { right: -4, top: -4, cursor: 'nesw-resize' },
  e: { right: -4, top: 'calc(50% - 4px)', cursor: 'ew-resize' },
  se: { right: -4, bottom: -4, cursor: 'nwse-resize' },
  s: { left: 'calc(50% - 4px)', bottom: -4, cursor: 'ns-resize' },
  sw: { left: -4, bottom: -4, cursor: 'nesw-resize' },
  w: { left: -4, top: 'calc(50% - 4px)', cursor: 'ew-resize' }
}

const SNAP = 4
const snap = (x: number) => Math.round(x / SNAP) * SNAP

interface Props {
  v: VisualDef
  page: PageDef
  scale: number
  selected: boolean
  editMode: boolean
  focus?: boolean
}

function isInteractiveTarget(t: EventTarget | null): boolean {
  let el = t as HTMLElement | null
  while (el) {
    if (el.classList?.contains('ab-nodrag')) return true
    if (el.classList?.contains('ab-visual')) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || el.getAttribute?.('role') === 'checkbox') return true
    el = el.parentElement
  }
  return false
}

export const VisualContainer = memo(function VisualContainer({ v, page, scale, selected, editMode, focus }: Props) {
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [hover, setHover] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; orig: { x: number; y: number; w: number; h: number }; handle: Handle | 'move'; moved: boolean } | null>(null)
  const box = drag ?? { x: v.x, y: v.y, w: v.w, h: v.h }

  const onPointerDown = (e: React.PointerEvent, handle: Handle | 'move') => {
    if (e.button !== 0) return
    if (!editMode || v.locked) {
      if (handle === 'move') select(e)
      return
    }
    if (handle === 'move' && isInteractiveTarget(e.target)) {
      select(e)
      return
    }
    e.stopPropagation()
    if (handle === 'move') select(e)
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, orig: { x: v.x, y: v.y, w: v.w, h: v.h }, handle, moved: false }
  }

  const select = (e: React.PointerEvent) => {
    const ui = useUi.getState()
    if (e.ctrlKey || e.shiftKey) {
      const ids = ui.selectedVisualIds.includes(v.id) ? ui.selectedVisualIds.filter((x) => x !== v.id) : [...ui.selectedVisualIds, v.id]
      ui.set({ selectedVisualIds: ids })
    } else if (!ui.selectedVisualIds.includes(v.id) || ui.selectedVisualIds.length > 1) ui.set({ selectedVisualIds: [v.id] })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    if (!d.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    d.moved = true
    const o = d.orig
    let { x, y, w, h } = o
    const minW = 40
    const minH = 30
    if (d.handle === 'move') {
      x = snap(o.x + dx)
      y = snap(o.y + dy)
      x = Math.max(0, Math.min(page.width - w, x))
      y = Math.max(0, Math.min(page.height - h, y))
    } else {
      const hd = d.handle
      if (hd.includes('e')) w = Math.max(minW, snap(o.w + dx))
      if (hd.includes('s')) h = Math.max(minH, snap(o.h + dy))
      if (hd.includes('w')) {
        const nx = Math.min(o.x + o.w - minW, snap(o.x + dx))
        w = o.w + (o.x - nx)
        x = nx
      }
      if (hd.includes('n')) {
        const ny = Math.min(o.y + o.h - minH, snap(o.y + dy))
        h = o.h + (o.y - ny)
        y = ny
      }
      x = Math.max(0, x)
      y = Math.max(0, y)
      w = Math.min(w, page.width - x)
      h = Math.min(h, page.height - y)
    }
    setDrag({ x, y, w, h })
  }

  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d && d.moved && drag) {
      const nb = drag
      upd(page.id, v.id, d.handle === 'move' ? 'Mover visual' : 'Redimensionar visual', (vd) => {
        vd.x = nb.x
        vd.y = nb.y
        vd.w = nb.w
        vd.h = nb.h
      })
    }
    setDrag(null)
  }

  // Aparência
  const bgShow = fmt<boolean>(v, 'background', 'show') !== false
  const bgColor = fmt<string>(v, 'background', 'color') || '#ffffff'
  const bgAlpha = 1 - (fmt<number>(v, 'background', 'transparency') ?? 0) / 100
  const borderOn = fmt<boolean>(v, 'border', 'show')
  const radius = borderOn ? fmt<number>(v, 'border', 'radius') : 4
  const shadow = fmt<boolean>(v, 'shadow', 'show')
  const decoration = v.type === 'shape' || v.type === 'button' || v.type === 'image'
  const titleOn = fmt<boolean>(v, 'title', 'show') && !decoration && v.type !== 'text'
  const title = titleOn ? visualTitle(v) : ''
  const hierarchy = (v.type === 'matrix' ? v.fields.rows : v.fields.category) ?? []
  const level = v.drillLevel ?? 0
  const showHeaderIcons = fmt<boolean>(v, 'header', 'show') !== false && !decoration && v.type !== 'text'

  const frameStyle: CSSProperties = {
    background: bgShow && !(v.type === 'shape') ? hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgAlpha) : 'transparent',
    border: borderOn ? `${fmt<number>(v, 'border', 'width')}px solid ${fmt<string>(v, 'border', 'color')}` : 'none',
    borderRadius: radius,
    boxShadow: shadow ? '0 2px 8px rgba(0,0,0,0.18)' : 'none'
  }

  const sortable = !['card', 'multiCard', 'gauge', 'kpi', 'slicer', 'text', 'shape', 'image', 'button', 'map', 'scatter'].includes(v.type)
  const sortOptions: { label: string; kind: 'group' | 'value'; index: number }[] = []
  if (sortable) {
    let gi = 0
    let vi = 0
    const pushRole = (role: string, isValue: boolean) => {
      for (const f of v.fields[role] ?? []) {
        if (role === 'category' && hierarchy.length > 1 && f !== hierarchy[Math.min(level, hierarchy.length - 1)]) continue
        sortOptions.push({ label: fieldLabel(f), kind: isValue ? 'value' : 'group', index: isValue ? vi++ : gi++ })
      }
    }
    if (v.type !== 'table') {
      pushRole('category', false)
      pushRole('values', true)
    }
  }

  return (
    <div
      className={`ab-visual${selected ? ' selected' : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: focus ? 1 : v.z }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-visual-id={v.id}
    >
      <div className="ab-visual-frame" style={frameStyle}>
        {titleOn && title && (
          <div
            style={{
              padding: '6px 10px 0',
              fontSize: fmt<number>(v, 'title', 'fontSize'),
              fontWeight: fmt<boolean>(v, 'title', 'bold') ? 700 : 600,
              color: fmt<string>(v, 'title', 'color') || '#252423',
              textAlign: fmt<string>(v, 'title', 'align') as 'left',
              background: fmt<string>(v, 'title', 'background') || undefined,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              paddingRight: showHeaderIcons ? 70 : 10
            }}
          >
            {title}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, padding: decoration || v.type === 'text' ? 0 : '4px 6px 6px' }}>
          <VisualBody v={v} page={page} editMode={editMode} />
        </div>
      </div>
      {editMode && <div className="ab-visual-hover" />}
      {selected && <div className="ab-visual-sel" />}
      {selected &&
        editMode &&
        !v.locked &&
        HANDLES.map((h) => (
          <div
            key={h}
            className="ab-handle"
            style={handlePos[h]}
            onPointerDown={(e) => onPointerDown(e, h)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        ))}
      {(hover || selected) && showHeaderIcons && (
        <div
          className="ab-nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: -26,
            right: 0,
            display: 'flex',
            gap: 2,
            background: '#ffffff',
            border: '1px solid #e1dfdd',
            borderRadius: 4,
            padding: '2px 4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            zIndex: 10
          }}
        >
          {hierarchy.length > 1 && (
            <>
              <IconBtn title="Fazer drill up" disabled={level === 0} onClick={() => drill(page.id, v.id, 'up')}>
                <ArrowUp16Regular />
              </IconBtn>
              <IconBtn title="Ir para o próximo nível na hierarquia" disabled={level >= hierarchy.length - 1} onClick={() => drill(page.id, v.id, 'next')}>
                <ArrowDown16Regular />
              </IconBtn>
            </>
          )}
          <IconBtn title={focus ? 'Voltar ao relatório' : 'Modo de foco'} onClick={() => useUi.getState().set({ focusVisualId: focus ? null : v.id })}>
            {focus ? <ArrowMinimize16Regular /> : <ArrowMaximize16Regular />}
          </IconBtn>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <span>
                <IconBtn title="Mais opções" onClick={() => undefined}>
                  <MoreHorizontal16Regular />
                </IconBtn>
              </span>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<Table16Regular />} onClick={() => useUi.getState().openDialog({ kind: 'showData', visualId: v.id })}>
                  Mostrar como tabela
                </MenuItem>
                <MenuItem icon={<ArrowDownload16Regular />} onClick={() => void exportVisualCsv(page, v)}>
                  Exportar dados (CSV)
                </MenuItem>
                {sortOptions.length > 0 && (
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <MenuItem icon={<ArrowSortDown16Regular />}>Classificar por</MenuItem>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        {sortOptions.map((o, i) => (
                          <MenuItem
                            key={i}
                            onClick={() =>
                              updateVisual(page.id, v.id, 'Classificar', (vd) => {
                                vd.sort = { kind: o.kind, index: o.index, desc: vd.sort?.kind === o.kind && vd.sort.index === o.index ? !vd.sort.desc : o.kind === 'value' }
                              })
                            }
                          >
                            {o.label}
                            {v.sort?.kind === o.kind && v.sort.index === o.index ? (v.sort.desc ? '  ▼' : '  ▲') : ''}
                          </MenuItem>
                        ))}
                        <MenuDivider />
                        <MenuItem onClick={() => updateVisual(page.id, v.id, 'Classificação padrão', (vd) => (vd.sort = undefined))}>Classificação padrão</MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                )}
                {hierarchy.length > 1 && (
                  <MenuItem icon={<ArrowExpand16Regular />} onClick={() => drill(page.id, v.id, 'next')}>
                    Expandir para o próximo nível
                  </MenuItem>
                )}
                {editMode && (
                  <>
                    <MenuDivider />
                    <MenuItem icon={<Copy16Regular />} onClick={() => duplicateVisuals(page.id, [v.id])}>
                      Duplicar
                    </MenuItem>
                    <MenuItem icon={<ArrowCircleUp16Regular />} onClick={() => bringTo(page.id, [v.id], 'front')}>
                      Trazer para a frente
                    </MenuItem>
                    <MenuItem icon={<ArrowCircleDown16Regular />} onClick={() => bringTo(page.id, [v.id], 'back')}>
                      Enviar para trás
                    </MenuItem>
                    <MenuItem icon={<Delete16Regular />} onClick={() => deleteVisuals(page.id, [v.id])}>
                      Remover
                    </MenuItem>
                  </>
                )}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      )}
    </div>
  )
})

function IconBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 2,
        borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#c8c6c4' : '#323130',
        display: 'flex',
        alignItems: 'center'
      }}
      onMouseEnter={(e) => !disabled && ((e.currentTarget as HTMLElement).style.background = '#f3f2f1')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
