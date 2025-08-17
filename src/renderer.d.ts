declare global {
  interface Window {
    YUA: {
      window: {
        moveWindow: (x: number, y: number) => Promise<boolean>
        getWindowPosition: () => Promise<[number, number]>
        getScreenSize: () => Promise<{ width: number; height: number }>
        setClickThrough: (enable: boolean) => Promise<boolean>
      }
    }
  }
}

export { }
