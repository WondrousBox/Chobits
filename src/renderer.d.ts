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
        getMovementConfig: () => Promise<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number }>
        updateMovementConfig: (p: Partial<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number }>) => Promise<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number }>
      }
    }
    ipcRenderer: any
  }
}

export { }
