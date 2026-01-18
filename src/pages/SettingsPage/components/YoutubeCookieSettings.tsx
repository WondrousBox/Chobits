import { AlertCircle, CheckCircle2, Cookie, LogIn, LogOut, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

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
      setError(err instanceof Error ? err.message : 'Failed to load cookie status');
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
      setError(err instanceof Error ? err.message : 'Failed to login');
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
      setError(err instanceof Error ? err.message : 'Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie className="h-5 w-5" />
          YouTube Authentication
        </CardTitle>
        <CardDescription>Login to YouTube to download private and age-restricted videos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        {status && (
          <div className="flex items-center gap-2 rounded-lg border p-3">
            {status.isLoggedIn ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-gray-400" />}
            <div className="flex-1">
              <p className="text-sm font-medium">{status.isLoggedIn ? 'Logged In' : 'Not Logged In'}</p>
              {status.isLoggedIn && <p className="text-xs text-muted-foreground">{status.cookieCount} cookies stored</p>}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Info Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Login with your YouTube account to access:
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              <li>Private videos</li>
              <li>Age-restricted content</li>
              <li>Member-only content</li>
              <li>Better download reliability</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {status?.isLoggedIn ? (
            <Button variant="outline" onClick={handleLogout} disabled={loading} className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              {loading ? 'Logging out...' : 'Logout'}
            </Button>
          ) : (
            <Button onClick={handleLogin} disabled={loading} className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              {loading ? 'Opening login...' : 'Login with YouTube'}
            </Button>
          )}
        </div>

        {/* How it works */}
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">How it works:</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
            <li>Click &ldquo;Login with YouTube&rdquo; to open a secure login window</li>
            <li>Sign in with your Google account</li>
            <li>Your cookies will be securely stored locally</li>
            <li>Downloads will automatically use your authentication</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
