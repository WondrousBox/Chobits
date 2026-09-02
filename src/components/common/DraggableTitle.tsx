import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { TbArrowLeft } from 'react-icons/tb';
import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';
import { useNavigate } from 'react-router-dom';

import { Button } from '../ui/button';

interface DraggableTitleProps {
  title: React.ReactNode | string;
  icon?: React.ReactNode;
  fixed?: boolean;
  center?: React.ReactNode;
  actions?: React.ReactNode;
  shouldShowBack?: boolean;
  onClose?: () => void;
}

function DraggableTitle({ title, icon, center, actions, shouldShowBack = false, fixed, onClose }: DraggableTitleProps): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowCapabilities, setWindowCapabilities] = useState({ minimizable: true, maximizable: true, resizable: true });
  const navigate = useNavigate();
  // Windows/Linux 窗口是 frame: false，需要自绘窗口控制按钮；macOS 使用系统 traffic lights
  const shouldShowWindowControls = window.chobits.isWindows || window.chobits.isLinux;

  useEffect(() => {
    let mounted = true;
    if (shouldShowWindowControls) {
      window.chobits.window['window:maximized:get']().then((v) => {
        if (mounted) setIsMaximized(!!v);
      });
      window.chobits.window['window:capabilities:get']().then((c) => {
        if (mounted) setWindowCapabilities(c);
      });
      const listener = (_: any, state: boolean): void => {
        if (mounted) setIsMaximized(state);
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
  }, [shouldShowWindowControls]);
  return (
    <div className={clsx(['flex items-center w-full drag-region gap-2 h-9 px-2 box-border bg-background', fixed && 'fixed top-0 left-0 right-0'])}>
      {window.chobits.isMac && <div className="w-20"></div>}
      {shouldShowBack && (
        <Button variant="ghost" size="icon" className="h-8 w-8 no-drag" onClick={() => navigate(-1)}>
          <TbArrowLeft />
        </Button>
      )}
      <div className="flex-1 w-0">{title}</div>
      {icon && <div>{icon}</div>}
      {center && <div className="absolute left-1/2 -translate-x-1/2 flex items-center">{center}</div>}
      {actions && <div className="no-drag flex items-center gap-2">{actions}</div>}
      {/* Windows/Linux 自定义窗口控制按钮（Mac 使用系统 traffic lights 不再重复） */}
      {shouldShowWindowControls && (
        <div className="no-drag flex items-center ml-2 -mr-2 select-none">
          <Button
            title="Minimize"
            disabled={!windowCapabilities.minimizable}
            className="rounded-none border-0 shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
            variant={'outline'}
            onClick={() => windowCapabilities.minimizable && window.chobits.window['window:minimize']()}
          >
            <VscChromeMinimize />
          </Button>
          <Button
            title={isMaximized ? 'Restore' : 'Maximize'}
            disabled={!(windowCapabilities.maximizable && windowCapabilities.resizable)}
            className="rounded-none border-0 shadow-none disabled:opacity-40 disabled:cursor-not-allowed"
            variant={'outline'}
            onClick={async () => {
              if (!(windowCapabilities.maximizable && windowCapabilities.resizable)) return;
              const r = await window.chobits.window['window:maximize']();
              setIsMaximized(!!r.maximized);
            }}
          >
            {isMaximized ? <VscChromeRestore /> : <VscChromeMaximize />}
          </Button>
          <Button
            title="Close"
            className="rounded-none hover:bg-red-500 hover:text-white border-0 shadow-none"
            variant={'outline'}
            onClick={() => {
              if (onClose) onClose();
              else window.chobits.window['window:close:self']();
            }}
          >
            <VscChromeClose />
          </Button>
        </div>
      )}
      {/* 兼容保留自定义 onClose（macOS 或者想要额外的关闭按钮） */}
      {onClose && !shouldShowWindowControls && (
        <Button className="w-8 h-8" onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  );
}

export default DraggableTitle;
