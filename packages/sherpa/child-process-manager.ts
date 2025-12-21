import { fork, ForkOptions } from 'child_process';
import EventEmitter from 'events';

type Options = {
  forkOptions?: ForkOptions;
  maxRestarts?: number;
  restartDelay?: number;
  args?: string[];
};

class ChildProcessManager extends EventEmitter {
  scriptPath: string;
  childProcess: any;
  options: Options;
  restartCount: number;
  isShuttingDown: boolean;

  constructor(scriptPath: string, options: Options = {}) {
    super();
    this.scriptPath = scriptPath;
    this.options = {
      maxRestarts: options.maxRestarts || 5,
      restartDelay: options.restartDelay || 5000,
      args: options.args || [],
      forkOptions: options.forkOptions || {}
    };
    this.childProcess = null;
    this.restartCount = 0;
    this.isShuttingDown = false;
  }

  start(): void {
    if (this.childProcess) {
      this.emit('warning', 'Child process already running');

      return;
    }

    this.createProcess();
  }
  exist(): boolean {
    if (this.childProcess) {
      return true;
    } else {
      return false;
    }
  }

  createProcess(): void {
    this.childProcess = fork(this.scriptPath, this.options.args, this.options.forkOptions);

    this.childProcess.on('error', (error: any) => {
      this.emit('error', error);
      this.handleProcessFailure('error');
    });

    this.childProcess.on('exit', (code: number, signal: string) => {
      this.emit('exit', code, signal);
      if (code !== 0 && !this.isShuttingDown) {
        this.handleProcessFailure('exit');
      }
    });

    this.childProcess.on('message', (message: any) => {
      this.emit('message', message);
    });

    this.childProcess.on('uncaughtException', (err: any) => {
      console.log(`[child] 未捕获的异常: ${err.message}`);
    });

    this.childProcess.on('unhandledRejection', (reason: string) => {
      console.log(`[child] 未处理的 Promise 拒绝: ${reason}`);
    });

    // Listen to stdout and stderr of the child process
    this.childProcess.stdout?.on('data', (data: string) => {
      console.log(`[child stdout]: ${data}`);
    });

    this.childProcess.stderr?.on('data', (data: string) => {
      console.log(`[child stderr]: ${data}`);
    });

    this.emit('started');
  }

  handleProcessFailure(reason: string): void {
    if (this.restartCount < (this.options.maxRestarts || 5)) {
      this.restartCount++;
      this.emit('restarting', { reason, attempt: this.restartCount });
      setTimeout(() => this.createProcess(), this.options.restartDelay);
    } else {
      this.emit('max-restarts-reached');
    }
  }

  send(message: any): void {
    if (this.childProcess) {
      this.childProcess.send(message);
    } else {
      this.emit('warning', 'Attempted to send message to non-existent child process');
    }
  }

  stop(): void {
    if (this.childProcess) {
      this.isShuttingDown = true;
      this.childProcess.removeAllListeners();
      this.childProcess.kill();
      this.childProcess = null;
      this.emit('stopped');
    }
  }

  restart(): void {
    this.stop();
    this.restartCount = 0;
    this.isShuttingDown = false;
    setTimeout(() => this.start(), 1000); // 短暂延迟以确保进程完全停止
  }
}
export default ChildProcessManager;
