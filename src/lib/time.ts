import 'dayjs/locale/zh';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/de';
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone'; // dependent on utc plugin
import utc from 'dayjs/plugin/utc';

// 获取用户的本地时区
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
dayjs.extend(relativeTime);

dayjs.extend(utc);
dayjs.extend(timezone);

// dayjs.tz.setDefault("UTC") // 设置时区，如：上海，东八区，UTC + 8
// dayjs() // 依旧是服务器/本地时区
// dayjs.tz() //这样才是指定的时区

export function changeDayjsLocale(lang: 'zh-cn' | 'zh-tw' | 'de' | 'en' | 'es' | 'it' | 'ja' | 'ko'): void {
  dayjs.locale(lang || 'en'); // use Chinese Simplified locale in a specific instance
}

export function formatRelativeTime(date?: string | number | null | undefined): string {
  if (typeof date !== 'string' && typeof date !== 'number') {
    // 处理非字符串和非数字的情况
    return ''; // 或者返回默认值或错误信息
  }
  if (!date) {
    return '';
  }
  if (typeof date === 'number') {
    return dayjs(date).fromNow();
  }
  const isoFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
  if (isoFormat.test(date)) {
    return dayjs(date).fromNow();
  }

  const serverData = new Date(date!);
  const newDate = new Date(serverData.getTime() - 3600000 * (serverData.getTimezoneOffset() / 60));

  // // 获取数据库中的时间（假设为0时区）
  // const dbTime = new Date('2022-01-01T00:00:00Z');
  // // 获取用户的本地时区
  // const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // // 将时间转换为用户本地时区
  // const localTime = new Date(dbTime.toLocaleString('en-US', { timeZone: userTimezone }));
  // // 格式化转换后的时间
  // const formattedTime = localTime.toLocaleString('en-US', { timeZone: userTimezone });
  // // 在用户界面上显示格式化后的时间
  // console.log(formattedTime);
  // return dayjs.tz(newDate, userTimezone).format("YYYY-MM-DD HH:mm:ss");
  return dayjs.tz(newDate, userTimezone).fromNow();
}

export function formatTime2(seconds?: number, short?: boolean): string {
  if (!seconds) {
    return '00:00';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = (seconds % 3600) % 60;

  const formattedHours = padNumber(hours);
  const formattedMinutes = padNumber(minutes);
  const formattedSeconds = padNumber(Math.floor(remainingSeconds));

  return `${short ? (formattedHours === '00' ? '' : formattedHours + ':') : formattedHours + ':'}${formattedMinutes}:${formattedSeconds}`;
}

export function padNumber(num: number, length = 2): string {
  return num.toString().padStart(length, '0');
}

export function getNewFolderTime(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function getHistoryTime(time?: number | string): string {
  return dayjs(time).format('YYYY-MM-DD HH:mm');
}

export function formatDateTime(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
