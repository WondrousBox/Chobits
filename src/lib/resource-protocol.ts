// Helper for building URLs to the custom resource protocol
export function makeResSrc(absPath: string): string {
  const forward = absPath.replace(/\\/g, '/');
  return 'res://local/' + encodeURIComponent(forward);
}
