import './index.scss';
import 'highlight.js/styles/github-dark.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { registerLive2DRenderer, SpriteStateProvider } from '@/features/sprite-assistant';
import Live2DSprite from '@/features/sprite-assistant/renderers/Live2DSprite';

import App from './App';

registerLive2DRenderer(Live2DSprite);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SpriteStateProvider>
        <App />
      </SpriteStateProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Notify main process that renderer is mounted and ready
window.ipcRenderer.invoke('app:renderer-ready').catch(() => {});

postMessage({ payload: 'removeLoading' }, '*');

window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  console.log('[Receive Main-process message]:', ...args);
});
