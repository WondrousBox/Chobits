// Helpers
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const bezierQ = (p0: number, p1: number, p2: number, t: number) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2;

// 脱敏用户路径
// - Windows: 将 <Drive>:\Users\<name> 或 <Drive>:/Users/<name> 前缀替换为 %USERPROFILE%
// - macOS/Linux: 将 /Users/<name> 或 /home/<name> 前缀替换为 ~
export function maskPath(p?: string): string {
  if (!p) return '-';
  if (p.startsWith('~')) return p;
  if (/^%userprofile%/i.test(p)) return p;

  // 支持的前缀形式：
  // macOS: /Users/<name>
  // Linux: /home/<name>
  // Windows: <Drive>:\Users\<name> 或 <Drive>:/Users/<name>
  const windowsPatterns = [/^[A-Za-z]:[\\/]users?[\\/][^\\/]+/i];
  for (const r of windowsPatterns) {
    const m = p.match(r);
    if (m) return '%USERPROFILE%' + p.slice(m[0].length);
  }

  const posixPatterns = [/^\/users\/[^/]+/i, /^\/home\/[^/]+/i];
  for (const r of posixPatterns) {
    const m = p.match(r);
    if (m) return '~' + p.slice(m[0].length);
  }
  return p;
}
