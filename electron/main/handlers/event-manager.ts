import { BrowserWindow } from 'electron';

import { APP_EVENT_CHANNEL, AppEvent, AppEventPayload } from './events';

export class EventManager {
  private static instance: EventManager;

  private constructor() {
    //
  }

  public static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
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
  }
}

export const eventManager = EventManager.getInstance();
