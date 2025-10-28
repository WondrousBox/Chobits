import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';
import { Button } from '../ui/button';
import { useEffect, useState } from 'react';

interface DragAbleTitleProps {
  title: React.ReactNode | string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

function DragAbleTitle({ title, icon, actions, onClose }: DragAbleTitleProps) {
  const [maximized, setMaximized] = useState(false);
  const [caps, setCaps] = useState({ minimizable: true, maximizable: true, resizable: true });

  useEffect(() => {
    let mounted = true;
    if (window.YUA.isWindows) {
      window.YUA.window['window:maximized:get']().then((v) => {
        if (mounted) setMaximized(!!v);
      });
      window.YUA.window['window:capabilities:get']().then((c) => {
        if (mounted) setCaps(c);
      });
      const listener = (_: any, state: boolean) => {
        if (mounted) setMaximized(state);
      };
      window.ipcRenderer.on('window-maximize-changed', listener);
      return () => {
        mounted = false;
        window.ipcRenderer.off('window-maximize-changed', listener);
      };
    }
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <div className="flex items-center w-full drag-region gap-2 h-9 px-2 box-border bg-background">
      {window.YUA.isMac && <div className="w-20"></div>}
      <div className="flex-1 w-0">{title}</div>
      {icon && <div>{icon}</div>}
      {actions && <div className="no-drag flex items-center gap-2">{actions}</div>}
      {/* Windows 自定义窗口控制按钮（Mac 使用系统 traffic lights 不再重复） */}
      {window.YUA.isWindows && (
        <div className="no-drag flex items-center ml-2 -mr-2 select-none">
          <Button
            title="Minimize"
            disabled={!caps.minimizable}
            className="rounded-none border-0 shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
            variant={'outline'}
            onClick={() => caps.minimizable && window.YUA.window['window:minimize']()}
          >
            <VscChromeMinimize />
          </Button>
          <Button
            title={maximized ? 'Restore' : 'Maximize'}
            disabled={!(caps.maximizable && caps.resizable)}
            className="rounded-none border-0 shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
            variant={'outline'}
            onClick={async () => {
              if (!(caps.maximizable && caps.resizable)) return;
              const r = await window.YUA.window['window:maximize']();
              setMaximized(!!r.maximized);
            }}
          >
            {maximized ? <VscChromeRestore /> : <VscChromeMaximize />}
          </Button>
          <Button
            title="Close"
            className="rounded-none hover:bg-red-500 hover:text-white border-0 shadow-none"
            variant={'outline'}
            onClick={() => {
              if (onClose) onClose();
              else window.YUA.window['window:close:self']();
            }}
          >
            <VscChromeClose />
          </Button>
        </div>
      )}
      {/* 兼容保留自定义 onClose（非 Windows 或者想要额外的关闭按钮） */}
      {onClose && !window.YUA.isWindows && (
        <Button className="w-8 h-8" onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  );
}

export default DragAbleTitle;
