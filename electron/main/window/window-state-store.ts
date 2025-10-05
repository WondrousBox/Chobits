import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import type { WindowKey } from './window-config'

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
  isMinimized: boolean
}

type WindowStateMap = Partial<Record<WindowKey, WindowState | undefined>>

const STORE_DIR = path.join(os.homedir(), '.chobits')
const WINDOW_STATE_FILE = path.join(STORE_DIR, 'window-states.json')

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
  if (!fs.existsSync(WINDOW_STATE_FILE)) {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify({} as WindowStateMap, null, 2))
  }
}

function readWindowStates(): WindowStateMap {
  ensureStore()
  try {
    const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return data || {}
  } catch {
    return {}
  }
}

function writeWindowStates(states: WindowStateMap) {
  ensureStore()
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(states, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save window states:', error)
  }
}

export const WindowStateStore = {
  getState(key: WindowKey): WindowState | undefined {
    const states = readWindowStates()
    return states[key]
  },

  setState(key: WindowKey, state: WindowState) {
    const states = readWindowStates()
    states[key] = state
    writeWindowStates(states)
  },

  removeState(key: WindowKey) {
    const states = readWindowStates()
    delete states[key]
    writeWindowStates(states)
  },

  clearAll() {
    writeWindowStates({})
  }
}

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

export function restoreWindowState(window: BrowserWindow, key: WindowKey): boolean {
  if (window.isDestroyed()) return false

  const state = WindowStateStore.getState(key)
  if (!state) return false

  try {
    // 检查状态是否在屏幕范围内
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