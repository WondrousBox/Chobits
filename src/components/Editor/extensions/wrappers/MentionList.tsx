import { SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useImperativeHandle, useState } from 'react';

import { Button } from '@/components/ui/button';

import type { MentionItem } from './mentionItems';

export type MentionListHandle = {
  onKeyDown: (e: any) => void;
};

export const MentionList = forwardRef<MentionListHandle, SuggestionProps>(function MentionList(props: SuggestionProps, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number): void => {
    const item = props.items[index] as MentionItem;

    if (item) {
      // 如果有自定义处理函数，使用自定义处理
      if (item.onSelect) {
        item.onSelect(props.editor, props.range);
      } else {
        // 默认行为：插入 mention
        props.command({ id: item.label });
      }
    }
  };

  const upHandler = (): void => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = (): void => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = (): void => {
    selectItem(selectedIndex);
  };

  // 当列表项改变时重置选中索引
  // 使用前一个值比较，避免 useEffect 中直接调用 setState
  const [prevItemsLength, setPrevItemsLength] = useState(props.items.length);
  if (prevItemsLength !== props.items.length) {
    setPrevItemsLength(props.items.length);
    if (selectedIndex >= props.items.length) {
      setSelectedIndex(0);
    }
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    }
  }));

  return (
    <div className="p-1 relative rounded bg-muted text-muted-foreground shadow-lg">
      {props.items.length ? (
        props.items.map((item, index) => (
          <Button variant={index === selectedIndex ? 'default' : 'ghost'} className="block w-full" key={item.value} onClick={() => selectItem(index)}>
            {item.label}
          </Button>
        ))
      ) : (
        <div>No result</div>
      )}
    </div>
  );
});
