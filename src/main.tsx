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

// 全局监听 AI Provider 配置缺失事件，确保无论用户在哪个页面都能弹出配置窗口
try {
  window.ipcRenderer.on('wf:ai-missing-provider', (_e: any, payload: any) => {
    const pid: string = payload?.providerId || 'zhipu';
    const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length ? payload.fields : ['apiKey'];
    console.log('[AI Provider Config] 检测到缺少配置，准备打开配置窗口:', { providerId: pid, fields });

    // 使用统一的窗口管理器打开配置窗口，并通过 payload 传递需要配置的字段
    window.YUA.window['window:open']('aiProviderConfig' as any, { providerId: pid, fields }, { sameDisplayAsSender: true })
      .then(() => {
        console.log('[AI Provider Config] 配置窗口已打开');
      })
      .catch((err: any) => {
        console.error('[AI Provider Config] 打开配置窗口失败:', err);
        toast.error(`无法打开配置窗口: ${err?.message || '未知错误'}`);
      });
  });
} catch (err) {
  console.error('[AI Provider Config] 注册全局事件监听器失败:', err);
}
