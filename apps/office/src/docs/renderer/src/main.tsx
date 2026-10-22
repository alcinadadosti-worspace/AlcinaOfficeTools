// Ponto de entrada do AlcinaDocs.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { lightTheme } from '@alcina/brand'
import '@alcina/brand/global.css'
import 'prosemirror-view/style/prosemirror.css'
import '@alcina/editor/editor.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={lightTheme} style={{ height: '100%' }}>
      <App />
    </FluentProvider>
  </StrictMode>
)
