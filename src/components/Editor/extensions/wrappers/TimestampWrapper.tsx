import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { useMemo } from 'react';

export const TimestampWrapper = ({ editor, node, updateAttributes }: NodeViewProps) => {
  const isEditable = editor.isEditable;
  const { time } = node.attrs;

  const handleClickTime = () => { };

  const content = useMemo(
    () => (
      <span onClick={handleClickTime} className="text-[#575BC7] underline font-mono font-bold mx-1">
        {time}
      </span>
    ),
    [updateAttributes]
  );

  return (
    <NodeViewWrapper as="span" className="inline-block cursor-pointer">
      {isEditable ? content : content}
    </NodeViewWrapper>
  );
};
