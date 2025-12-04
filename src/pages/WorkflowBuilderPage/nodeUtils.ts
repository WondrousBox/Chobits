import React from 'react';
import { TbEdit, TbFolderOpen, TbLetterT, TbPhoto, TbPlayerPlay, TbRobot, TbScan, TbSquare } from 'react-icons/tb';

/**
 * 图标映射表
 * 只导入实际使用的图标，避免全量导入 react-icons/tb 导致打包体积增大
 *
 * 如需添加新图标：
 * 1. 在 import 语句中添加图标导入（如：TbNewIcon）
 * 2. 在 iconMap 中添加映射（如：TbNewIcon）
 *
 * 可用的图标列表请参考：https://react-icons.github.io/react-icons/icons/tb/
 */
export const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  TbEdit,
  TbFolderOpen,
  TbPhoto,
  TbPlayerPlay,
  TbRobot,
  TbScan,
  TbSquare,
  TbText: TbLetterT
};

/**
 * 根据图标名称获取图标组件
 */
export function getIconComponent(iconName?: string): React.ComponentType<{ className?: string }> | null {
  if (!iconName) return null;
  return iconMap[iconName] || null;
}

/**
 * 解析颜色值，返回 RGB 值
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  const bg = color.toLowerCase().trim();

  if (bg.startsWith('#')) {
    const hex = bg.replace('#', '');
    // 处理 3 位 hex 颜色
    const fullHex =
      hex.length === 3
        ? hex
          .split('')
          .map((c) => c + c)
          .join('')
        : hex;
    if (fullHex.length === 6) {
      const r = parseInt(fullHex.substring(0, 2), 16);
      const g = parseInt(fullHex.substring(2, 4), 16);
      const b = parseInt(fullHex.substring(4, 6), 16);
      return { r, g, b };
    }
  } else if (bg.startsWith('rgb')) {
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      return { r, g, b };
    }
  }

  return null;
}

/**
 * 计算颜色的相对亮度
 * @param r 红色值 (0-255)
 * @param g 绿色值 (0-255)
 * @param b 蓝色值 (0-255)
 * @returns 亮度值 (0-255)
 */
function calculateBrightness(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * 根据背景颜色计算文字颜色类名
 * @param backgroundColor 背景颜色值
 * @returns Tailwind CSS 类名
 */
export function getTextColorClass(backgroundColor?: string): string {
  if (!backgroundColor) return 'text-foreground';

  const rgb = parseColor(backgroundColor);
  if (!rgb) return 'text-white';

  const brightness = calculateBrightness(rgb.r, rgb.g, rgb.b);
  return brightness < 128 ? 'text-white' : 'text-gray-900';
}

/**
 * 计算渐变背景样式（从上到下渐变到透明）
 * @param backgroundColor 背景颜色值
 * @param topOpacity 顶部透明度 (0-1)，默认 0.1
 * @returns CSS 样式对象
 */
export function getGradientBackgroundStyle(backgroundColor?: string, topOpacity: number = 0.1): React.CSSProperties {
  if (!backgroundColor) return {};

  const rgb = parseColor(backgroundColor);
  if (!rgb) {
    // 如果无法解析，使用原值并添加透明度
    return {
      backgroundImage: `linear-gradient(to bottom, ${backgroundColor}, ${backgroundColor}00)`
    };
  }

  const colorValue = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${topOpacity})`;
  const transparentColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`;

  return {
    backgroundImage: `linear-gradient(to bottom, ${colorValue}, ${transparentColor})`
  };
}
