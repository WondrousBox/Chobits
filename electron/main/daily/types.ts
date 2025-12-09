import type { BrowserWindow } from 'electron';

export type RoutineKind = 'hydration' | 'movement' | 'vision' | 'posture' | 'nightGuard' | 'summary' | 'festival' | 'family' | 'birthday' | 'meeting' | 'custom';

export type RoutineSeverity = 'gentle' | 'info' | 'warning' | 'urgent';

export type RoutineChannel = 'spriteNotice';

export interface IntervalSchedule {
  kind: 'interval';
  minutes: number;
  activeHourStart?: string; // HH:mm
  activeHourEnd?: string; // HH:mm
  daysOfWeek?: number[]; // 0-6, Sunday=0
}

export interface FixedTimeSchedule {
  kind: 'fixed';
  times: string[]; // HH:mm[]
  daysOfWeek?: number[];
}

export interface CalendarSchedule {
  kind: 'calendar';
  time: string; // HH:mm
  repeat: 'once' | 'yearly';
  date?: {
    month: number; // 1-12
    day: number; // 1-31
    year?: number;
  };
  nthWeekday?: {
    month: number;
    weekday: number; // 0-6
    nth: number; // 1-5
  };
  leadMinutes?: number;
  timezone?: string;
}

export type RoutineSchedule = IntervalSchedule | FixedTimeSchedule | CalendarSchedule;

export interface CareRoutineDefinition {
  id: string;
  title: string;
  description?: string;
  kind: RoutineKind;
  severity?: RoutineSeverity;
  schedule: RoutineSchedule;
  messageTemplates: string[];
  oncePerDay?: boolean;
  persistent?: boolean; // 是否常驻显示，直到下一个消息或用户关闭
  tags?: string[];
  metadata?: Record<string, any>;
  channel?: RoutineChannel;
  source?: 'default' | 'custom' | 'preset';
}

export interface RoutineState {
  enabled?: boolean;
  lastTriggeredAt?: number;
  lastTriggeredOn?: string;
  snoozedUntil?: number | null;
  customIntervalMinutes?: number;
}

export interface RoutineRuntime {
  definition: CareRoutineDefinition;
  state: RoutineState;
}

export interface DailyCareStorage {
  enabled: boolean;
  routines: Record<string, RoutineState>;
  customReminders: CustomReminderConfig[];
}

export interface CustomReminderConfig {
  id: string;
  kind: 'meeting' | 'birthday' | 'family' | 'general';
  title: string;
  message?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  repeat?: 'none' | 'annual';
  leadMinutes?: number;
  enabled?: boolean;
  timezone?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export type CustomReminderInput = Omit<CustomReminderConfig, 'id'> & { id?: string };

export interface RoutineStatePatch extends RoutineState {
  enabled?: boolean;
}

export interface UpdateSettingsPayload {
  enabled?: boolean;
  routines?: Record<string, RoutineStatePatch>;
}

export interface DailyCareRoutineSnapshot {
  id: string;
  title: string;
  description?: string;
  kind: RoutineKind;
  severity: RoutineSeverity;
  enabled: boolean;
  scheduleLabel: string;
  lastTriggeredAt: number | null;
  lastTriggeredLabel: string | null;
  tags?: string[];
  metadata?: Record<string, any>;
  source: 'default' | 'custom' | 'preset';
}

export interface DailyCareSnapshot {
  enabled: boolean;
  routines: DailyCareRoutineSnapshot[];
  customReminders: CustomReminderConfig[];
  lastUpdated: number;
}

export type WindowResolver = () => BrowserWindow | null;
