// Elementos decorativos: caixa de texto, forma, imagem e botão.
import { useEffect, useRef, useState } from 'react'
import type { PageDef, VisualDef } from '../../report/types'
import { fmt } from '../../visuals/registry'
import { updateVisual } from '../../actions/report'
import { useDoc, getDoc } from '../../state/doc'
import { useUi } from '../../state/ui'
import { hexToRgba } from '../../util/fmt'

function TextBox({ v, page, editMode }: { v: VisualDef; page: PageDef; editMode: boolean }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      const range = document.createRange()
      range.selectNodeContents(ref.current)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [editing])
  const valign = fmt<string>(v, 'text', 'valign')
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start',
        padding: '6px 10px'
      }}
      onDoubleClick={() => editMode && setEditing(true)}
    >
      <div
        ref={ref}
        className={editing ? 'ab-selectable ab-nodrag' : undefined}
        contentEditable={editing}
        suppressContentEditableWarning
        onMouseDown={(e) => editing && e.stopPropagation()}
        onBlur={(e) => {
          setEditing(false)
          const text = e.currentTarget.innerText
          if (text !== v.text) updateVisual(page.id, v.id, 'Editar texto', (vd) => (vd.text = text))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLElement).blur()
          e.stopPropagation()
        }}
        style={{
          outline: editing ? '1px dashed #0f7e89' : 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: fmt<number>(v, 'text', 'fontSize'),
          color: fmt<string>(v, 'text', 'color') || '#252423',
          fontWeight: fmt<boolean>(v, 'text', 'bold') ? 700 : 400,
          fontStyle: fmt<boolean>(v, 'text', 'italic') ? 'italic' : 'normal',
          textAlign: fmt<string>(v, 'text', 'align') as 'left',
          cursor: editing ? 'text' : 'default'
        }}
      >
        {v.text ?? ''}
      </div>
    </div>
  )
}

function Shape({ v }: { v: VisualDef }) {
  const kind = fmt<string>(v, 'shape', 'kind')
  const fill = hexToRgba(fmt<string>(v, 'shape', 'fill') || '#e6f4f6', 1 - fmt<number>(v, 'shape', 'transparency') / 100)
  const line = fmt<string>(v, 'shape', 'line')
  const lw = fmt<number>(v, 'shape', 'lineWidth')
  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ display: 'block' }}>
      {kind === 'ellipse' && <ellipse cx="50" cy="50" rx={50 - lw / 2} ry={50 - lw / 2} fill={fill} stroke={line} strokeWidth={lw} vectorEffect="non-scaling-stroke" />}
      {kind === 'line' && <line x1="0" y1="50" x2="100" y2="50" stroke={line} strokeWidth={Math.max(1, lw)} vectorEffect="non-scaling-stroke" />}
      {(kind === 'rectangle' || kind === 'rounded') && (
        <rect x="0.5" y="0.5" width="99" height="99" rx={kind === 'rounded' ? 8 : 0} fill={fill} stroke={line} strokeWidth={lw} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

function ImageBox({ v }: { v: VisualDef }) {
  if (!v.image) return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#a19f9d', fontSize: 12 }}>Selecione uma imagem em Formatar</div>
  return <img src={v.image} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: fmt<string>(v, 'image', 'fit') as 'contain' }} />
}

function ButtonBox({ v, editMode }: { v: VisualDef; editMode: boolean }) {
  const action = fmt<string>(v, 'button', 'action')
  const target = fmt<string>(v, 'button', 'target')
  const run = () => {
    if (action === 'page') {
      const p = getDoc().report.pages.find((x) => x.name.toLowerCase() === target.toLowerCase())
      if (p) useUi.getState().set({ activePageId: p.id, selectedVisualIds: [] })
    } else if (action === 'url' && target) void window.alcina.app.openExternal(target)
    else if (action === 'clear') {
      const ui = useUi.getState()
      const page = getDoc().report.pages.find((x) => x.id === ui.activePageId)
      if (!page) return
      useDoc.getState().update('Limpar segmentações', (d) => {
        for (const vis of d.report.pages.find((x) => x.id === page.id)!.visuals) if (vis.type === 'slicer') vis.slicer = undefined
      })
    }
  }
  return (
    <button
      onClick={(e) => {
        if (editMode && !e.ctrlKey) return
        run()
      }}
      title={editMode ? 'Ctrl+clique para executar a ação' : undefined}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: 6,
        background: fmt<string>(v, 'button', 'fill'),
        color: fmt<string>(v, 'button', 'color'),
        fontSize: fmt<number>(v, 'button', 'fontSize'),
        fontWeight: 600,
        cursor: 'pointer'
      }}
    >
      {fmt<string>(v, 'button', 'text')}
    </button>
  )
}

export function DecorationVisual({ v, page, editMode }: { v: VisualDef; page: PageDef; editMode: boolean }) {
  switch (v.type) {
    case 'text':
      return <TextBox v={v} page={page} editMode={editMode} />
    case 'shape':
      return <Shape v={v} />
    case 'image':
      return <ImageBox v={v} />
    case 'button':
      return <ButtonBox v={v} editMode={editMode} />
    default:
      return null
  }
}
