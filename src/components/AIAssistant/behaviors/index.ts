import { SpriteEventName } from '../events/spriteEvents';
import { SchedulerContext, SchedulerTask } from '../hooks/useBehaviorScheduler';

interface BehaviorActions {
  animateMoveWindow: (x: number, y: number) => Promise<void>;
  setAssistantState: (e: SpriteEventName, s?: any) => void;
}

export const createBehaviors = (actions: BehaviorActions, config: { autoWalkEnabled: boolean }): SchedulerTask[] => {
  return [
    // 1. Auto Walk
    {
      id: 'auto-walk',
      name: 'Auto Walk',
      type: 'random_interval',
      enabled: config.autoWalkEnabled,
      minIntervalMs: 60000,
      maxIntervalMs: 120000,
      condition: (ctx) => {
        return !ctx.isDragging && !ctx.isWalking && !ctx.isHovering;
      },
      action: async (ctx) => {
        const { screenSize, padding, spriteWidth, spriteHeight, getPosition } = ctx;
        const minX = -padding;
        const maxX = screenSize.width - spriteWidth - padding;
        const minY = -padding;
        const maxY = screenSize.height - spriteHeight - padding;

        const [currentX, currentY] = await getPosition();

        // X: Random
        const targetX = Math.random() * (maxX - minX) + minX;

        // Y: Near current Y (10% of screen height)
        const yRange = screenSize.height * 0.1;
        const yMin = Math.max(minY, currentY - yRange);
        const yMax = Math.min(maxY, currentY + yRange);
        const targetY = Math.random() * (yMax - yMin) + yMin;

        actions.setAssistantState('walk:start');
        await actions.animateMoveWindow(targetX, targetY);
        actions.setAssistantState('walk:end');
        actions.setAssistantState('idle');
      }
    },
    // 2. Night Idle (Yawn)
    {
      id: 'night-idle',
      name: 'Night Idle',
      type: 'interval',
      enabled: true,
      intervalMs: 60000, // Check every minute
      condition: (ctx) => {
        if (ctx.isDragging || ctx.isWalking || ctx.isHovering) return false;
        const hour = new Date().getHours();
        // 22:00 - 06:00
        return hour >= 22 || hour < 6;
      },
      action: async () => {
        // 30% chance to yawn if condition met
        if (Math.random() < 0.3) {
          actions.setAssistantState('sleepy');
        }
      }
    },
    // 3. Long Idle (Rub eyes / Bored)
    {
      id: 'long-idle',
      name: 'Long Idle',
      type: 'interval',
      enabled: true,
      intervalMs: 30000, // Check every 30s
      condition: (ctx) => {
        return !ctx.isDragging && !ctx.isWalking && !ctx.isHovering;
      },
      action: async () => {
        // 10% chance to look bored
        if (Math.random() < 0.1) {
          actions.setAssistantState('bored');
        }
      }
    },
    // 4. Random Message
    {
      id: 'random-message',
      name: 'Random Message',
      type: 'random_interval',
      enabled: true,
      minIntervalMs: 60000 * 5, // 5 mins
      maxIntervalMs: 60000 * 30, // 30 mins
      condition: (ctx) => !ctx.isDragging && !ctx.isWalking,
      action: async () => {
        actions.setAssistantState('idle', 'reminder');
      }
    }
  ];
};
