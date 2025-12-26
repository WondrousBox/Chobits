import { ChildProcess, exec, spawn } from 'child_process';
import net from 'net';
import os from 'os';
import { promisify } from 'util';

import pkg from '../../package.json';
import { getResourcePath } from '../common/utils';

const execAsync = promisify(exec);

// 等待指定时间
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class RecorderServer {
  private process?: ChildProcess;
  private pid?: number;

  constructor() {
    this.process = undefined;
    this.pid = undefined;
  }

  /**
   * 检查并清理占用指定端口的进程（仅 macOS）
   */
  private async killProcessOnPort(port: number): Promise<boolean> {
    if (os.platform() !== 'darwin') {
      return false;
    }

    try {
      // 使用 lsof 查找占用端口的进程
      const { stdout } = await execAsync(`lsof -ti :${port}`);
      const pids = stdout
        .trim()
        .split('\n')
        .filter((pid) => pid.length > 0);

      if (pids.length === 0) {
        console.log(`[RecorderServer] Port ${port} is not in use`);
        return false;
      }

      console.log(`[RecorderServer] Found ${pids.length} process(es) using port ${port}: ${pids.join(', ')}`);

      // 终止所有占用端口的进程
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`[RecorderServer] Killed process ${pid} on port ${port}`);
        } catch (error) {
          console.warn(`[RecorderServer] Failed to kill process ${pid}:`, error);
        }
      }

      // 等待端口释放
      await sleep(500);
      return true;
    } catch (error: any) {
      // lsof 返回非零退出码表示没有找到进程，这是正常的
      if (error.code === 1) {
        console.log(`[RecorderServer] Port ${port} is not in use`);
        return false;
      }
      console.error(`[RecorderServer] Error checking port ${port}:`, error);
      return false;
    }
  }

  private async checkMacOSPermissions(): Promise<boolean> {
    if (os.platform() !== 'darwin') {
      return true;
    }

    try {
      const { systemPreferences, shell, dialog, desktopCapturer } = await import('electron');

      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log(`[RecorderServer] Screen recording permission status: ${status}`);

      if (status === 'granted') {
        return true;
      }

      if (status === 'denied') {
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          title: '需要屏幕录制和系统音频权限',
          message: pkg.name + ' 需要屏幕录制权限才能进行录制。',
          detail: '请在"系统设置 > 隐私与安全性 > 屏幕录制"中允许 ' + pkg.name + '，并在弹出的对话框中勾选"允许系统音频录制"。授予权限后请重启应用。',
          buttons: ['打开系统设置', '取消'],
          defaultId: 0,
          cancelId: 1
        });

        if (response === 0) {
          await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        }
        return false;
      }

      if (status === 'not-determined' || status === 'unknown') {
        console.log('[RecorderServer] Permission not determined, triggering prompt...');
        try {
          await desktopCapturer.getSources({ types: ['screen'] });
          const newStatus = systemPreferences.getMediaAccessStatus('screen');
          if (newStatus === 'granted') {
            return true;
          }

          await dialog.showMessageBox({
            type: 'info',
            title: '请授予权限',
            message: '请在弹出的窗口中允许屏幕录制权限，并勾选"允许系统音频录制"。',
            detail: '授予权限后，您可能需要重启应用才能录制系统音频。'
          });
          return false;
        } catch (e) {
          console.error('[RecorderServer] Failed to trigger permission prompt:', e);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('[RecorderServer] Error checking permissions:', error);
      return true;
    }
  }

  private spawnServer(port = 8765): Promise<{ pid: number | undefined; port: number }> {
    const recorderBinPath = getResourcePath('recorder');
    if (!recorderBinPath) {
      return Promise.reject(new Error('Recorder binary path not found'));
    }

    console.log(`[RecorderServer] Starting server on port ${port} (binary: ${recorderBinPath})`);

    return new Promise((resolve, reject) => {
      const child = spawn(recorderBinPath, ['-s', '-p', port.toString(), '-i', '200']);
      this.process = child;

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log(`[RecorderServer] stdout: ${output.trim()}`);

        // 捕获进程 ID
        const pidMatch = output.match(/Process PID: (\d+)/);
        if (pidMatch) {
          this.pid = parseInt(pidMatch[1]);
        }

        // 当服务器完全启动时解析 Promise
        if (output.includes('WebSocket 服务器地址:')) {
          console.log(`[RecorderServer] Server startup completed (PID: ${this.pid})`);
          resolve({
            pid: this.pid,
            port: port
          });
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.error(`[RecorderServer] stderr: ${data.toString().trim()}`);
      });

      child.on('error', (error: Error) => {
        console.error('[RecorderServer] Process spawn error:', error);
        reject(error);
      });

      child.on('close', (code: number) => {
        if (code !== 0) {
          console.warn(`[RecorderServer] Process exited with non-zero code: ${code}`);
        }
        this.process = undefined;
        this.pid = undefined;
      });

      child.on('exit', (code: number, signal: string) => {
        console.log(`[RecorderServer] Process exited (code: ${code}, signal: ${signal})`);
      });
    });
  }

  async start(port = 8765): Promise<boolean> {
    console.log(`[RecorderServer] === Starting  Recorder Server (port: ${port}, platform: ${os.platform()}, arch: ${os.arch()}) ===`);

    const hasPermission = await this.checkMacOSPermissions();
    console.log(hasPermission);

    if (!hasPermission) {
      console.warn('[RecorderServer] Screen recording permission missing, aborting start.');
      return false;
    }

    try {
      // 在启动前检查并清理端口占用
      await this.killProcessOnPort(port);

      // 启动服务器
      const { port: serverPort } = await this.spawnServer(port);

      // 等待服务器初始化并检查端口
      console.log('[RecorderServer] Waiting for server to be ready...');
      await sleep(2000);

      const isReady = await this.waitForPort(serverPort);
      if (!isReady) {
        throw new Error(`[RecorderServer] Server startup timeout. Port ${serverPort} may not be available.`);
      }

      await sleep(1000);
      console.log('[RecorderServer] === Server ready to accept connections ===');

      return true;
    } catch (error) {
      console.error('[RecorderServer] Failed to start server:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<boolean> {
    console.log('[RecorderServer] === Stopping  Recorder Server ===');

    if (!this.pid || !this.process) {
      console.warn('[RecorderServer] No running server found to stop');
      // 确保状态被清理
      this.pid = undefined;
      this.process = undefined;
      return true;
    }

    console.log(`[RecorderServer] Stopping server (PID: ${this.pid})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          console.warn('[RecorderServer] Process did not exit in time, force killing...');
          this.process.kill('SIGKILL');
        }
      }, 5000);

      // 监听一次性 close 事件
      this.process?.once('close', () => {
        clearTimeout(timeout);
        console.log('[RecorderServer] Server stopped successfully (close event received)');
        resolve(true);
      });

      // 发送终止信号
      const killed = this.process?.kill('SIGTERM');
      if (!killed) {
        clearTimeout(timeout);
        reject(new Error('Failed to send SIGTERM signal'));
      }
    });
  }

  isRunning(): boolean {
    return !!this.pid;
  }

  private async waitForPort(port: number, maxAttempts = 10): Promise<boolean> {
    // 增加重试次数
    console.log(`[PortChecker] Checking port ${port} availability (max attempts: ${maxAttempts})`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise((resolve, reject) => {
          const client = new net.Socket();
          const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('连接超时'));
          }, 1000);

          client.on('connect', () => {
            clearTimeout(timeout);
            client.destroy();
            resolve(void 0);
          });

          client.on('error', (err) => {
            clearTimeout(timeout);
            client.destroy();
            reject(err);
          });

          client.connect(port, '127.0.0.1');
        });

        console.log(`[PortChecker] Port ${port} is available (attempt ${i + 1})`);

        return true;
      } catch (e) {
        console.log(e);

        if (i < maxAttempts - 1) {
          console.log(`[PortChecker] Port ${port} not ready, retrying in 2s... (${i + 1}/${maxAttempts})`);
          await sleep(2000); // 增加等待时间
        }
      }
    }

    console.error(`[PortChecker] Port ${port} failed to become available after ${maxAttempts} attempts`);

    return false;
  }
}

export default RecorderServer;

export const recorderServer = new RecorderServer();
