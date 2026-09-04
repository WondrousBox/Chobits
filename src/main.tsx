import './index.scss';
import 'highlight.js/styles/github-dark.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SpriteStateProvider } from '@/features/sprite';

import App from './App';

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
