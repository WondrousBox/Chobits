import { AppEvent } from './events';

export * from './events';

type EventHandler = (data: any) => void;

class EventManager {
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

  public emit<T>(type: AppEvent, data?: T): void {
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
