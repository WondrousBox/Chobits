/**
 * 思考过程展示组件
 * 在 AI 回复时展示模型的思考/推理过程，类似于工具调用的折叠形式
 * 默认收起，只显示"思考中"状态指示器，点击展开可以看到流式打字效果的思考内容
 */

import { useState } from 'react';
import { TbBrain, TbCheck, TbChevronDown, TbChevronRight } from 'react-icons/tb';

interface ThinkingActivityProps {
  thinking: string;
  isThinking: boolean;
}

const ThinkingActivity: React.FC<ThinkingActivityProps> = ({ thinking, isThinking }) => {
  const [expanded, setExpanded] = useState(false);

  if (!thinking && !isThinking) return null;

  return (
    <div className="text-xs border border-border/50 rounded-lg overflow-hidden mb-1">
      <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors text-left" onClick={() => setExpanded(!expanded)}>
        {isThinking ? (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-50" />
            <TbBrain className="relative h-3 w-3 text-purple-500" />
          </span>
        ) : (
          <TbCheck className="h-3 w-3 text-green-500 shrink-0" />
        )}
        <span className="text-muted-foreground truncate">{isThinking ? '思考中...' : '已思考'}</span>
        {expanded ? <TbChevronDown className="h-3 w-3 ml-auto shrink-0" /> : <TbChevronRight className="h-3 w-3 ml-auto shrink-0" />}
      </button>
      {expanded && thinking && (
        <div className="px-2.5 py-1.5 bg-muted/30 border-t border-border/50 max-h-64 overflow-auto">
          <pre className="text-[11px] whitespace-pre-wrap break-words text-muted-foreground/80 leading-relaxed">{thinking}</pre>
        </div>
      )}
    </div>
  );
};

export default ThinkingActivity;
