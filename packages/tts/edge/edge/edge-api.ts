import { randomBytes } from "crypto";
import { WebSocket } from "ws";

import { createHash } from 'node:crypto'
export const CHROMIUM_FULL_VERSION = '143.0.3650.96'
export const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WINDOWS_FILE_TIME_EPOCH = 11644473600n

export function generateSecMsGecToken() {
  const ticks = BigInt(Math.floor((Date.now() / 1000) + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n
  const roundedTicks = ticks - (ticks % 3000000000n)

  const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`

  const hash = createHash('sha256')
  hash.update(strToHash, 'ascii')

  return hash.digest('hex').toUpperCase()
}

const FORMAT_CONTENT_TYPE = new Map([
  ["raw-16khz-16bit-mono-pcm", "audio/basic"],
  ["raw-48khz-16bit-mono-pcm", "audio/basic"],
  ["raw-8khz-8bit-mono-mulaw", "audio/basic"],
  ["raw-8khz-8bit-mono-alaw", "audio/basic"],

  ["raw-16khz-16bit-mono-truesilk", "audio/SILK"],
  ["raw-24khz-16bit-mono-truesilk", "audio/SILK"],

  ["riff-16khz-16bit-mono-pcm", "audio/x-wav"],
  ["riff-24khz-16bit-mono-pcm", "audio/x-wav"],
  ["riff-48khz-16bit-mono-pcm", "audio/x-wav"],
  ["riff-8khz-8bit-mono-mulaw", "audio/x-wav"],
  ["riff-8khz-8bit-mono-alaw", "audio/x-wav"],

  ["audio-16khz-32kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-16khz-64kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-16khz-128kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-24khz-48kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-24khz-96kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-24khz-160kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-48khz-96kbitrate-mono-mp3", "audio/mpeg"],
  ["audio-48khz-192kbitrate-mono-mp3", "audio/mpeg"],

  ["webm-16khz-16bit-mono-opus", "audio/webm; codec=opus"],
  ["webm-24khz-16bit-mono-opus", "audio/webm; codec=opus"],

  ["ogg-16khz-16bit-mono-opus", "audio/ogg; codecs=opus; rate=16000"],
  ["ogg-24khz-16bit-mono-opus", "audio/ogg; codecs=opus; rate=24000"],
  ["ogg-48khz-16bit-mono-opus", "audio/ogg; codecs=opus; rate=48000"],
]);

class EdgeTtsService {
  ws: WebSocket | null = null;
  connectionPromise: Promise<WebSocket> | null = null;

  executorMap;
  bufferMap;

  timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.executorMap = new Map();
    this.bufferMap = new Map();
  }

  async connect(proxy: any) {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {

      // const connectionId = randomBytes(16).toString("hex").toLowerCase();
      // const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;
      const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateSecMsGecToken()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;

      console.info("connecting to websocket server...");
      const muid = randomBytes(16).toString("hex").toUpperCase();
      const ws = new WebSocket(url, {
        host: "speech.platform.bing.com",
        origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
          'Cookie': `muid=${muid}`,
        },
        agent: proxy ? proxy : undefined,
      });

      ws.on("open", () => {
        this.ws = ws;
        // console.info("connect success");
        resolve(ws);
      });
      ws.on("close", (code, reason) => {
        this.ws = null;
        this.connectionPromise = null;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        for (const [key, value] of this.executorMap) {
          value.reject(`connection closed: ${reason} ${code}`);
        }
        this.executorMap.clear();
        this.bufferMap.clear();
        console.info(`connection closed: ${reason} ${code}`);
      });

      ws.on("message", (message, isBinary) => {
        const pattern = /X-RequestId:(?<id>[a-z|0-9]*)/;
        if (!isBinary) {
          const data = message.toString();
          if (data.includes("Path:turn.start")) {
            // 开始传输
            const matches = data.match(pattern);
            const requestId = matches?.groups?.id;
            this.bufferMap.set(requestId, Buffer.from([]));
          } else if (data.includes("Path:turn.end")) {
            // 结束传输
            const matches = data.match(pattern);
            const requestId = matches?.groups?.id;

            const executor = this.executorMap.get(requestId);
            if (executor) {
              this.executorMap.delete(matches?.groups?.id);
              const result = this.bufferMap.get(requestId);
              executor.resolve(result);
              // console.info(`transfer complete: ${requestId}……`);
            } else {
              console.info(`请求已被丢弃：${requestId}`);
            }
          }
        } else if (isBinary) {
          const separator = "Path:audio\r\n";
          const data = Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer);
          const contentIndex = data.indexOf(separator) + separator.length;

          const headers = data.slice(2, contentIndex).toString();
          const matches = headers.match(pattern);
          const requestId = matches?.groups?.id;

          const content = data.slice(contentIndex) as Buffer;
          let buffer = this.bufferMap.get(requestId) as Buffer | undefined;
          if (buffer) {
            buffer = Buffer.concat(
              [buffer, content],
              buffer.length + content.length,
            );
            this.bufferMap.set(requestId, buffer);
          } else {
            console.info(`请求已被丢弃：${requestId}`);
          }
        }
      });
      ws.on("error", (error) => {
        this.connectionPromise = null;
        console.error(`连接失败： ${error}`);
        reject(`连接失败： ${error}`);
      });
    });

    return this.connectionPromise;
  }

  async convert(ssml: string, format: string, proxy?: any): Promise<Buffer | null> {
    if (this.ws == null || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(proxy);
    }
    const requestId = randomBytes(16).toString("hex").toLowerCase();
    const result = new Promise((resolve, reject) => {
      // 等待服务器返回后这个方法才会返回结果
      this.executorMap.set(requestId, {
        resolve,
        reject,
      });
      // 发送配置消息
      const configData = {
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: "false",
                wordBoundaryEnabled: "false",
              },
              outputFormat: format,
            },
          },
        },
      };
      const configMessage =
        `X-Timestamp:${Date()}\r\n` +
        "Content-Type:application/json; charset=utf-8\r\n" +
        "Path:speech.config\r\n\r\n" +
        JSON.stringify(configData);
      this.ws?.send(configMessage, (configError) => {
        if (configError) {
          console.error(`配置请求发送失败：${requestId}\n`);
        }

        // 发送SSML消息
        const ssmlMessage =
          `X-Timestamp:${Date()}\r\n` +
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml;
        this.ws?.send(ssmlMessage, (ssmlError) => {
          if (ssmlError) {
            console.error(`SSML消息发送失败：${requestId}\n`);
          }
        });
      });
    });

    // 收到请求，清除超时定时器
    if (this.timer) {
      // console.info("new request, clear timer");
      clearTimeout(this.timer);
    }
    // 设置定时器，超过10秒没有收到请求，主动断开连接
    this.timer = setTimeout(() => {
      if (this.ws && this.ws.readyState == WebSocket.OPEN) {
        this.ws.close(1000);
        this.timer = null;
      }
    }, 10000);

    const data = await Promise.race([
      result,
      new Promise((resolve, reject) => {
        // 如果超过 20 秒没有返回结果，则清除请求并返回超时
        setTimeout(() => {
          this.executorMap.delete(requestId);
          this.bufferMap.delete(requestId);
          reject("转换超时");
        }, 10000);
      }),
    ]);

    return data as Buffer | null;
  }
}

const service = new EdgeTtsService();
const retry = async function (
  fn: () => void,
  times: number,
  errorFn: (index: number, error: any) => void,
  failedMessage: string,
) {
  const reason: { message: string; errors: any[] } = {
    message: failedMessage ?? "多次尝试后失败",
    errors: [],
  };
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (error) {
      if (errorFn) {
        errorFn(i, error);
      }
      reason.errors.push(error);
    }
  }
  throw reason;
};

export const readAloud = async (text: string, proxy?: any): Promise<{ success: true, data: Buffer } | { success: false, message: string, data: null }> => {
  let result = null;
  try {
    const format = "audio-24khz-48kbitrate-mono-mp3";
    if (Array.isArray(format)) {
      throw `无效的音频格式：${format}`;
    }
    if (!FORMAT_CONTENT_TYPE.has(format)) {
      throw `无效的音频格式：${format}`;
    }

    const ssml = text;
    if (ssml == null) {
      throw `转换参数无效`;
    }
    result = await retry(
      async () => {
        return await service.convert(ssml, format, proxy);
      },
      3,
      (index, error) => {
        console.error(`第${index}次转换失败：${error}`);
      },
      "服务器多次尝试后转换失败",
    );
  } catch (error: any) {
    console.error(`发生错误, ${error.message}`);

    return { success: false, message: error.message + error.errors.join('\n'), data: null };
  }

  return { success: true, data: result as unknown as Buffer };
};
