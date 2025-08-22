declare global {
  interface Window {
    YUA: {
      window: {
        moveWindow: (x: number, y: number) => Promise<boolean>
        getWindowPosition: () => Promise<[number, number]>
        getScreenSize: () => Promise<{ width: number; height: number }>
        setClickThrough: (enable: boolean) => Promise<boolean>
        openFileListWindow: (files: Array<{ name: string; path: string; isDirectory: boolean }>) => Promise<boolean>
      }
    }
  }
}

export { }
