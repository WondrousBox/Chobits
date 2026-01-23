import { SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { Button } from '@/components/ui/button';

export type MentionListHandle = {
  onKeyDown: (e: any) => void;
};

export const MentionList = forwardRef<MentionListHandle, SuggestionProps>((props: SuggestionProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      if (item.value === 'screenshot') {
        window.AIM.player.screenshot();
        return props.editor.chain().focus().deleteRange(props.range).run();
      }
      if (item.value === 'timestamp') {
        window.AIM.player.getCurrentTime();
        return props.editor.chain().focus().deleteRange(props.range).run();
      }
      props.command({ id: item.label });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

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
