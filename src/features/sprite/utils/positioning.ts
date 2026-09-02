/**
 * 主窗口定位辅助
 *
 * 基于发送窗口所在屏幕的 workArea（含原点 x/y）计算位置，
 * 兼容 macOS 菜单栏 / Dock 偏移与多屏场景。
 */

/** 右下角对齐的边距（与既有惯例一致：右 20、下 40） */
const RIGHT_MARGIN = 20;
const BOTTOM_MARGIN = 40;

/** 将主窗口对齐到其所在屏幕 workArea 的右下角 */
export async function alignMainWindowToBottomRight(windowWidth: number, windowHeight: number): Promise<void> {
  const workArea = await window.chobits.window['screen:work-area:get']();
  const winX = Math.max(workArea.x, workArea.x + workArea.width - windowWidth - RIGHT_MARGIN);
  const winY = Math.max(workArea.y, workArea.y + workArea.height - windowHeight - BOTTOM_MARGIN);
  await window.chobits.window['window:move']({ x: winX, y: winY });
}
