declare global {
  interface Window {
    YUA: {
      window: {
        moveWindow: (x: number, y: number) => Promise<void>
        getWindowPosition: () => Promise<[number, number]>
        getScreenSize: () => Promise<{ width: number; height: number }>
      }
    }
  }
}

export { }
