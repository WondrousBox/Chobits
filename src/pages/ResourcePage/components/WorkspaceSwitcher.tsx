import * as React from 'react';
import { TbBox, TbCaretUpDown, TbPlus, TbSettings2 } from 'react-icons/tb';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

export interface Workspace {
  id: string;
  name: string;
  isDefault?: number;
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspaceId?: string;
}

export default function WorkspaceSwitcher({ workspaces, currentWorkspaceId }: WorkspaceSwitcherProps): React.ReactElement | null {
  const { isMobile } = useSidebar();

  console.log('WorkspaceSwitcher', currentWorkspaceId);

  const activeWorkspace = React.useMemo(() => workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0], [workspaces, currentWorkspaceId]);

  return (
    <SidebarMenu className="pl-0">
      <SidebarMenuItem className="list-none">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <TbBox size={20} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{activeWorkspace?.name || '无工作空间'}</span>
                <span className="truncate text-xs">{activeWorkspace ? '工作空间' : '请创建工作空间'}</span>
              </div>
              <TbCaretUpDown />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" align="start" side={isMobile ? 'bottom' : 'right'} sideOffset={4}>
            <DropdownMenuLabel className="text-muted-foreground text-xs">工作空间</DropdownMenuLabel>
            {workspaces.map((ws) => (
              <DropdownMenuItem key={ws.id} onClick={() => window.YUA.workspace['workspace:setDefault']({ id: ws.id })}>
                <TbBox size={20} />
                {ws.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-muted-foreground"
              onClick={() => {
                window.YUA.window['window:open']('workspaceWizard');
              }}
            >
              <TbPlus />
              创建新空间
            </DropdownMenuItem>
            <DropdownMenuItem className="text-muted-foreground" onClick={() => window.YUA.window['window:open']('settings', { tab: 'workspace' })}>
              <TbSettings2 />
              管理空间
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
