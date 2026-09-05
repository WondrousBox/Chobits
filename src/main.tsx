import './index.scss';
import 'highlight.js/styles/github-dark.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SpriteStateProvider } from '@/features/sprite';

import App from './App';
import { initI18n } from './i18n';

// 初始化 i18n（内部异步读取语言偏好，不阻塞渲染）
initI18n();

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
window.chobits.system['app:renderer-ready']().catch(() => {});

postMessage({ payload: 'removeLoading' }, '*');
