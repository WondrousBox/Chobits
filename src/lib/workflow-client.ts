import { createWorkflowClient } from '@workflow/integrations/client';

export const workflowClient = createWorkflowClient({
  invoke: (channel, payload) => window.ipcRenderer.invoke(channel, payload),
  subscribe: (channel, listener) => {
    const handlePayload = (_event: unknown, payload: unknown): void => listener(payload);
    window.ipcRenderer.on(channel, handlePayload);
    return () => window.ipcRenderer.off(channel, handlePayload);
  }
});
