import dayjs from 'dayjs';
import log, { LogFunctions } from 'electron-log';
import { LOG_LEVEL } from '../config';
import { getResourcePath } from '../utils/resources-path';

console.log('log initialize');
// It preloads electron-log IPC code in renderer processes
log.initialize();

export default class Logger {
  log: LogFunctions;
  static create(scope: string): Logger {
    return new Logger(scope);
  }
  constructor(scope: string) {
    this.resolvePath();
    // this.setFormat("[{level} {h}:{i}:{s}.{ms}{scope}]  {text}");
    this.setFormat('[{level} {h}:{i}:{s}.{ms}]  {text}');
    Object.assign(console, log.functions);
    this.log = log.scope(scope);
    // console.log = this.log.info;
  }

  resolvePath(): void {
    // https://github.com/strisys/electron-ipc-bridge-factory
    log.transports.file.resolvePathFn = () => {
      const logPath = getResourcePath('logs');

      return `${logPath}/${dayjs().format('YYYY-MM-DD')}.log`;
    };
  }

  setFormat(f: string): void {
    // https://github.com/megahertz/electron-log/tree/master#overriding-consolelog
    log.transports.file.format = log.transports.console.format = f;
  }
}

export const logger = Logger.create(LOG_LEVEL);

logger.log.info(`----------------------------- Starting [${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ---------------------------------------`);

export function devLog(...args: any[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

export function binPathLog(binPath: string, name?: string): void {
  console.log(`========= ${name ? `${name} ` : ''}: ${binPath}`);
}
