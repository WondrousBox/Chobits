import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SpritePlayerProvider } from '@/context/SpritePlayerContext'

import './index.scss'

import './demos/ipc'
// If you want use Node.js, the`nodeIntegration` needs to be enabled in the Main process.
// import './demos/node'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SpritePlayerProvider>
      <App />
    </SpritePlayerProvider>
  </React.StrictMode>,
)

postMessage({ payload: 'removeLoading' }, '*')
