/**
 * 批量TTS合成服务测试脚本
 *
 * 运行方式：
 * npx esno packages/tts/batch-tts-service.test.ts
 */

import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { type BatchTTSEvent, BatchTTSService, configureFfmpegPath } from './batch-tts-service';

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置ffmpeg路径（根据实际情况修改）
// MacOS Intel: resources/ffmpeg/darwin/x64/ffmpeg
// MacOS ARM: resources/ffmpeg/darwin/arm64/ffmpeg
const platform = process.platform;
const arch = process.arch;
const ffmpegPath = path.join(__dirname, '../../resources/ffmpeg', platform, arch, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const ffprobePath = path.join(__dirname, '../../resources/ffmpeg', platform, arch, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

console.log('FFmpeg路径:', ffmpegPath);
console.log('FFprobe路径:', ffprobePath);

// 设置ffmpeg路径
configureFfmpegPath(ffmpegPath, ffprobePath);

// 测试用例
async function runTest(): Promise<void> {
  console.log('\n========== 批量TTS合成服务测试 ==========\n');

  // 准备测试数据
  const testItems = [
    { text: '你好，世界！', index: 0 },
    { text: '这是一个测试文本。', index: 1 },
    { text: '批量TTS合成服务正在工作中。', index: 2 },
    { text: 'Hello, this is an English test.', index: 3 },
    { text: '最后一条测试消息。', index: 4 }
  ];

  // 输出目录
  const outputDir = path.join(os.tmpdir(), 'batch-tts-test', Date.now().toString());
  console.log('输出目录:', outputDir);

  // TTS配置
  const config = {
    type: 'Edge' as const,
    voiceName: 'zh-CN-XiaoxiaoNeural',
    rate: 20,
    pitch: 0,
    text: '' // 占位，会被覆盖
  };

  // 事件处理
  const handleEvent = (event: BatchTTSEvent): void => {
    switch (event.type) {
      case 'progress':
        console.log(`[进度] ${event.data.percentage}% - ${event.data.message}`);
        break;
      case 'complete':
        console.log('\n[完成] 合成结果:');
        console.log(`  - 成功: ${event.data.successCount}`);
        console.log(`  - 失败: ${event.data.failedCount}`);
        console.log(`  - 缓存命中: ${event.data.cacheHitCount}`);
        console.log(`  - 总耗时: ${event.data.totalTime}ms`);
        break;
      case 'error':
        console.error('[错误]', event.data.message);
        break;
      case 'done':
        console.log('\n[完成] 流程结束');
        break;
    }
  };

  try {
    // 第一次合成
    console.log('\n---------- 第一次合成 ----------\n');
    const result1 = await BatchTTSService.synthesizeBatch(
      {
        requestId: 'test-' + Date.now(),
        items: testItems,
        config,
        outputDir,
        maxConcurrency: 3,
        maxRetries: 2,
        skipTrimSilence: false
      },
      handleEvent
    );

    // 打印详细结果
    console.log('\n详细结果:');
    for (const item of result1.results) {
      console.log(`  [${item.index}] ${item.success ? '✓' : '✗'} ${item.text.substring(0, 20)}...`);
      console.log(`      MD5: ${item.md5}`);
      console.log(`      原始时长: ${item.duration}ms`);
      console.log(`      裁剪后时长: ${item.trimmedDuration}ms`);
      console.log(`      缓存: ${item.fromCache ? '是' : '否'}`);
      if (item.error) {
        console.log(`      错误: ${item.error}`);
      }
    }

    // 第二次合成（测试缓存）
    console.log('\n---------- 第二次合成（测试缓存） ----------\n');
    const result2 = await BatchTTSService.synthesizeBatch(
      {
        requestId: 'test-cache-' + Date.now(),
        items: testItems,
        config,
        outputDir,
        maxConcurrency: 3,
        maxRetries: 2,
        skipTrimSilence: false
      },
      handleEvent
    );

    console.log(`\n第二次缓存命中率: ${result2.cacheHitCount}/${result2.results.length}`);

    // 打印历史记录
    console.log('\n历史记录:');
    console.log('  配置前缀:', result2.history.configPrefix);
    console.log('  音频数量:', Object.keys(result2.history.audioMap).length);
    console.log('  顺序列表:', result2.history.orderList.length, '项');
  } catch (error) {
    console.error('\n测试失败:', error);
  }
}

// 运行测试
runTest()
  .then(() => {
    console.log('\n测试完成！');
    process.exit(0);
  })
  .catch((err) => {
    console.error('测试异常:', err);
    process.exit(1);
  });
