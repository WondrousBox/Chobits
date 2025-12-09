import { BrowserWindow } from 'electron';

import { APP_EVENT_CHANNEL, AppEvent, AppEventPayload } from './events';

export * from './interaction';

type EventHandler = (data: any) => void;

export class EventManager {
  private static instance: EventManager;
  private listeners: Map<AppEvent, Set<EventHandler>> = new Map();

  private constructor() {
    //
  }

  public static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }

  public on(type: AppEvent, handler: EventHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  public off(type: AppEvent, handler: EventHandler): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  public emit<T>(type: AppEvent, data?: T, sourceWindowId?: number): void {
    const payload: AppEventPayload<T> = {
      type,
      data,
      timestamp: Date.now(),
      sourceWindowId
    };

    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(APP_EVENT_CHANNEL, payload);
      }
    });

    // Notify internal listeners
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (e) {
          console.error(`Error in event handler for ${type}:`, e);
        }
      });
    }
  }
}

export const eventManager = EventManager.getInstance();
