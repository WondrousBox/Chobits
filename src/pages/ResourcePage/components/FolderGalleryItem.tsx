import React from 'react';
import { TbFolder } from 'react-icons/tb';
import type { UIFolder } from './FolderSidebar';

interface Props {
  folder: UIFolder;
  onOpen?: () => void;
  onDropResources?: (ids: string[]) => void;
  count?: number;
}

const FolderGalleryItem: React.FC<Props> = ({ folder, onOpen, onDropResources, count }) => {
  const [over, setOver] = React.useState(false);

  return (
    <div
      data-explorer-folder
      className={`group relative aspect-video w-full overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-all cursor-pointer select-none ${over ? 'ring-2 ring-primary border-primary/50 bg-primary/5' : 'hover:shadow-md hover:border-primary/30'
        } bg-gradient-to-br from-background to-muted flex items-center justify-center`}
      onClick={() => onOpen?.()}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        try {
          const raw = e.dataTransfer.getData('application/x-resource-ids');
          if (!raw) return;
          const ids: string[] = JSON.parse(raw);
          if (Array.isArray(ids) && ids.length) onDropResources?.(ids);
        } catch {
          /* ignore */
        }
      }}
    >
      <div className="text-center">
        <div className="text-5xl text-muted-foreground/80 mb-2">
          <TbFolder />
        </div>
        <div className="text-sm font-medium truncate max-w-[90%] mx-auto">{folder.name}</div>
        {typeof count === 'number' && <div className="text-xs text-muted-foreground mt-1">{count} 项</div>}
      </div>
    </div>
  );
};

export default FolderGalleryItem;
