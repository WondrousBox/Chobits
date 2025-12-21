import WebSocket from 'ws';

class MemoRecorderClient {
  constructor(options = {}) {
    this.ws = null;
    this.isConnected = false;
    this.port = options.port || 8765;
    this.onData = options.onData || null; // 接收音频数据的回调函数
  }

  // 内部方法：连接 WebSocket
  _connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

      this.ws.on('open', () => {
        this.isConnected = true;
        console.log('已连接到服务器');
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        console.log('连接已关闭');
      });

      // 处理消息
      this.ws.on('message', (data, isBinary) => {
        if (isBinary) {
          this.handlePcmData(data);
        } else {
          console.log('收到文本消息:', data.toString());
        }
      });
    });
  }

  // 开始录音
  async startRecording() {
    try {
      // 先连接 WebSocket
      await this._connect();

      // 发送 start 消息来启动录音
      if (this.ws && this.isConnected) {
        this.ws.send('start');
        console.log('已发送 start 消息，开始录音');
      }
    } catch (error) {
      console.error('开始录音失败:', error);
      throw error;
    }
  }

  // 结束录音
  async stopRecording() {
    try {
      // 先发送 stop 消息
      if (this.ws && this.isConnected) {
        this.ws.send('stop');
        console.log('已发送 stop 消息，停止录音');

        // 等待一小段时间确保消息发送完成
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 然后断开连接
      await this._disconnect();
    } catch (error) {
      console.error('结束录音失败:', error);
      throw error;
    }
  }

  handlePcmData(data) {
    console.log(`收到二进制数据，大小: ${data.length} 字节`);

    // 检查数据是否为空
    if (data.length === 0) {
      console.log('收到空数据');
      return;
    }

    try {
      // 创建一个新的 Buffer 来复制数据
      const dataBuffer = Buffer.from(data);

      // 将二进制数据转换为 Float32Array
      const floatArray = new Float32Array(dataBuffer.buffer, dataBuffer.byteOffset, data.length / 4);
      const pcmData = new Int16Array(floatArray.length);

      for (let i = 0; i < floatArray.length; i++) {
        // 将 float 转换为 16 位整数
        pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(floatArray[i] * 32767)));
      }

      const outputBuffer = Buffer.from(pcmData.buffer, pcmData.byteOffset, pcmData.length * 2);
      console.log(`PCM 数据大小: ${outputBuffer.length} 字节`);

      // 如果有回调函数，调用它来传递音频数据
      if (this.onData) {
        this.onData(outputBuffer);
      }
    } catch (error) {
      console.error('数据处理错误:', error);
      console.error('原始数据信息:', {
        length: data.length,
        type: data.constructor.name,
        isBuffer: Buffer.isBuffer(data)
      });
    }
  }

  // 内部方法：断开 WebSocket 连接
  _disconnect() {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        const cleanup = () => {
          this.ws = null;
          this.isConnected = false;
          resolve();
        };

        // 设置超时确保一定会退出
        const timeoutId = setTimeout(() => {
          console.log('WebSocket 关闭超时，强制清理');
          cleanup();
        }, 3000);

        this.ws.on('close', () => {
          clearTimeout(timeoutId);
          cleanup();
        });

        if (this.isConnected) {
          try {
            this.ws.close();
          } catch (error) {
            clearTimeout(timeoutId);
            cleanup();
            reject(error);
          }
        } else {
          clearTimeout(timeoutId);
          cleanup();
        }
      } else {
        resolve();
      }
    });
  }
}

export default MemoRecorderClient;
