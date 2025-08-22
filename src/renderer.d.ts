declare global {
  interface Window {
    YUA: {
      window: {
        moveWindow: (x: number, y: number) => Promise<boolean>
        getWindowPosition: () => Promise<[number, number]>
        getScreenSize: () => Promise<{ width: number; height: number }>
        setClickThrough: (enable: boolean) => Promise<boolean>
        openFileListWindow: (files: Array<{ name: string; path: string; isDirectory: boolean }>) => Promise<boolean>
        openMenuWindow: () => Promise<boolean>
        openSettingsWindow: () => Promise<boolean>
        getMovementConfig: () => Promise<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>
        updateMovementConfig: (p: Partial<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>) => Promise<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>
      }
    }
    ipcRenderer: any
  }
}

export { }
