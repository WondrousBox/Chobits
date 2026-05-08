import React from 'react';
import { TbEdit, TbFile, TbFileDownload, TbFilePencil, TbFilePlus, TbFolderOpen, TbLetterT, TbMusic, TbPhoto, TbPlayerPlay, TbRobot, TbScan, TbSquare } from 'react-icons/tb';
import { VscJson } from 'react-icons/vsc';

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
export const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  TbEdit,
  TbFolderOpen,
  TbMusic,
  TbPhoto,
  TbPlayerPlay,
  TbRobot,
  TbScan,
  TbSquare,
  TbFile,
  TbFilePlus,
  TbFilePencil,
  TbFileDownload,
  TbJson: VscJson,
  TbText: TbLetterT
};

/**
 * 根据图标名称获取图标组件
 */
export function getIconComponent(iconName?: string): React.ComponentType<{ className?: string; style?: React.CSSProperties }> | null {
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
