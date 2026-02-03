import React from 'react';

import { UnifiedEditor } from '@/components/Editor';

const NotesTab: React.FC = () => {
  return (
    <div className="h-full w-full overflow-hidden">
      <UnifiedEditor mode="full" showTitle showBubbleMenu showPlayerControls showMediaButtons />
    </div>
  );
};

export default NotesTab;
