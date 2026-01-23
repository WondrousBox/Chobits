import React from 'react';

import { Tiptap } from '@/components/Editor';

const NotesTab: React.FC = () => {
  return (
    <div className="h-full w-full overflow-hidden">
      <Tiptap />
    </div>
  );
};

export default NotesTab;
