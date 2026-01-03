import { useEffect, useState } from 'react';

export interface ResourceTaskStatus {
  requestId?: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  label: string;
  subLabel?: string;
  icon?: string;
  progress?: number;
}

export const useResourceTaskStatus = () => {
  const [taskStatuses, setTaskStatuses] = useState<Record<string, ResourceTaskStatus>>({});

  useEffect(() => {
    // Initial fetch of active tasks
    const fetchActiveTasks = async () => {
      try {
        const tasks = await window.YUA.ai.getTranslationTasks();
        const initialStatuses: Record<string, ResourceTaskStatus> = {};

        tasks.forEach((task: any) => {
          if (task.metadata?.resourceId) {
            initialStatuses[task.metadata.resourceId] = {
              requestId: task.requestId,
              type: 'translation',
              status: 'running',
              label: 'AI 翻译中...',
              subLabel: `${task.providerId} · ${task.model}`,
              icon: 'translation',
              progress: 0
            };
          }
        });

        setTaskStatuses(initialStatuses);
      } catch (error) {
        console.error('Failed to fetch active tasks:', error);
      }
    };

    fetchActiveTasks();

    const handleMessage = (_event: any, payload: any) => {
      if (payload.type === 'subtitle:translate') {
        const { data } = payload;
        const eventType = data.type;
        const eventData = data.data;
        const requestId = data.requestId;

        // Handle progress
        if (eventType === 'progress' && eventData?.displayInfo?.resourceId) {
          const resourceId = eventData.displayInfo.resourceId;
          setTaskStatuses((prev) => ({
            ...prev,
            [resourceId]: {
              requestId,
              type: 'translation',
              status: 'running',
              label: eventData.displayInfo.label,
              subLabel: eventData.displayInfo.subLabel,
              icon: eventData.displayInfo.icon,
              progress: eventData.percentage
            }
          }));
        }
        // Handle completion
        else if (eventType === 'completed' && eventData?.displayInfo?.resourceId) {
          const resourceId = eventData.displayInfo.resourceId;
          setTaskStatuses((prev) => {
            const next = { ...prev };
            delete next[resourceId];
            return next;
          });
        }
        // Handle done/error
        else if ((eventType === 'done' || eventType === 'error') && eventData?.resourceId) {
          const resourceId = eventData.resourceId;
          setTaskStatuses((prev) => {
            const next = { ...prev };
            delete next[resourceId];
            return next;
          });
        }
      }
    };

    window.ipcRenderer.on('renderer-message', handleMessage);
    return () => {
      window.ipcRenderer.off('renderer-message', handleMessage);
    };
  }, []);

  return taskStatuses;
};
