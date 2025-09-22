import { Button } from "../ui/button";

interface DragAbleHeaderProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

function DragAbleHeader({ title, icon, actions, onClose }: DragAbleHeaderProps) {
  return (
    <div className="flex items-center w-full drag-region gap-2 h-12 px-2 box-border">
      { window.YUA.isMac && <div className="w-20"></div>}
      <div className="flex-1 text-lg">{title}</div>
      {icon && <div>{icon}</div>}
      {actions && <div className="no-drag">{actions}</div>}
      {onClose && <Button className="w-8 h-8" onClick={onClose}>Close</Button>}
    </div>
  )
}

export default DragAbleHeader