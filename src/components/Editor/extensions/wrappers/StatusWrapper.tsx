import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { useCallback, useMemo, useState } from 'react';
import { TbSticker } from 'react-icons/tb';

import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const STATUS_COLORS = [
  // 按钮背景 文字颜色 背景颜色 边框颜色
  ['rgb(223, 225, 230)', '#42526E', '#DFE1E6', 'rgb(80, 95, 121)'],
  ['rgb(234, 230, 255)', '#403294', '#EAE6FF', 'rgb(82, 67, 170)'],
  ['rgb(222, 235, 255)', '#0747A6', '#DEEBFF', 'rgb(0, 82, 204)'],
  ['rgb(255, 235, 230)', '#BF2600', '#FFECE6', 'rgb(222, 53, 11)'],
  ['rgb(255, 240, 179)', '#172B4D', '#FFF0B3', 'rgb(255, 153, 31)'],
  ['rgb(227, 252, 239)', '#006644', '#E3FCEF', 'rgb(0, 135, 90)']
];

export const StatusWrapper = ({ editor, node, updateAttributes }: NodeViewProps): JSX.Element => {
  const isEditable = editor.isEditable;
  const { color: currentTextColor, bgcolor, borderColor, text } = node.attrs;
  const [currentText, setCurrentText] = useState(text);

  const content = useMemo(
    () => (
      <span style={{ backgroundColor: bgcolor, border: `1px solid ${borderColor}` }}>
        <span style={{ color: currentTextColor }}>{currentText || '点击设置状态'}</span>
      </span>
    ),
    [bgcolor, borderColor, currentTextColor, currentText]
  );

  const setColor = useCallback(
    (color: string[]) => () => {
      updateAttributes({
        color: color[1],
        bgcolor: color[2]
      });
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle cursor-pointer">
      {isEditable ? (
        <Popover onOpenChange={(visible) => !visible && updateAttributes({ text: currentText })}>
          <PopoverTrigger>{content}</PopoverTrigger>
          <PopoverContent>
            <Input placeholder="输入状态" className="w-full" value={currentText} onChange={(e) => setCurrentText(e.currentTarget.value)} />
            <div className="flex gap-1 p-2 justify-between">
              {STATUS_COLORS.map((color) => {
                return (
                  <div
                    key={color[0]}
                    className={'w-6 h-6 cursor-pointer flex items-center justify-center'}
                    style={{
                      background: color[0],
                      border: `1px solid ${color[3]}`
                    }}
                    onClick={setColor(color)}
                  >
                    {currentTextColor === color[1] ? <TbSticker style={{ color: color[1] }} /> : null}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        content
      )}
    </NodeViewWrapper>
  );
};
