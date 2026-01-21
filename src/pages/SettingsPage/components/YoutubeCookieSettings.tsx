import { AlertCircle, CheckCircle2, Cookie, LogIn, LogOut, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TbBrandYoutube } from 'react-icons/tb';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clearYoutubeCookies, CookieStatus, getCookieStatus, openYoutubeLogin } from '@/lib/youtube-cookie-api';

export function YoutubeCookieSettings(): JSX.Element {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async (): Promise<void> => {
    try {
      const cookieStatus = await getCookieStatus();
      setStatus(cookieStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Cookie 状态失败');
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleLogin = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await openYoutubeLogin();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await clearYoutubeCookies();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie className="h-5 w-5" />
          YouTube 登录
        </CardTitle>
        <CardDescription>登录 YouTube 以下载私密和年龄限制视频</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 状态显示 */}
        {status && (
          <div className="flex items-center gap-2 rounded-lg border p-3">
            {status.isLoggedIn ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-gray-400" />}
            <div className="flex-1">
              <p className="text-sm font-medium">{status.isLoggedIn ? '已登录' : '未登录'}</p>
              {status.isLoggedIn && <p className="text-xs text-muted-foreground">{status.cookieCount} 个 Cookie 已存储</p>}
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 信息提示 */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            使用您的 YouTube 账户登录以访问：
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              <li>私密视频</li>
              <li>年龄限制内容</li>
              <li>会员专属内容</li>
              <li>更好的下载稳定性</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          {status?.isLoggedIn ? (
            <Button variant="outline" onClick={handleLogout} disabled={loading} className="flex items-center gap-2">
              <LogOut />
              {loading ? '正在退出...' : '退出登录'}
            </Button>
          ) : (
            <Button onClick={handleLogin} disabled={loading} className="flex items-center gap-2">
              <TbBrandYoutube />
              {loading ? '正在打开登录...' : '使用 YouTube 登录'}
            </Button>
          )}
        </div>

        {/* 工作原理 */}
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">工作原理：</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
            <li>点击"使用 YouTube 登录"打开安全登录窗口</li>
            <li>使用您的 Google 账户登录</li>
            <li>您的 Cookie 将安全地存储在本地</li>
            <li>下载将自动使用您的身份验证</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
