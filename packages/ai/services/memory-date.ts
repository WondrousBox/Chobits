import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const MEMORY_DATE_FORMAT = 'YYYY-MM-DD';

export function resolveMemoryTimezone(timezoneName?: string): string {
  return timezoneName || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatMemoryDate(value: dayjs.ConfigType = Date.now(), timezoneName?: string): string {
  return dayjs(value).tz(resolveMemoryTimezone(timezoneName)).format(MEMORY_DATE_FORMAT);
}

export function getTodayMemoryDate(timezoneName?: string): string {
  return formatMemoryDate(Date.now(), timezoneName);
}

export function getRelativeMemoryDate(daysDelta: number, timezoneName?: string, baseValue: dayjs.ConfigType = Date.now()): string {
  return dayjs(baseValue).tz(resolveMemoryTimezone(timezoneName)).add(daysDelta, 'day').format(MEMORY_DATE_FORMAT);
}

export function getNextMemoryDate(date: string, timezoneName?: string): string {
  return dayjs.tz(`${date}T12:00:00`, resolveMemoryTimezone(timezoneName)).add(1, 'day').format(MEMORY_DATE_FORMAT);
}
