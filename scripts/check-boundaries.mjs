#!/usr/bin/env node
/**
 * 分层边界守护：
 * 1. packages/** 禁止 import 本地 electron/ 源码树（允许 import 'electron' npm 包本身）
 * 2. electron/main 禁止 import src/（渲染进程源码）
 *
 * 现有违规记录在 scripts/boundary-baseline.txt（每行一条 "file<TAB>import"）。
 * 出现基线之外的新违规 → 退出码 1；基线中的条目被修复 → 提示从基线移除。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts', 'boundary-baseline.txt');

const baseline = new Set(
  readFileSync(baselinePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
);

// 用 ripgrep 找出所有指向 electron/ 本地源码或 src/ 的 import（execFile 传参，不经 shell）
function grepImports(cwd, pattern) {
  try {
    const out = execFileSync('rg', ['-n', '--no-heading', '-g', '*.ts', '-g', '*.tsx', pattern, cwd], { cwd: root, encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return []; // rg 无匹配时退出码 1
  }
}

function collect(cwd, pattern, sink) {
  for (const line of grepImports(cwd, pattern)) {
    const sep = line.indexOf(':');
    const file = line.slice(0, sep);
    const m = line.slice(sep + 1).match(/from\s+['"]([^'"]+)['"]/);
    // 行首还有行号，file 里带了 "path:line"，只取路径部分
    const filePath = file.includes(':') ? file.slice(0, file.lastIndexOf(':')) : file;
    sink.add(`${filePath}\t${m?.[1] ?? ''}`);
  }
}

const current = new Set();

// packages/** → electron/ 本地路径（相对路径 ../electron/... 或别名 electron/main...）
collect('packages', String.raw`from\s+['"](\.{1,2}/)+[^'"]*electron/`, current);
collect('packages', String.raw`from\s+['"]electron/(main|preload)/`, current);

// electron/main → src/
collect('electron', String.raw`from\s+['"](\.{1,2}/)+[^'"]*src/`, current);

// 包级单向依赖硬规则（无基线，违规直接失败）：
// - packages/event/ 禁止 import sprite-core（消息基元已迁至 packages/event/messages.ts）
// - packages/sherpa/ 禁止 import sprite-core（能力守卫经 capability-guard.ts 依赖注入）
const packageViolations = new Set();
for (const pkg of ['packages/event', 'packages/sherpa']) {
  collect(pkg, String.raw`from\s+['"](\.{1,2}/)+[^'"]*sprite-core/`, packageViolations);
  collect(pkg, String.raw`from\s+['"]@packages/sprite-core/`, packageViolations);
}
const newViolations = [...current].filter((v) => !baseline.has(v));
const fixedEntries = [...baseline].filter((b) => !current.has(b));

if (fixedEntries.length > 0) {
  console.log('✅ 以下基线违规已修复，请从 scripts/boundary-baseline.txt 移除对应行：');
  for (const f of fixedEntries) console.log(`   ${f}`);
}

if (newViolations.length > 0) {
  console.error('❌ 发现新的跨层依赖违规（packages→electron 或 electron/main→src）：');
  for (const v of newViolations) console.error(`   ${v}`);
  process.exit(1);
}

if (packageViolations.size > 0) {
  console.error('❌ 发现包级循环依赖违规（packages/event 与 packages/sherpa 禁止 import sprite-core）：');
  for (const v of packageViolations) console.error(`   ${v}`);
  process.exit(1);
}

console.log(`边界检查通过（${baseline.size - fixedEntries.length} 条历史违规待清理，无新增；包级单向规则通过）。`);
