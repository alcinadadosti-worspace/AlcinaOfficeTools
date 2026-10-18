// Barra de título personalizada com a barra de ferramentas de acesso rápido.
import { Tooltip } from '@fluentui/react-components'
import { Save20Regular, ArrowUndo20Regular, ArrowRedo20Regular } from '@fluentui/react-icons'
import { useDoc } from '../state/doc'
import { Logo } from '../components/Logo'
import { fileTitle } from '../actions/file'
import { commands } from '../actions/commands'

function QatButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip content={title} relationship="label">
      <button
        className="ab-nodrag"
        aria-label={title}
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 30,
          height: 28,
          border: 'none',
          background: 'transparent',
          color: disabled ? 'rgba(255,255,255,0.4)' : '#ffffff',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'default' : 'pointer'
        }}
        onMouseEnter={(e) => !disabled && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function TitleBar() {
  const filePath = useDoc((s) => s.filePath)
  const dirty = useDoc((s) => s.dirty)
  const canUndo = useDoc((s) => s.past.length > 0)
  const canRedo = useDoc((s) => s.future.length > 0)
  const title = `${fileTitle(filePath)}${dirty ? ' •' : ''} - AlcinaBi`
  return (
    <div
      className="ab-drag"
      style={{
        height: 'var(--ab-titlebar-h)',
        background: 'var(--ab-titlebar)',
        color: 'var(--ab-titlebar-fg)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 10,
        gap: 4,
        flex: 'none',
        position: 'relative'
      }}
    >
      <Logo size={20} />
      <div style={{ width: 8 }} />
      <QatButton title="Salvar (Ctrl+S)" onClick={commands.save}>
        <Save20Regular />
      </QatButton>
      <QatButton title="Desfazer (Ctrl+Z)" onClick={commands.undo} disabled={!canUndo}>
        <ArrowUndo20Regular />
      </QatButton>
      <QatButton title="Refazer (Ctrl+Y)" onClick={commands.redo} disabled={!canRedo}>
        <ArrowRedo20Regular />
      </QatButton>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          maxWidth: '50%',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {title}
      </div>
    </div>
  )
}
