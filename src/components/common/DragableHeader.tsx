import { Button } from "../ui/button";

interface DragAbleHeaderProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

function DragAbleHeader({ title, icon, actions, onClose }: DragAbleHeaderProps) {
  return (
    <div className="flex items-center w-full drag-region gap-2">
      { window.YUA.isMac && <div className="w-20"></div>}
      <div>{title}</div>
      {icon && <div>{icon}</div>}
      {actions && <div>{actions}</div>}
      {onClose && <Button onClick={onClose}>Close</Button>}
    </div>
  )
}

export default DragAbleHeader