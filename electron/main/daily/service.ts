import { randomUUID } from 'node:crypto';

import dayjs from 'dayjs';
import { powerMonitor } from 'electron';

import { sendSpriteNotice, type SpriteNoticeLevel } from '../utils/sprite-notice';
import { DEFAULT_ROUTINES } from './constants';
import { loadDailyCareState, saveDailyCareState } from './storage';
import type {
  CalendarSchedule,
  CareRoutineDefinition,
  CustomReminderConfig,
  CustomReminderInput,
  DailyCareRoutineSnapshot,
  DailyCareSnapshot,
  DailyCareStorage,
  IntervalSchedule,
  RoutineRuntime,
  RoutineSchedule,
  RoutineState,
  UpdateSettingsPayload,
  WindowResolver
} from './types';

// === 调度基础常量 ===
const MINUTE = 60 * 1000;
// 当系统闲置超过该秒数，认为用户暂时离开，不推送非紧急提醒
const IDLE_SKIP_SECONDS = 120;
// 从系统恢复（唤醒/解锁）到允许普通提醒之间的冷却时间
const RESUME_COOLDOWN_MS = 60 * 1000;

export class DailyCareService {
  private state: DailyCareStorage;
  private routines: RoutineRuntime[] = [];
  private timer: NodeJS.Timeout | null = null;
  private bootedAt = Date.now();
  private wasSystemIdle = false;
  private resumeCooldownUntil = 0;
  private powerMonitorBound = false;

  constructor(private readonly windowResolver: WindowResolver) {
    this.state = loadDailyCareState();
    this.rebuildRuntimes();
    this.bindPowerMonitor();
  }

  /**
   * 启动服务：刷新基准时间、开启每分钟 tick
   */
  start(): void {
    this.bootedAt = Date.now();
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.tick(), MINUTE);
    this.tick();
  }

  /**
   * 停止服务并解绑系统事件
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.unbindPowerMonitor();
  }

  /**
   * 当前整体状态（给渲染层使用）
   */
  getSnapshot(): DailyCareSnapshot {
    return {
      enabled: this.state.enabled,
      routines: this.routines.map((runtime) => this.toSnapshot(runtime)),
      customReminders: this.state.customReminders,
      lastUpdated: Date.now()
    };
  }

  /**
   * 更新全局/例程设置（启停、间隔等）
   */
  updateSettings(payload: UpdateSettingsPayload): DailyCareSnapshot {
    if (typeof payload.enabled === 'boolean') {
      this.state.enabled = payload.enabled;
    }
    if (payload.routines) {
      for (const [id, patch] of Object.entries(payload.routines)) {
        const prev = this.state.routines[id] || {};
        this.state.routines[id] = {
          ...prev,
          ...patch
        };
      }
    }
    saveDailyCareState(this.state);
    this.rebuildRuntimes();
    return this.getSnapshot();
  }

  /**
   * 新建或更新自定义提醒
   */
  upsertCustomReminder(reminder: CustomReminderInput): { reminder: CustomReminderConfig; snapshot: DailyCareSnapshot } {
    const existingIndex = reminder.id ? this.state.customReminders.findIndex((r) => r.id === reminder.id) : -1;
    const normalized: CustomReminderConfig = {
      ...reminder,
      id: reminder.id || randomUUID(),
      repeat: reminder.repeat || 'none',
      enabled: reminder.enabled !== false,
      leadMinutes: typeof reminder.leadMinutes === 'number' ? reminder.leadMinutes : reminder.kind === 'meeting' ? 15 : 0
    };
    if (existingIndex >= 0) {
      this.state.customReminders[existingIndex] = normalized;
    } else {
      this.state.customReminders.push(normalized);
    }
    saveDailyCareState(this.state);
    this.rebuildRuntimes();
    return { reminder: normalized, snapshot: this.getSnapshot() };
  }

  /**
   * 删除自定义提醒
   */
  removeCustomReminder(id: string): DailyCareSnapshot {
    this.state.customReminders = this.state.customReminders.filter((r) => r.id !== id);
    delete this.state.routines[`custom:${id}`];
    saveDailyCareState(this.state);
    this.rebuildRuntimes();
    return this.getSnapshot();
  }

  /**
   * 手动触发某个例程（调试用）
   */
  triggerRoutineById(id: string): { ok: boolean } {
    const runtime = this.routines.find((r) => r.definition.id === id);
    if (!runtime) {
      return { ok: false };
    }
    this.dispatchRoutine(runtime, dayjs(), { manual: true });
    return { ok: true };
  }

  /**
   * 每分钟调度入口：结合系统 idle 态、冷却窗口决定是否触发例程
   */
  private tick(): void {
    if (!this.state.enabled) return;
    const idleSeconds = this.getSystemIdleSeconds();
    console.log('idleSeconds', idleSeconds);

    const systemIdle = idleSeconds >= IDLE_SKIP_SECONDS;
    const justResumed = this.wasSystemIdle && !systemIdle;
    if (justResumed) {
      this.bootedAt = Date.now();
      this.resumeCooldownUntil = Date.now() + RESUME_COOLDOWN_MS;
    }
    this.wasSystemIdle = systemIdle;

    if (systemIdle && idleSeconds > IDLE_SKIP_SECONDS * 5) {
      this.resumeCooldownUntil = 0;
    }

    const now = dayjs();
    this.routines.forEach((runtime) => {
      if (runtime.state.enabled === false) return;
      if (this.shouldSkipForIdle(runtime, idleSeconds)) return;
      const underCooldown = this.resumeCooldownUntil > Date.now();
      if (underCooldown && runtime.definition.kind !== 'nightGuard' && runtime.definition.severity !== 'urgent') {
        return;
      }
      const dueMeta = this.shouldTrigger(runtime, now);
      if (!dueMeta) return;
      this.dispatchRoutine(runtime, now, dueMeta);
    });
  }

  // --- Internal helpers below ---

  /**
   * 判断某个例程在当前时间点是否应该触发，返回幂等 key
   */
  private shouldTrigger(runtime: RoutineRuntime, now: dayjs.Dayjs): { key?: string } | null {
    const schedule = runtime.definition.schedule;
    if (runtime.state.snoozedUntil && runtime.state.snoozedUntil > now.valueOf()) return null;

    if (schedule.kind === 'interval') {
      if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(now.day())) return null;
      if (!this.isWithinActiveWindow(schedule, now)) return null;
      const minutes = runtime.state.customIntervalMinutes || schedule.minutes;
      const baseline = runtime.state.lastTriggeredAt ?? this.bootedAt;
      if (now.valueOf() - baseline < minutes * MINUTE) return null;
      if (runtime.definition.oncePerDay) {
        const key = now.format('YYYY-MM-DD');
        if (runtime.state.lastTriggeredOn === key) return null;
        return { key };
      }
      return {};
    }

    if (schedule.kind === 'fixed') {
      if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(now.day())) return null;
      for (const time of schedule.times) {
        if (!this.isSameMinute(now, time)) continue;
        const key = `${now.format('YYYY-MM-DD')}@${time}`;
        if (runtime.state.lastTriggeredOn === key) return null;
        return { key };
      }
      return null;
    }

    if (schedule.kind === 'calendar') {
      const occurrence = this.resolveCalendarOccurrence(schedule, now);
      if (!occurrence) return null;
      if (Math.abs(now.diff(occurrence, 'minute')) > 0) return null;
      const key = `${occurrence.format('YYYY-MM-DDTHH:mm')}:${schedule.leadMinutes || 0}`;
      if (runtime.state.lastTriggeredOn === key) return null;
      return { key };
    }

    return null;
  }

  /**
   * 实际发送提醒，同时持久化触发时间
   */
  private dispatchRoutine(runtime: RoutineRuntime, now: dayjs.Dayjs, meta?: { key?: string; manual?: boolean }): void {
    const message = this.composeMessage(runtime, now);
    const level = this.toNoticeLevel(runtime.definition.severity);
    try {
      sendSpriteNotice(
        {
          message,
          level,
          durationMs: level === 'warning' || level === 'error' ? 8000 : undefined
        },
        this.windowResolver()
      );
    } catch (error) {
      console.warn('[daily-care] send notice failed', error);
    }

    if (meta?.manual) {
      return;
    }

    runtime.state.lastTriggeredAt = now.valueOf();
    if (meta?.key) {
      runtime.state.lastTriggeredOn = meta.key;
    }
    const stored = this.state.routines[runtime.definition.id] || {};
    this.state.routines[runtime.definition.id] = {
      ...stored,
      lastTriggeredAt: runtime.state.lastTriggeredAt,
      lastTriggeredOn: runtime.state.lastTriggeredOn
    };
    saveDailyCareState(this.state);
  }

  /**
   * 根据默认例程 + 自定义提醒重建运行态缓存
   */
  private rebuildRuntimes(): void {
    const runtimes: RoutineRuntime[] = [];
    DEFAULT_ROUTINES.forEach((def) => runtimes.push(this.buildRuntime(def)));
    this.state.customReminders.forEach((reminder) => {
      if (reminder.enabled === false) return;
      const def = this.buildDefinitionFromReminder(reminder);
      runtimes.push(this.buildRuntime(def));
    });
    this.routines = runtimes;
  }

  /**
   * 构造单个例程的运行态（合并持久化状态）
   */
  private buildRuntime(def: CareRoutineDefinition): RoutineRuntime {
    const cloned = this.cloneDefinition(def);
    const stored = this.state.routines[cloned.id] || {};
    const state: RoutineState = {
      ...stored
    };
    if (typeof state.enabled === 'undefined') {
      state.enabled = true;
    }
    if (cloned.schedule.kind === 'interval' && state.customIntervalMinutes) {
      cloned.schedule = {
        ...cloned.schedule,
        minutes: state.customIntervalMinutes
      };
    }
    return { definition: cloned, state };
  }

  /**
   * 将自定义提醒映射为统一的 RoutineDefinition，方便调度
   */
  private buildDefinitionFromReminder(reminder: CustomReminderConfig): CareRoutineDefinition {
    const { year, month, day } = this.parseDate(reminder.date);
    const schedule: CalendarSchedule = {
      kind: 'calendar',
      repeat: reminder.repeat === 'annual' ? 'yearly' : 'once',
      time: reminder.time,
      date: {
        month,
        day,
        year: reminder.repeat === 'annual' ? undefined : year
      },
      leadMinutes: reminder.leadMinutes || 0
    };
    const defaultMessage = reminder.kind === 'meeting' ? '会议 {{title}} 将在 {{eventTime}} 开始哦～' : reminder.kind === 'birthday' ? '今天是 {{title}}，记得送上祝福！' : '叽~ {{title}} 该安排啦。';
    return {
      id: `custom:${reminder.id}`,
      title: reminder.title,
      description: reminder.message || '自定义提醒',
      kind: reminder.kind === 'meeting' ? 'meeting' : reminder.kind === 'birthday' ? 'birthday' : reminder.kind === 'family' ? 'family' : 'custom',
      severity: reminder.kind === 'meeting' ? 'info' : reminder.kind === 'birthday' ? 'gentle' : 'info',
      schedule,
      messageTemplates: [reminder.message || defaultMessage],
      tags: reminder.tags,
      metadata: {
        customId: reminder.id,
        eventTime: reminder.time,
        date: reminder.date,
        repeat: reminder.repeat
      },
      channel: 'spriteNotice',
      source: 'custom'
    };
  }

  /**
   * 进行浅拷贝，避免在运行过程中污染常量定义
   */
  private cloneDefinition(def: CareRoutineDefinition): CareRoutineDefinition {
    return {
      ...def,
      schedule: this.cloneSchedule(def.schedule),
      messageTemplates: def.messageTemplates ? [...def.messageTemplates] : [],
      tags: def.tags ? [...def.tags] : undefined,
      metadata: def.metadata ? { ...def.metadata } : undefined
    };
  }

  private cloneSchedule(schedule: RoutineSchedule): RoutineSchedule {
    if (schedule.kind === 'interval') {
      return { ...schedule };
    }
    if (schedule.kind === 'fixed') {
      return { ...schedule, times: [...schedule.times] };
    }
    return {
      ...schedule,
      date: schedule.date ? { ...schedule.date } : undefined,
      nthWeekday: schedule.nthWeekday ? { ...schedule.nthWeekday } : undefined
    };
  }

  /**
   * 解析 YYYY-MM-DD 字符串（容错缺失字段）
   */
  private parseDate(dateStr: string): { year: number; month: number; day: number } {
    const parts = dateStr.split('-').map((p) => Number.parseInt(p, 10));
    return {
      year: parts[0] || dayjs().year(),
      month: parts[1] || 1,
      day: parts[2] || 1
    };
  }

  /**
   * 用简单模板语法渲染提示语
   */
  private composeMessage(runtime: RoutineRuntime, now: dayjs.Dayjs): string {
    const templates = runtime.definition.messageTemplates?.length ? runtime.definition.messageTemplates : [runtime.definition.title];
    const tpl = templates[Math.floor(Math.random() * templates.length)] || runtime.definition.title;
    const context: Record<string, unknown> = {
      title: runtime.definition.title,
      now: now.format('HH:mm'),
      today: now.format('YYYY-MM-DD'),
      eventDate: runtime.definition.metadata?.date ?? '',
      eventTime: runtime.definition.metadata?.eventTime ?? '',
      kind: runtime.definition.kind,
      ...runtime.definition.metadata
    };
    return tpl.replace(/\{\{(.*?)\}\}/g, (_, key) => {
      const token = key?.trim();
      if (!token) return '';
      const value = context[token];
      return value != null ? String(value) : '';
    });
  }

  private isWithinActiveWindow(schedule: IntervalSchedule, now: dayjs.Dayjs): boolean {
    const start = schedule.activeHourStart ? this.timeToMinutes(schedule.activeHourStart) : 0;
    const end = schedule.activeHourEnd ? this.timeToMinutes(schedule.activeHourEnd) : 24 * 60;
    const current = now.hour() * 60 + now.minute();
    if (end >= start) {
      return current >= start && current <= end;
    }
    return current >= start || current <= end;
  }

  private isSameMinute(now: dayjs.Dayjs, timeStr: string): boolean {
    const [hour, minute] = this.parseTime(timeStr);
    return now.hour() === hour && now.minute() === minute;
  }

  /**
   * 计算“日历型”提醒本次触发的时间点（含提前提醒）
   */
  private resolveCalendarOccurrence(schedule: CalendarSchedule, now: dayjs.Dayjs): dayjs.Dayjs | null {
    const [hour, minute] = this.parseTime(schedule.time);
    const lead = schedule.leadMinutes || 0;
    let target: dayjs.Dayjs | null = null;
    if (schedule.date) {
      const baseYear = schedule.repeat === 'yearly' ? now.year() : (schedule.date.year ?? now.year());
      target = dayjs()
        .set('year', baseYear)
        .set('month', schedule.date.month - 1)
        .set('date', schedule.date.day)
        .set('hour', hour)
        .set('minute', minute)
        .set('second', 0)
        .set('millisecond', 0);
      if (schedule.repeat === 'yearly' && target.isBefore(now.subtract(lead, 'minute'))) {
        target = target.add(1, 'year');
      }
    } else if (schedule.nthWeekday) {
      target = this.nthWeekdayOfMonth(now.year(), schedule.nthWeekday.month, schedule.nthWeekday.weekday, schedule.nthWeekday.nth)
        .set('hour', hour)
        .set('minute', minute)
        .set('second', 0)
        .set('millisecond', 0);
      if (schedule.repeat === 'yearly' && target.isBefore(now.subtract(lead, 'minute'))) {
        target = target.add(1, 'year');
      }
    }
    if (!target) return null;
    return target.subtract(lead, 'minute');
  }

  /**
   * 求某年某月第 n 个星期 X 的具体日期
   */
  private nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): dayjs.Dayjs {
    let cursor = dayjs()
      .set('year', year)
      .set('month', month - 1)
      .set('date', 1)
      .startOf('day');
    const delta = (weekday - cursor.day() + 7) % 7;
    cursor = cursor.add(delta, 'day').add(nth - 1, 'week');
    return cursor;
  }

  private timeToMinutes(time: string): number {
    const [hour, minute] = this.parseTime(time);
    return hour * 60 + minute;
  }

  private parseTime(time: string): [number, number] {
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number.parseInt(hourStr, 10);
    const minute = Number.parseInt(minuteStr, 10);
    return [Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0];
  }

  private toSnapshot(runtime: RoutineRuntime): DailyCareRoutineSnapshot {
    return {
      id: runtime.definition.id,
      title: runtime.definition.title,
      description: runtime.definition.description,
      kind: runtime.definition.kind,
      severity: runtime.definition.severity || 'info',
      enabled: runtime.state.enabled !== false,
      scheduleLabel: this.describeSchedule(runtime.definition.schedule),
      lastTriggeredAt: runtime.state.lastTriggeredAt ?? null,
      lastTriggeredLabel: runtime.state.lastTriggeredAt ? dayjs(runtime.state.lastTriggeredAt).format('YYYY-MM-DD HH:mm') : null,
      tags: runtime.definition.tags,
      metadata: runtime.definition.metadata,
      source: runtime.definition.source || 'default'
    };
  }

  /**
   * 将调度规则转为可读字符串，供设置页展示
   */
  private describeSchedule(schedule: RoutineSchedule): string {
    if (schedule.kind === 'interval') {
      const range = schedule.activeHourStart || schedule.activeHourEnd ? ` · ${schedule.activeHourStart || '00:00'}-${schedule.activeHourEnd || '24:00'}` : '';
      return `每 ${schedule.minutes} 分钟${range}`;
    }
    if (schedule.kind === 'fixed') {
      return `每日 ${schedule.times.join(' / ')}`;
    }
    if (schedule.nthWeekday) {
      return `每年 ${schedule.nthWeekday.month} 月第 ${schedule.nthWeekday.nth} 个周${this.weekdayLabel(schedule.nthWeekday.weekday)} ${schedule.time}`;
    }
    if (schedule.date) {
      if (schedule.repeat === 'once' && schedule.date.year) {
        return `${schedule.date.year}/${schedule.date.month}/${schedule.date.day} ${schedule.time}`;
      }
      return `每年 ${schedule.date.month}/${schedule.date.day} ${schedule.time}`;
    }
    return '自定义';
  }

  private weekdayLabel(day: number): string {
    const labels = ['日', '一', '二', '三', '四', '五', '六'];
    return labels[day] || '日';
  }

  /**
   * 映射业务严重程度到精灵 notice level
   */
  private toNoticeLevel(severity?: CareRoutineDefinition['severity']): SpriteNoticeLevel {
    switch (severity) {
      case 'urgent':
        return 'error';
      case 'warning':
        return 'warning';
      case 'gentle':
      case 'info':
      default:
        return 'info';
    }
  }

  /**
   * 根据系统 idle 状态决定是否跳过非紧急提醒
   */
  private shouldSkipForIdle(runtime: RoutineRuntime, idleSeconds: number): boolean {
    if (idleSeconds < IDLE_SKIP_SECONDS) return false;
    if (runtime.definition.kind === 'nightGuard' || runtime.definition.severity === 'urgent') return false;
    return true;
  }

  /**
   * 读取系统闲置时长，若 Electron API 不可用则返回 0
   */
  private getSystemIdleSeconds(): number {
    try {
      if (typeof powerMonitor?.getSystemIdleTime === 'function') {
        return powerMonitor.getSystemIdleTime();
      }
      return 0;
    } catch (error) {
      console.warn('[daily-care] powerMonitor unavailable', error);
      return 0;
    }
  }

  /**
   * 系统唤醒/解锁：刷新基准时间并启动冷却
   */
  private readonly handleSystemResume = (): void => {
    this.bootedAt = Date.now();
    console.log('handleSystemResume');
    console.log('bootedAt', this.bootedAt);
    console.log('resumeCooldownUntil', this.resumeCooldownUntil);
    console.log('wasSystemIdle', this.wasSystemIdle);
    console.log('resumeCooldownUntil', this.resumeCooldownUntil);
    this.wasSystemIdle = false;
    this.resumeCooldownUntil = Date.now() + RESUME_COOLDOWN_MS;
  };

  /**
   * 系统休眠/锁屏：标记为 idle，立即停止普通提醒
   */
  private readonly handleSystemSuspend = (): void => {
    console.log('handleSystemSuspend');
    console.log('bootedAt', this.bootedAt);
    console.log('resumeCooldownUntil', this.resumeCooldownUntil);
    console.log('wasSystemIdle', this.wasSystemIdle);
    console.log('resumeCooldownUntil', this.resumeCooldownUntil);
    this.wasSystemIdle = true;
    this.resumeCooldownUntil = 0;
  };

  /**
   * 绑定 Electron powerMonitor 事件，避免重复绑定
   */
  private bindPowerMonitor(): void {
    if (this.powerMonitorBound) return;
    try {
      powerMonitor?.on('resume', this.handleSystemResume);
      powerMonitor?.on('unlock-screen', this.handleSystemResume);
      powerMonitor?.on('suspend', this.handleSystemSuspend);
      powerMonitor?.on('lock-screen', this.handleSystemSuspend);
      this.powerMonitorBound = true;
    } catch (error) {
      console.warn('[daily-care] bind powerMonitor failed', error);
    }
  }

  /**
   * 解绑系统事件，防止内存泄漏
   */
  private unbindPowerMonitor(): void {
    if (!this.powerMonitorBound) return;
    try {
      powerMonitor?.off('resume', this.handleSystemResume);
      powerMonitor?.off('unlock-screen', this.handleSystemResume);
      powerMonitor?.off('suspend', this.handleSystemSuspend);
      powerMonitor?.off('lock-screen', this.handleSystemSuspend);
    } catch (error) {
      console.warn('[daily-care] unbind powerMonitor failed', error);
    } finally {
      this.powerMonitorBound = false;
    }
  }
}
