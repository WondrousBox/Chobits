#!/usr/bin/env node
/**
 * gen-live2d-index.mjs
 *
 * 根据 live2d.json 的 triggers 配置，生成/合并 index.json 中的 live2d 动画项。
 * 每个 trigger 生成一个 source.type = 'live2d' 的条目，使 sprite-core 的
 * 条件/优先级/autoIdle/movement 逻辑无需改动即可工作。
 *
 * 用法：
 *   node scripts/gen-live2d-index.mjs <modelDir> [--dry-run]
 *
 * 示例：
 *   node scripts/gen-live2d-index.mjs resources/characters/live2d/mao_pro
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const modelDirArg = args.find((a) => !a.startsWith('--'));

if (!modelDirArg) {
  console.error('Usage: node scripts/gen-live2d-index.mjs <modelDir> [--dry-run]');
  process.exit(1);
}

const modelDir = path.resolve(process.cwd(), modelDirArg);
const configPath = path.join(modelDir, 'live2d.json');
const indexPath = path.join(modelDir, 'index.json');

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error(`[gen-live2d-index] failed to read ${configPath}:`, e.message);
  process.exit(1);
}

const triggers = config.triggers ?? {};
const canvas = config.canvas ?? { width: 300, height: 400, padding: 40 };

let index = { version: 1, items: [] };
try {
  index = JSON.parse(readFileSync(indexPath, 'utf8'));
} catch {
  // index.json 不存在时创建新文件
}
// 已有 index.json 可能缺 items 字段，归一化后再使用
index.items ??= [];

const existingIds = new Set(index.items.map((item) => item.meta?.id));
let added = 0;
let updated = 0;

for (const [trigger, mapping] of Object.entries(triggers)) {
  const id = `live2d-${trigger}`;
  const loop = mapping.loop === true;
  const item = {
    meta: {
      id,
      title: `Live2D ${trigger}`,
      primaryTrigger: trigger,
      deletable: false
    },
    source: {
      type: 'live2d',
      localPath: path.basename(modelDir)
    },
    width: canvas.width,
    height: canvas.height,
    padding: canvas.padding,
    autoplay: true,
    muted: true,
    playsInline: true,
    loop,
    autoIdle: !loop
  };

  if (existingIds.has(id)) {
    const idx = index.items.findIndex((i) => i.meta?.id === id);
    if (idx >= 0) {
      index.items[idx] = item;
      updated += 1;
    }
  } else {
    index.items.push(item);
    added += 1;
  }
}

const output = JSON.stringify(index, null, 2) + '\n';

if (dryRun) {
  console.log(output);
  console.log(`[gen-live2d-index] dry-run: would add ${added}, update ${updated} items in ${indexPath}`);
} else {
  writeFileSync(indexPath, output, 'utf8');
  console.log(`[gen-live2d-index] wrote ${indexPath}: added ${added}, updated ${updated}`);
}
