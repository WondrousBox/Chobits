import { TbDatabase, TbFileText, TbFolderOpen } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

function FolderSetting(): JSX.Element {
  const openDatabaseLocation = async (): Promise<void> => {
    window.YUA.system['database:openLocation']();
  };
  const openLogsLocation = async (): Promise<void> => {
    window.YUA.system['logs:openLocation']();
  };

  return (
    <div className="px-2">
      <div className="bg-card border border-border rounded-lg p-2">
        <div className="flex items-center text-foreground gap-1">
          <TbDatabase /> 数据库
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">用户数据目录/data/</div>
          <Button variant="outline" onClick={openDatabaseLocation}>
            <TbFolderOpen />
            打开位置
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-2 mt-3">
        <div className="flex items-center text-foreground gap-1">
          <TbFileText /> 日志
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">应用日志目录/logs/</div>
          <Button variant="outline" onClick={openLogsLocation}>
            <TbFolderOpen />
            打开位置
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FolderSetting;
