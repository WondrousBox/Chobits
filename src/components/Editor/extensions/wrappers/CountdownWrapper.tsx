import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import ReactCountdown from 'react-countdown';

import { cn } from '@/lib/utils';

const renderer = (props: any) => {
  const { completed, formatted } = props;
  const { days, hours, minutes, seconds } = formatted;

  if (completed) {
    return <div>已结束</div>;
  } else {
    return (
      <div className="flex items-center gap-2">
        <div>{days}</div>
        <span style={{ transform: `translateY(-2px)` }}> / 天</span>
        <div>
          {hours}:{minutes}:{seconds}
        </div>
      </div>
    );
  }
};

// tiptap doc: https://tiptap.dev/guide/node-views/react#all-available-props
export const CountdownWrapper = ({
  // editor,
  selected,
  node
}: NodeViewProps) => {
  const { title, date } = node.attrs;

  return (
    <NodeViewWrapper>
      <div className={cn('flex h-24 overflow-hidden rounded items-center flex-col justify-center border-2 border-slate-400', selected ? ' border-blue-300 ' : '')}>
        <span>{title}</span>
        <ReactCountdown date={date} renderer={renderer}></ReactCountdown>
      </div>
    </NodeViewWrapper>
  );
};
