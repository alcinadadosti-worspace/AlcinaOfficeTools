// Menu de contexto posicionado em coordenadas da tela.
import { Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components'
import type { ReactElement, ReactNode } from 'react'

export type MenuEntry =
  | { kind?: 'item'; label: string; icon?: ReactElement; onClick: () => void; disabled?: boolean; shortcut?: string }
  | { kind: 'divider' }
  | { kind: 'submenu'; label: string; icon?: ReactElement; items: MenuEntry[] }

function renderItems(items: MenuEntry[], close: () => void): ReactNode[] {
  return items.map((it, i) => {
    if (it.kind === 'divider') return <MenuDivider key={i} />
    if (it.kind === 'submenu') {
      return (
        <Menu key={i}>
          <MenuTrigger disableButtonEnhancement>
            <MenuItem icon={it.icon}>{it.label}</MenuItem>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>{renderItems(it.items, close)}</MenuList>
          </MenuPopover>
        </Menu>
      )
    }
    return (
      <MenuItem
        key={i}
        icon={it.icon}
        disabled={it.disabled}
        secondaryContent={it.shortcut}
        onClick={() => {
          close()
          it.onClick()
        }}
      >
        {it.label}
      </MenuItem>
    )
  })
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const target = {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
  }
  return (
    <Menu open onOpenChange={(_, d) => !d.open && onClose()} positioning={{ target, position: 'below', align: 'start' }}>
      <MenuPopover>
        <MenuList>{renderItems(items, onClose)}</MenuList>
      </MenuPopover>
    </Menu>
  )
}
