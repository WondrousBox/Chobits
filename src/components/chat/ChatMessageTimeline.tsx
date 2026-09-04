import type { SpeechDisplayTextFilter } from '@packages/ai/speech-display-filter';
import type { FC } from 'react';

import ChatMessageRenderer from './ChatMessageRenderer';
import { hasTimelineContent, type TimelineMessage } from './message-timeline';
import ThinkingActivity from './ThinkingActivity';
import type { ToolActivity } from './ToolCallActivity';
import ToolCallActivity from './ToolCallActivity';

interface ChatMessageTimelineProps {
  speechDisplayTextFilter?: SpeechDisplayTextFilter;
  message: TimelineMessage;
  onUserChoiceSubmit?: (choiceId: string, answers: Record<string, string[]>) => void;
}

const ChatMessageTimeline: FC<ChatMessageTimelineProps> = ({ message, onUserChoiceSubmit, speechDisplayTextFilter: fallbackSpeechDisplayTextFilter }) => {
  const speechDisplayTextFilter = message.speechDisplayTextFilter ?? fallbackSpeechDisplayTextFilter;

  if (message.displayParts?.length) {
    return (
      <>
        {message.displayParts.map((part) => {
          if (part.type === 'thinking') {
            return <ThinkingActivity key={part.id} thinking={part.thinking} isThinking={!!part.isThinking} />;
          }

          if (part.type === 'tool') {
            return <ToolCallActivity key={part.id} activities={[part.activity]} onUserChoiceSubmit={onUserChoiceSubmit} />;
          }

          return <ChatMessageRenderer key={part.id} content={part.content} speechDisplayTextFilter={speechDisplayTextFilter} />;
        })}
      </>
    );
  }

  if (!hasTimelineContent(message)) {
    return null;
  }

  const activities: ToolActivity[] = message.activities || [];

  return (
    <>
      {message.thinking && <ThinkingActivity thinking={message.thinking} isThinking={!!message.isThinking} />}
      {activities.length > 0 && <ToolCallActivity activities={activities} onUserChoiceSubmit={onUserChoiceSubmit} />}
      {message.content ? <ChatMessageRenderer content={message.content} speechDisplayTextFilter={speechDisplayTextFilter} /> : null}
    </>
  );
};

export default ChatMessageTimeline;
