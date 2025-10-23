import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { writeFileSync, readFileSync } from "@aim-packages/file-utils"
import faultWindowConfigs from './windows-defaults';
import { WindowConfig, WindowKey } from './types';

export type WindowConfigMap = Record<WindowKey, WindowConfig>
// 运行时可变的窗口配置注册表
export let windowConfigs: WindowConfigMap = {}

// 用户覆盖配置存放路径（%appData%/AppName/windows.json）
function getUserJsonPath() {
  try {
    return path.join(app.getPath('userData'), 'windows.json')
  } catch {
    // 当 app 还未 ready 时，兜底使用 appPath 目录
    const appRoot = process.env.APP_ROOT || process.cwd()
    return path.join(appRoot, 'windows.user.json')
  }
}

function isPlainObject(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge<T extends Record<string, any>>(base: T, extra: Partial<T>): T {
  const out: any = { ...base }
  for (const k of Object.keys(extra || {})) {
    const bv = (base as any)[k]
    const ev = (extra as any)[k]
    if (isPlainObject(bv) && isPlainObject(ev)) out[k] = deepMerge(bv, ev)
    else out[k] = ev
  }
  return out
}

function applyPlatformOverlay(conf: WindowConfig): WindowConfig {
  const overlay = conf.platformOverlays?.[process.platform]
  if (!overlay) return conf
  // 仅深合并到 options/根字段，不递归到 routeHash 的函数等特殊类型
  const merged: WindowConfig = { ...conf }
  delete (merged as any).platformOverlays
  return deepMerge(merged as any, overlay as any)
}

function readJsonSafe(file: string): any | null {
  try {
    if (!fs.existsSync(file)) return null
    const txt = readFileSync(file, 'utf8')
    return JSON.parse(txt)
  } catch {
    return null
  }
}

function writeJsonSafe(file: string, data: any) {
  try {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  } catch { }
}

/**
 * 初始化窗口配置：读取默认 JSON 和用户 JSON，合并并应用平台覆盖。
 */
export function initWindowConfigs() {
  const userRaw = readJsonSafe(getUserJsonPath()) || {}

  const merged: Record<string, WindowConfig> = {}
  const keys = new Set<WindowKey>([...Object.keys(faultWindowConfigs), ...Object.keys(userRaw)])
  keys.forEach(key => {
    const defConf = faultWindowConfigs[key]
    const usrConf = userRaw[key]
    // 不允许用户覆盖默认窗口配置：如果默认存在且用户也提供了同名配置，直接忽略用户版本
    let conf: WindowConfig | null
    if (defConf && usrConf) {
      // 可在此记录日志，帮助排查
      try { console.warn(`[windows] user config attempts to override default key '${String(key)}' – ignored.`) } catch {}
      conf = defConf
    } else if (defConf) {
      conf = defConf
    } else {
      conf = usrConf || null
    }
    if (conf) conf = applyPlatformOverlay(conf)
    if (conf) merged[key] = conf
  })
  windowConfigs = merged
}

/** 列出当前已注册窗口 key */
export function listWindowKeys(): WindowKey[] {
  return Object.keys(windowConfigs)
}

/** 获取指定配置（只读快照） */
export function getWindowConfig(key: WindowKey): WindowConfig | undefined {
  const conf = windowConfigs[key]
  return conf ? { ...conf, options: { ...(conf.options || {}) } } : undefined
}

/**
 * 注册或覆盖窗口配置（可选持久化到用户 JSON）
 */
export function registerWindowConfig(key: WindowKey, config: WindowConfig, persist = false) {
  // 禁止注册与默认窗口同名的 key
  if (faultWindowConfigs[key]) {
    throw new Error(`Key '${String(key)}' is a default window and cannot be overridden.`)
  }
  // 禁止重复注册（无论是已加载的默认还是用户键）
  if (windowConfigs[key]) {
    throw new Error(`Key '${String(key)}' already exists. Duplicate registration is not allowed.`)
  }
  // 在内存中新增
  windowConfigs[key] = applyPlatformOverlay(config)
  if (persist) {
    const userPath = getUserJsonPath()
    const current = readJsonSafe(userPath) || {}
    current[key] = config
    writeJsonSafe(userPath, current)
  }
}

/**
 * 取消注册窗口配置（可选从用户 JSON 中移除）
 */
export function unregisterWindowConfig(key: WindowKey, persist = false) {
  delete windowConfigs[key]
  if (persist) {
    const userPath = getUserJsonPath()
    const current = readJsonSafe(userPath) || {}
    if (current && current[key]) {
      delete current[key]
      writeJsonSafe(userPath, current)
    }
  }
}
