/**
 * 资源工具：根据文件名推断资源类型
 * - 纯函数，无副作用，易于单元测试与复用。
 * - 输入：fileName: string
 * - 输出：ResourceType
 */
export type ResourceType = 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other';

export const getResourceTypeFromFilename = (fileName: string): ResourceType => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (!ext) return 'file';
  const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp']);
  const videoExt = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'mpeg', 'mpg', 'm4v']);
  const audioExt = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus']);
  const documentExt = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'markdown']);
  const textExt = new Set(['txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx']);

  if (imageExt.has(ext)) return 'image';
  if (videoExt.has(ext)) return 'video';
  if (audioExt.has(ext)) return 'audio';
  if (documentExt.has(ext)) return 'document';
  if (textExt.has(ext)) return 'text';
  return 'file';
};
