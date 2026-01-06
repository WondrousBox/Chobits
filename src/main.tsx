import './index.scss';
import 'highlight.js/styles/github-dark.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { SpritePlayerProvider } from '@/components/AIAssistant/context/SpritePlayerContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SpritePlayerProvider>
        <App />
      </SpritePlayerProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

postMessage({ payload: 'removeLoading' }, '*');

window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  console.log('[Receive Main-process message]:', ...args);
});
