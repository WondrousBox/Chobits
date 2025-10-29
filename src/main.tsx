import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SpritePlayerProvider } from '@/components/AIAssistant/context/SpritePlayerContext';

import './index.scss';
import 'highlight.js/styles/github-dark.css';

import './demos/ipc';
// If you want use Node.js, the`nodeIntegration` needs to be enabled in the Main process.
// import './demos/node'
import { toast } from 'sonner';

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
  // quick screenshot placeholder
  window?.ipcRenderer?.on('shortcut:quick-screenshot', () => {
    toast.info('快捷截图：该功能暂未实现，敬请期待。');
  });
  // favorite current resource: bubble to app level so pages can hook this if desired
  window?.ipcRenderer?.on('shortcut:favorite-current-resource', () => {
    window.dispatchEvent(new CustomEvent('app:favorite-current-resource'));
    toast.success('已触发：收藏当前资源（若页面支持将自动处理）');
  });
} catch {
  // ignore
}
