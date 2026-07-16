export function isAbsoluteLocalFilePath(value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

export function getLocalPathForFile(file: File): string | undefined {
  const filePath = window.YUA?.file?.getPathForFile?.(file) || '';
  return isAbsoluteLocalFilePath(filePath) ? filePath : undefined;
}
