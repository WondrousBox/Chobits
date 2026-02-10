import React, { useCallback } from 'react';
import { TbLetterT, TbPalette } from 'react-icons/tb';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

import type { SubtitleBorderStyle, SubtitleFontName, SubtitleStyleConfig } from './types';

interface SubtitleStyleEditorProps {
  /** 字幕样式配置 */
  style: SubtitleStyleConfig;
  /** 样式变化回调 */
  onChange: (style: SubtitleStyleConfig) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/** 预设颜色选项 */
const COLOR_PRESETS = [
  { name: '白色', value: '&HFFFFFF' },
  { name: '黑色', value: '&H000000' },
  { name: '黄色', value: '&H00FFFF' },
  { name: '青色', value: '&HFFFF00' },
  { name: '红色', value: '&H0000FF' },
  { name: '绿色', value: '&H00FF00' },
  { name: '蓝色', value: '&HFF0000' },
  { name: '灰色', value: '&H808080' }
];

/** 字体选项 */
const FONT_OPTIONS: { label: string; value: SubtitleFontName }[] = [
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '黑体', value: 'SimHei' },
  { label: '宋体', value: 'SimSun' },
  { label: '新宋体', value: 'NSimSun' },
  { label: '楷体', value: 'KaiTi' },
  { label: '仿宋', value: 'FangSong' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Impact', value: 'Impact' }
];

/** 描边样式选项 (ASS BorderStyle) */
const BORDER_STYLE_OPTIONS: { label: string; value: SubtitleBorderStyle }[] = [
  { label: '边框 + 阴影', value: '1' },
  { label: '不透明底框', value: '3' }
];

/** 对齐方式选项 (ASS Alignment numpad 底行) */
const ALIGN_OPTIONS: { label: string; value: '1' | '2' | '3' }[] = [
  { label: '左对齐', value: '1' },
  { label: '居中', value: '2' },
  { label: '右对齐', value: '3' }
];

/**
 * 将 ASS &HBBGGRR 颜色转为 CSS #RRGGBB
 */
function assColorToCssHex(assColor: string): string {
  const hex = assColor.replace('&H', '').replace('&', '');
  if (hex.length === 6) {
    return `#${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
  }
  if (hex.length === 8) {
    return `#${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}`;
  }
  return assColor;
}

/**
 * 将 ASS &HAABBGGRR BackColour 转为 CSS backgroundColor + opacity
 * ASS alpha: 00=不透明, FF=透明
 */
function assBackColorToDisplay(assColor: string): { cssColor: string; opacity: number } {
  const hex = assColor.replace('&H', '').replace('&', '');
  if (hex.length >= 8) {
    const assAlpha = parseInt(hex.slice(0, 2), 16);
    const bb = hex.slice(2, 4);
    const gg = hex.slice(4, 6);
    const rr = hex.slice(6, 8);
    return { cssColor: `#${rr}${gg}${bb}`, opacity: (255 - assAlpha) / 255 };
  }
  return { cssColor: '#000000', opacity: 1 };
}

/**
 * 字幕样式编辑器
 * 提供字体、颜色、位置等样式设置，完全对应 ASS Style 字段
 */
export const SubtitleStyleEditor: React.FC<SubtitleStyleEditorProps> = ({ style, onChange, disabled }) => {
  const updateStyle = useCallback(
    <K extends keyof SubtitleStyleConfig>(key: K, value: SubtitleStyleConfig[K]) => {
      onChange({ ...style, [key]: value });
    },
    [style, onChange]
  );

  return (
    <div className="space-y-4">
      {/* 字体设置 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TbLetterT className="h-4 w-4" />
          <span>字体设置</span>
        </div>

        {/* 字体选择 */}
        <div className="space-y-1">
          <Label className="text-xs">字体</Label>
          <Select value={style.fontName} onValueChange={(v) => updateStyle('fontName', v as SubtitleFontName)} disabled={disabled}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 字体大小 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">字体大小</Label>
            <span className="text-xs text-muted-foreground">{style.fontSize}px</span>
          </div>
          <Slider min={12} max={120} step={2} value={[style.fontSize]} onValueChange={([v]) => updateStyle('fontSize', v)} disabled={disabled} />
        </div>

        {/* 字体样式开关 */}
        <div className="flex gap-2">
          <button
            onClick={() => updateStyle('bold', !style.bold)}
            disabled={disabled}
            className={`flex-1 py-1.5 px-2 text-xs rounded transition-colors ${style.bold ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            style={{ fontFamily: 'Arial, sans-serif', fontWeight: style.bold ? 'bold' : 'normal' }}
          >
            B
          </button>
          <button
            onClick={() => updateStyle('italic', !style.italic)}
            disabled={disabled}
            className={`flex-1 py-1.5 px-2 text-xs rounded transition-colors ${style.italic ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            style={{ fontFamily: 'Arial, sans-serif', fontStyle: style.italic ? 'italic' : 'normal' }}
          >
            I
          </button>
        </div>
      </div>

      <Separator />

      {/* 颜色设置 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <TbPalette className="h-4 w-4" />
          <span>颜色设置</span>
        </div>

        {/* 主颜色 (ASS PrimaryColour) */}
        <div className="space-y-2">
          <Label className="text-xs">文字颜色</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color.value}
                onClick={() => updateStyle('primaryColor', color.value)}
                disabled={disabled}
                className={`w-7 h-7 rounded border-2 transition-all ${style.primaryColor === color.value ? 'border-primary scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: assColorToCssHex(color.value) }}
                title={color.name}
              />
            ))}
            <input
              type="color"
              value={assColorToCssHex(style.primaryColor)}
              onChange={(e) => updateStyle('primaryColor', `&H${e.target.value.slice(5, 7)}${e.target.value.slice(3, 5)}${e.target.value.slice(1, 3)}`)}
              disabled={disabled}
              className="w-7 h-7 p-0.5 rounded border border-border cursor-pointer"
              title="自定义颜色"
            />
          </div>
        </div>

        {/* 描边颜色 (ASS OutlineColour) */}
        <div className="space-y-2">
          <Label className="text-xs">描边颜色</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color.value}
                onClick={() => updateStyle('outlineColor', color.value)}
                disabled={disabled}
                className={`w-7 h-7 rounded border-2 transition-all ${style.outlineColor === color.value ? 'border-primary scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: assColorToCssHex(color.value) }}
                title={color.name}
              />
            ))}
            <input
              type="color"
              value={assColorToCssHex(style.outlineColor)}
              onChange={(e) => updateStyle('outlineColor', `&H${e.target.value.slice(5, 7)}${e.target.value.slice(3, 5)}${e.target.value.slice(1, 3)}`)}
              disabled={disabled}
              className="w-7 h-7 p-0.5 rounded border border-border cursor-pointer"
              title="自定义颜色"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* 描边与阴影 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="text-xs">描边与阴影</span>
        </div>

        {/* 描边样式 */}
        <div className="space-y-1">
          <Label className="text-xs">描边样式</Label>
          <Select value={style.borderStyle} onValueChange={(v) => updateStyle('borderStyle', v as SubtitleBorderStyle)} disabled={disabled}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BORDER_STYLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 描边宽度 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">描边宽度</Label>
            <span className="text-xs text-muted-foreground">{style.outlineWidth}px</span>
          </div>
          <Slider min={0} max={5} step={0.5} value={[style.outlineWidth]} onValueChange={([v]) => updateStyle('outlineWidth', v)} disabled={disabled} />
        </div>

        {/* 阴影深度 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">阴影深度</Label>
            <span className="text-xs text-muted-foreground">{style.shadowDepth}</span>
          </div>
          <Slider min={0} max={10} step={1} value={[style.shadowDepth]} onValueChange={([v]) => updateStyle('shadowDepth', v)} disabled={disabled} />
        </div>
      </div>

      <Separator />

      {/* 位置设置 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="text-xs">位置与对齐</span>
        </div>

        {/* 对齐方式 */}
        <div className="space-y-1">
          <Label className="text-xs">文字对齐</Label>
          <div className="grid grid-cols-3 gap-1">
            {ALIGN_OPTIONS.map((align) => (
              <button
                key={align.value}
                onClick={() => updateStyle('alignment', align.value)}
                disabled={disabled}
                className={`py-1.5 px-2 text-xs rounded transition-colors ${style.alignment === align.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
              >
                {align.label}
              </button>
            ))}
          </div>
        </div>

        {/* 垂直位置 (ASS MarginV, px) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">垂直边距</Label>
            <span className="text-xs text-muted-foreground">{style.marginV}px</span>
          </div>
          <Slider min={0} max={200} step={1} value={[style.marginV]} onValueChange={([v]) => updateStyle('marginV', v)} disabled={disabled} />
        </div>
      </div>

      <Separator />

      {/* 背景设置 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="text-xs">背景</span>
        </div>

        {/* 背景颜色 (ASS BackColour, &HAABBGGRR, AA: 00=不透明, FF=透明) */}
        <div className="space-y-2">
          <Label className="text-xs">背景颜色</Label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { name: '透明', value: '&HFF000000' },
              { name: '黑色半透明', value: '&H80000000' },
              { name: '白色半透明', value: '&H80FFFFFF' },
              { name: '黑色不透明', value: '&H00000000' }
            ].map((color) => {
              const display = assBackColorToDisplay(color.value);
              return (
                <button
                  key={color.value}
                  onClick={() => updateStyle('backColor', color.value)}
                  disabled={disabled}
                  className={`w-7 h-7 rounded border-2 transition-all ${style.backColor === color.value ? 'border-primary scale-110' : 'border-transparent hover:scale-105'} relative overflow-hidden`}
                  title={color.name}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: display.cssColor,
                      opacity: display.opacity
                    }}
                  />
                </button>
              );
            })}
            <input
              type="color"
              value={assBackColorToDisplay(style.backColor).cssColor}
              onChange={(e) => {
                const hex = e.target.value;
                // 保留当前 alpha
                const currentHex = style.backColor.replace('&H', '').replace('&', '');
                const alpha = currentHex.length >= 8 ? currentHex.slice(0, 2) : '00';
                updateStyle('backColor', `&H${alpha}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`);
              }}
              disabled={disabled}
              className="w-7 h-7 p-0.5 rounded border border-border cursor-pointer"
              title="自定义颜色"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
