import './index.scss';
import 'highlight.js/styles/github-dark.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { toast } from 'sonner';

import { SpritePlayerProvider } from '@/components/AIAssistant/context/SpritePlayerContext';

import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SpritePlayerProvider>
      <App />
    </SpritePlayerProvider>
  </React.StrictMode>
);

postMessage({ payload: 'removeLoading' }, '*');

// Global shortcut events from main process
try {
  // favorite current resource: bubble to app level so pages can hook this if desired
  window?.ipcRenderer?.on('shortcut:favorite-current-resource', () => {
    window.dispatchEvent(new CustomEvent('app:favorite-current-resource'));
    toast.success('已触发：收藏当前资源（若页面支持将自动处理）');
  });
} catch {
  // ignore
}

window.ipcRenderer.on('main-process-message', (_event, ...args) => {
  console.log('[Receive Main-process message]:', ...args);
});
