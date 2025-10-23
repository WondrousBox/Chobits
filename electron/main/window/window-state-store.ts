/**
 * 窗口状态持久化存储（Electron 主进程侧）
 *
 * 作用：
 * - 为不同的窗口（通过 WindowKey 区分）保存位置、尺寸以及最大化/最小化状态
 * - 应用下次启动或窗口重建时，可按键值恢复对应窗口的状态
 * - 自动校验保存的坐标是否仍然位于当前显示器可视范围内（兼容多显示器/拔插显示器场景）
 *
 * 注意：
 * - 仅记录 getBounds() 的 x/y/width/height 以及 isMaximized/isMinimized 标志
 * - 恢复时若状态越界（例如外接显示器断开导致坐标无效），将跳过恢复以避免看不见的窗口
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { writeFileSync, readFileSync } from "@aim-packages/file-utils"
import { WindowKey } from './types'

export interface WindowState {
  /** 左上角 X 坐标（相对于虚拟桌面） */
  x: number
  /** 左上角 Y 坐标（相对于虚拟桌面） */
  y: number
  /** 窗口宽度 */
  width: number
  /** 窗口高度 */
  height: number
  /** 是否为最大化状态 */
  isMaximized: boolean
  /** 是否为最小化状态 */
  isMinimized: boolean
}

/**
 * 以 WindowKey 为键的窗口状态映射。
 * 使用 Partial 以便可以按需存储部分键。
 */
type WindowStateMap = Partial<Record<WindowKey, WindowState | undefined>>

let WINDOW_STATE_FILE_NAME = 'window-states.json'

// %appData%/AppName/data/
let STORE_DIR: string = path.join(app.getPath('userData'), 'data')
const WINDOW_STATE_FILE = path.join(STORE_DIR, WINDOW_STATE_FILE_NAME)

/**
 * 确保存储目录和文件存在（若不存在则创建空对象文件）。
 */
function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
  if (!fs.existsSync(WINDOW_STATE_FILE)) {
    writeFileSync(WINDOW_STATE_FILE, JSON.stringify({} as WindowStateMap, null, 2))
  }
}

/**
 * 读取所有窗口状态。
 * 出错时返回空对象，避免影响主流程。
 */
function readWindowStates(): WindowStateMap {
  ensureStore()
  try {
    const raw = readFileSync(WINDOW_STATE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return data || {}
  } catch {
    return {}
  }
}

/**
 * 写入所有窗口状态到磁盘。
 */
function writeWindowStates(states: WindowStateMap) {
  ensureStore()
  try {
    writeFileSync(WINDOW_STATE_FILE, JSON.stringify(states, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save window states:', error)
  }
}

/**
 * 简单的 KV 存取接口，用于按 WindowKey 读写/清理窗口状态。
 */
export const WindowStateStore = {
  /** 根据窗口键获取保存的状态 */
  getState(key: WindowKey): WindowState | undefined {
    const states = readWindowStates()
    return states[key]
  },

  /** 设置（或覆盖）指定窗口键的状态 */
  setState(key: WindowKey, state: WindowState) {
    const states = readWindowStates()
    states[key] = state
    writeWindowStates(states)
  },

  /** 删除指定窗口键的状态 */
  removeState(key: WindowKey) {
    const states = readWindowStates()
    delete states[key]
    writeWindowStates(states)
  },

  /** 清空全部状态 */
  clearAll() {
    writeWindowStates({})
  }
}

/**
 * 保存指定 BrowserWindow 的当前状态。
 * - 会读取窗口的边界信息和最大化/最小化标志并持久化。
 */
export function saveWindowState(window: BrowserWindow, key: WindowKey) {
  if (window.isDestroyed()) return

  try {
    const bounds = window.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: window.isMaximized(),
      isMinimized: window.isMinimized()
    }
    WindowStateStore.setState(key, state)
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

/**
 * 尝试按键恢复窗口状态。
 * 返回：
 * - true  成功应用了某种状态（最大化/最小化/坐标尺寸）
 * - false 无可用状态或状态无效/越界
 */
export function restoreWindowState(window: BrowserWindow, key: WindowKey): boolean {
  if (window.isDestroyed()) return false

  const state = WindowStateStore.getState(key)
  if (!state) return false

  try {
    // 检查状态是否在屏幕范围内（考虑多显示器；避免把窗口恢复到不可见区域）
    const displays = screen.getAllDisplays()
    const isStateValid = displays.some((display: any) => {
      const { x, y, width, height } = display.bounds
      return state.x >= x && state.y >= y &&
        state.x + state.width <= x + width &&
        state.y + state.height <= y + height
    })

    if (!isStateValid) {
      console.log('Window state is outside screen bounds, skipping restore')
      return false
    }

    // 恢复窗口状态
    // 优先级：最大化 > 最小化 > 普通位置尺寸
    // 备注：最小化通常用于运行时；若你不希望开场即最小化，可在业务层忽略该分支。
    if (state.isMaximized) {
      window.maximize()
    } else if (state.isMinimized) {
      window.minimize()
    } else {
      window.setBounds({
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height
      })
    }

    return true
  } catch (error) {
    console.error('Failed to restore window state:', error)
    return false
  }
}

export function setStoreDir(folderPath: string) {
  STORE_DIR = folderPath
}

export function setFileName(name: string) {
  WINDOW_STATE_FILE_NAME = name
}