// Ponto de entrada do AlcinaSheets.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { lightTheme } from '@alcina/brand'
import '@alcina/brand/global.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={lightTheme} style={{ height: '100%' }}>
      <App />
    </FluentProvider>
  </StrictMode>
)
