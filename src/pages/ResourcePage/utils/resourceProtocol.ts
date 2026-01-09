// Helper functions for building URLs to custom resource protocol
export function makeResSrc(absPath: string): string {
  const forward = absPath.replace(/\\/g, '/');
  return 'res://local/' + encodeURIComponent(forward);
}

export function makeWorkspaceResSrc(workspaceId: string, relativePath: string): string {
  const forward = relativePath.replace(/\\/g, '/');
  return 'res://ws/' + workspaceId + '/' + encodeURIComponent(forward);
}

export function isImageFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|heic|heif|avif|raw|cr2|nef|arw)$/i.test(p);
}

export function isVideoFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(mp4|webm|ogg|mov|mkv|ogv|avi|wmv|flv|m4v|ts|mts|m2ts|3gp|3g2|f4v|vob|rm|rmvb)$/i.test(p);
}

export function isAudioFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(mp3|wav|m4a|flac|ogg|opus|aac|wma|aiff?|ape|alac|mid|midi|amr|ac3|dts)$/i.test(p);
}

export function isPdfFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.pdf$/i.test(p);
}

// Office 文档格式
export function isDocumentFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(doc|docx|odt|rtf|wps)$/i.test(p);
}

export function isSpreadsheetFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(xls|xlsx|xlsm|ods|csv|numbers)$/i.test(p);
}

export function isPresentationFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(ppt|pptx|odp|key)$/i.test(p);
}

// 通用办公文档判断（包含 PDF、Word、Excel、PPT 等）
export function isOfficeFile(p?: string): boolean | undefined {
  if (!p) return false;
  return isPdfFile(p) || isDocumentFile(p) || isSpreadsheetFile(p) || isPresentationFile(p);
}

// 电子书格式
export function isEbookFile(p?: string): boolean | undefined {
  if (!p) return false;
  return /\.(epub|mobi|azw|azw3|fb2|djvu)$/i.test(p);
}

// 应用内可直接预览的文件（图片、视频、音频、PDF）
export function isPreviewableFile(p?: string): boolean | undefined {
  if (!p) return false;
  return isImageFile(p) || isVideoFile(p) || isAudioFile(p) || isPdfFile(p);
}

// 需要外部程序打开的文件（Office 文档、电子书等）
export function needsExternalApp(p?: string): boolean | undefined {
  if (!p) return false;
  return isDocumentFile(p) || isSpreadsheetFile(p) || isPresentationFile(p) || isEbookFile(p);
}

// 可处理的文件（应用内预览 + 外部程序打开）
export function isHandleableFile(p?: string): boolean | undefined {
  if (!p) return false;
  return isPreviewableFile(p) || needsExternalApp(p);
}
