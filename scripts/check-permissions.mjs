#!/usr/bin/env node

/**
 * macOS 应用权限检查工具
 * 用于检查应用是否有必要的权限配置（麦克风等）
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 读取 package.json 获取应用信息
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
const APP_BUNDLE_ID = 'com.chobits.ai';
const APP_NAME = pkg.name || 'Chobits';

console.log('========================================');
console.log('macOS 权限检查工具');
console.log('========================================');
console.log(`应用名称: ${APP_NAME}`);
console.log(`Bundle ID: ${APP_BUNDLE_ID}`);
console.log('');

// 检查应用是否已安装
function findApp() {
  try {
    const result = execSync(`mdfind "kMDItemCFBundleIdentifier == '${APP_BUNDLE_ID}'"`, { encoding: 'utf-8' }).trim();

    if (result) {
      const paths = result.split('\n').filter((p) => p);
      return paths[0]; // 返回第一个找到的路径
    }
  } catch {
    // mdfind 可能失败，尝试其他方法
  }

  // 尝试在常见位置查找
  const commonPaths = [`/Applications/${APP_NAME}.app`, `/Applications/${APP_NAME}*.app`, `~/Applications/${APP_NAME}.app`];

  for (const path of commonPaths) {
    try {
      const expanded = path.replace('~', process.env.HOME);
      const result = execSync(`ls -d ${expanded} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (result) return result;
    } catch {
      // 继续尝试
    }
  }

  return null;
}

const appPath = findApp();

if (!appPath) {
  console.log('❌ 未找到已安装的应用');
  console.log('');
  console.log('提示：');
  console.log('1. 如果应用已打包但未安装，请先安装应用');
  console.log('2. 如果应用在开发环境，权限检查可能不准确');
  console.log('');
  console.log('========================================');
  console.log('权限配置检查');
  console.log('========================================');
} else {
  console.log(`✅ 找到应用: ${appPath}`);
  console.log('');

  // 检查代码签名
  console.log('========================================');
  console.log('代码签名检查');
  console.log('========================================');
  try {
    const codesign = execSync(`codesign -dv --verbose=4 "${appPath}" 2>&1`, { encoding: 'utf-8' });
    if (codesign.includes('not signed')) {
      console.log('⚠️  应用未签名');
      console.log('   未签名的应用可能无法正确请求权限');
    } else {
      console.log('✅ 应用已签名');
      console.log(codesign.split('\n').slice(0, 5).join('\n'));
    }
  } catch {
    console.log('⚠️  无法检查代码签名');
  }
  console.log('');

  // 检查 entitlements
  console.log('========================================');
  console.log('Entitlements 检查');
  console.log('========================================');
  try {
    // 检查主可执行文件的 entitlements
    const mainExecutable = `${appPath}/Contents/MacOS/Chobits`;
    let entitlements = '';

    try {
      entitlements = execSync(`codesign -d --entitlements - "${mainExecutable}" 2>&1`, { encoding: 'utf-8' });
    } catch {
      // 如果主可执行文件检查失败，尝试检查整个应用
      entitlements = execSync(`codesign -d --entitlements - "${appPath}" 2>&1`, { encoding: 'utf-8' });
    }

    if (entitlements.includes('com.apple.security.device.audio-input') || entitlements.includes('audio-input')) {
      console.log('✅ 已配置音频输入权限 (com.apple.security.device.audio-input)');
    } else {
      console.log('⚠️  未找到音频输入权限配置');
      console.log('   这可能是正常的，因为某些权限不需要在 entitlements 中声明');
    }

    if (entitlements.includes('com.apple.security.device.camera') || entitlements.includes('camera')) {
      console.log('✅ 已配置摄像头权限 (com.apple.security.device.camera)');
    }

    if (entitlements.includes('app-sandbox')) {
      const sandboxValue = entitlements.match(/<key>com\.apple\.security\.app-sandbox<\/key>\s*<(true|false)\/>/);
      if (sandboxValue && sandboxValue[1] === 'false') {
        console.log('✅ 应用沙盒已禁用 (允许更多权限)');
      } else {
        console.log('⚠️  应用沙盒已启用 (可能限制权限)');
      }
    } else {
      console.log('ℹ️  未找到沙盒配置（可能使用默认设置）');
    }
  } catch (e) {
    console.log('⚠️  无法检查 entitlements');
    console.log('   错误:', e.message);
  }
  console.log('');
}

// 检查配置文件
console.log('========================================');
console.log('配置文件检查');
console.log('========================================');

// 检查 entitlements.plist
try {
  const entitlementsPath = join(projectRoot, 'public/entitlements.plist');
  const entitlements = readFileSync(entitlementsPath, 'utf-8');

  if (entitlements.includes('com.apple.security.device.audio-input')) {
    console.log('✅ public/entitlements.plist 包含音频输入权限');
  } else {
    console.log('❌ public/entitlements.plist 缺少音频输入权限');
  }

  if (entitlements.includes('com.apple.security.app-sandbox')) {
    const sandboxMatch = entitlements.match(/<key>com\.apple\.security\.app-sandbox<\/key>\s*<(true|false)\/>/);
    if (sandboxMatch && sandboxMatch[1] === 'false') {
      console.log('✅ 应用沙盒已禁用');
    }
  }
} catch {
  console.log('❌ 无法读取 public/entitlements.plist');
}

// 检查 electron-builder.json
try {
  const builderConfig = JSON.parse(readFileSync(join(projectRoot, 'electron-builder.json'), 'utf-8'));
  const extendInfo = builderConfig.mac?.extendInfo || {};

  if (extendInfo.NSMicrophoneUsageDescription) {
    console.log('✅ electron-builder.json 包含麦克风使用说明');
  } else {
    console.log('⚠️  electron-builder.json 缺少麦克风使用说明');
  }
} catch {
  console.log('❌ 无法读取 electron-builder.json');
}

console.log('');

// 权限状态检查（需要用户交互）
console.log('========================================');
console.log('系统权限状态');
console.log('========================================');
console.log('');
console.log('要检查系统权限状态，请：');
console.log('');
console.log('1. 打开「系统设置」>「隐私与安全性」');
console.log('');
console.log('2. 检查以下权限：');
console.log('   🎤 麦克风 - 语音录制与识别必需');
console.log('');
console.log('3. 如果应用未出现在列表中：');
console.log('   - 点击列表下方的「+」按钮');
console.log('   - 导航到应用并添加');
console.log('   - 开启开关');
console.log('');
console.log('4. 授予权限后，必须重启应用才能生效');
console.log('');

// 提供快速打开系统设置的命令
console.log('========================================');
console.log('快速打开系统设置');
console.log('========================================');
console.log('');
console.log('运行以下命令打开相应的设置页面：');
console.log('');
console.log('打开麦克风设置：');
console.log("  open 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'");
console.log('');

// 检查 TCC 数据库（需要管理员权限）
console.log('========================================');
console.log('权限诊断提示');
console.log('========================================');
console.log('');
console.log('如果麦克风权限已授予但仍无法录音：');
console.log('');
console.log('1. 检查应用是否已正确安装（不是从 zip 解压直接运行）');
console.log('');
console.log('2. 查看系统日志（需要管理员权限）：');
console.log("   sudo log show --predicate 'subsystem == \"com.apple.TCC\"' --last 1h | grep -i '${APP_BUNDLE_ID}'");
console.log('');
console.log('3. 重置权限（谨慎使用，会清除对应权限）：');
console.log(`   tccutil reset Microphone ${APP_BUNDLE_ID}`);
console.log('');
