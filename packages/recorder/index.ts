import { ChildProcess, spawn } from 'child_process';
import net from 'net';
import os from 'os';

import { getResourcePath } from '../common/utils';

// 等待指定时间
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class RecorderServer {
  private process?: ChildProcess;
  private pid?: number;

  constructor() {
    this.process = undefined;
    this.pid = undefined;
  }

  private spawnServer(port = 8765): Promise<{ pid: number | undefined; port: number }> {
    const recorderBinPath = getResourcePath('recorder');
    if (!recorderBinPath) {
      return Promise.reject(new Error('Recorder binary path not found'));
    }

    console.log(`[RecorderServer] Starting server on port ${port} (binary: ${recorderBinPath})`);

    return new Promise((resolve, reject) => {
      const child = spawn(recorderBinPath, ['-s', '-p', port.toString()]);
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

    try {
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
