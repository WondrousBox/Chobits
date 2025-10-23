import fs from 'fs';
import os from 'os';

const isMac = os.platform() === 'darwin';
const isMacIntel = os.platform() === 'darwin' && os.arch() === 'x64';
const arch = os.arch();
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

const platform = os.platform();

const osName = isMac ? 'macOS' : 'Windows';

const cpus = os.cpus();
let cpuStr = '';
if (cpus[0] && cpus[0].model) {
  cpuStr = `${cpus[0].model} (${cpus.length}core)`;
} else {
  cpuStr = `${cpus.length} core`;
}

function getOSVersion(): string {
  if (!isMac) {
    return os.release();
  } else {
    try {
      const parseVersion = function (plist: string): string | undefined {
        const m = /<key>ProductVersion<\/key>[\s]*<string>([\d.]+)<\/string>/.exec(plist);
        if (!m) {
          return;
        }

        return m[1];
      };
      const file = fs.readFileSync('/System/Library/CoreServices/SystemVersion.plist', 'utf8');
      const matches = parseVersion(file);
      if (!matches) {
        return os.release();
      }

      return matches;
    } catch (err) {
      console.log(err);
      return os.release();
    }
  }
}

export { isMac, isWindows, isLinux, isMacIntel, platform, osName, arch, cpuStr, cpus, getOSVersion };
