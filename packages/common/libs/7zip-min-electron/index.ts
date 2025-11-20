import { spawn } from 'node:child_process';
import path from 'node:path';

import { app } from 'electron';
import os from 'os';

const path7za = path.resolve(
  app.getAppPath(),
  app.isPackaged ? `../7zip/${os.platform() === 'darwin' ? '7za' : '7za.exe'}` : `./resources/7zip/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? '7za' : '7za.exe'}`
);

type CallbackFn = (err: Error | null, result?: any) => void;
type ProgressFn = (progress: { progress: number; index: number }) => void;

interface ListItem {
  name?: string;
  size?: string;
  compressed?: string;
  attr?: string;
  date?: string;
  time?: string;
  crc?: string;
  method?: string;
  block?: string;
  encrypted?: string;
}

/**
 * Unpack archive.
 * @param {string} pathToPack - path to archive you want to unpack.
 * @param {string|function} destPathOrCb - Either:
 *                                              (i) destination path, where to unpack.
 *                                              (ii) callback function, in case no destPath to be specified
 * @param {function} [cb] - callback function. Will be called once unpack is done. If no errors, first parameter will contain `null`
 * NOTE: Providing destination path is optional. In case it is not provided, cb is expected as the second argument to function.
 */
export function unpack(pathToPack: string, destPathOrCb: string | CallbackFn, cb?: CallbackFn, p?: ProgressFn, x?: string): void {
  if (typeof destPathOrCb === 'function' && cb === undefined) {
    const callback = destPathOrCb;
    const arg = ['x', pathToPack, '-y', '-bsp1'];
    if (x) {
      arg.push(x);
    }
    run(path7za, arg, callback, p);
  } else {
    const arg = ['x', pathToPack, '-y', '-o' + destPathOrCb, '-bsp1'];
    if (x) {
      arg.push(x);
    }
    run(path7za, arg, cb!, p);
  }
}

/**
 * Pack file or folder to archive.
 * @param {string} pathToSrc - path to file or folder you want to compress.
 * @param {string} pathToDest - path to archive you want to create.
 * @param {function} cb - callback function. Will be called once pack is done. If no errors, first parameter will contain `null`.
 */
export function pack(pathToSrc: string, pathToDest: string, cb: CallbackFn): void {
  run(path7za, ['a', pathToDest, pathToSrc], cb, undefined);
}

/**
 * Get an array with compressed file contents.
 * @param {string} pathToSrc - path to file its content you want to list.
 * @param {function} cb - callback function. Will be called once list is done. If no errors, first parameter will contain `null`.
 */
export function list(pathToSrc: string, cb: CallbackFn): void {
  run(path7za, ['l', '-slt', '-ba', pathToSrc], cb, undefined);
}

/**
 * Run 7za with parameters specified in `paramsArr`.
 * @param {array} paramsArr - array of parameter. Each array item is one parameter.
 * @param {function} cb - callback function. Will be called once command is done. If no errors, first parameter will contain `null`. If no output, second parameter will be `null`.
 */
export function cmd(paramsArr: string[], cb: CallbackFn): void {
  run(path7za, paramsArr, cb, undefined);
}

function extractProgressAndIndex(str: string): { progress: number; index: number } {
  const regex = /(\d+)% (\d+)/;
  const match = str.match(regex);
  if (match) {
    const progress = parseInt(match[1]);
    const index = parseInt(match[2]);

    return { progress, index };
  }

  return { progress: -1, index: -1 };
}

function run(bin: string, args: string[], cb: CallbackFn, p?: ProgressFn): void {
  cb = onceify(cb);
  const runError = new Error(); // get full stack trace
  const proc = spawn(bin, args, { windowsHide: true });
  let output = '';
  proc.on('error', function (err) {
    cb(err);
  });
  proc.on('exit', function (code) {
    let result = null;
    if (args[0] === 'l') {
      result = parseListOutput(output);
    }
    if (code) {
      runError.message = `7-zip exited with code ${code}\n${output}`;
    }
    cb(code ? runError : null, result);
  });
  proc.stdout.on('data', (chunk) => {
    const progressString = chunk.toString();
    const progress = extractProgressAndIndex(progressString);
    p && progress.index && p(progress);
    output += progressString;
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
}

// http://stackoverflow.com/questions/30234908/javascript-v8-optimisation-and-leaking-arguments
// javascript V8 optimisation and "leaking arguments"
// making callback to be invoked only once
function onceify(fn: CallbackFn): CallbackFn {
  let called = false;

  return function (err: Error | null, result?: any) {
    if (called) {
      return;
    }
    called = true;
    fn(err, result);
  };
}

function parseListOutput(str: string): ListItem[] {
  if (!str.length) {
    return [];
  }
  str = str.replace(/(\r\n|\n|\r)/gm, '\n');
  const items = str.split(/^\s*$/m);
  const res: ListItem[] = [];
  const LIST_MAP: Record<string, keyof ListItem | 'dateTime'> = {
    Path: 'name',
    Size: 'size',
    'Packed Size': 'compressed',
    Attributes: 'attr',
    Modified: 'dateTime',
    CRC: 'crc',
    Method: 'method',
    Block: 'block',
    Encrypted: 'encrypted'
  };

  if (!items.length) {
    return [];
  }

  for (const item of items) {
    if (!item.length) {
      continue;
    }
    const obj: ListItem = {};
    const lines = item.split('\n');
    if (!lines.length) {
      continue;
    }
    for (const line of lines) {
      // Split by first " = " occurrence. This will also add an empty 3rd elm to the array. Just ignore it
      const data = line.split(/ = (.*)/s);
      if (data.length !== 3) {
        continue;
      }
      const name = data[0].trim();
      const val = data[1].trim();
      if (LIST_MAP[name]) {
        if (LIST_MAP[name] === 'dateTime') {
          const dtArr = val.split(' ');
          if (dtArr.length !== 2) {
            continue;
          }
          obj['date'] = dtArr[0];
          obj['time'] = dtArr[1];
        } else {
          obj[LIST_MAP[name]] = val;
        }
      }
    }
    if (Object.keys(obj).length) {
      res.push(obj);
    }
  }

  return res;
}
