// Ponto de entrada da interface do AlcinaBi.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { lightTheme } from './theme/brand'
import { Workspace } from './shell/Workspace'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={lightTheme} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ab-app-bg)' }}>
      <Workspace />
    </FluentProvider>
  </StrictMode>
)
