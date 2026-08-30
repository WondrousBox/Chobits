import { AnimatePresence, motion } from 'framer-motion';
import { ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { TbFileDownload } from 'react-icons/tb';

/** 拖放进入的文件描述 */
export interface DroppedFileInfo {
  path?: string;
  name: string;
  size: number;
  extension?: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'text' | 'file';
  file: File;
}

interface DropzoneProps {
  children?: ReactNode;
  className?: string;
  customDropzone?: ReactNode;
  customDropzoneInside?: ReactNode;
  onDrop?: (files: React.DragEvent<HTMLElement>) => void;
  onDropFiles?: (files: DroppedFileInfo[]) => void;
  onDragEnter?: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave?: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLElement>) => void;
}

function Dropzone({ children, customDropzone, customDropzoneInside, className, onDropFiles, onDragEnter, onDragLeave, onDragOver, onDrop }: DropzoneProps): JSX.Element {
  const { t } = useTranslation();
  const getExt = (nameOrPath?: string): string | undefined => {
    if (!nameOrPath) return undefined;
    const trimmed = nameOrPath.replace(/[\\/]+$/, '');
    const base = trimmed.split(/[/\\]/).pop() || '';
    if (!base) return undefined;
    const parts = base.split('.');
    if (parts.length <= 1) return undefined;
    return parts.pop()?.toLowerCase();
  };

  const getTypeFromExt = (ext?: string): 'image' | 'video' | 'audio' | 'document' | 'text' | 'file' => {
    if (!ext) return 'file' as const;
    const image = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp']);
    const video = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'mpeg', 'mpg', 'm4v']);
    const audio = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus']);
    const document = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'markdown']);
    const text = new Set(['txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx']);
    if (image.has(ext)) return 'image' as const;
    if (video.has(ext)) return 'video' as const;
    if (audio.has(ext)) return 'audio' as const;
    if (document.has(ext)) return 'document' as const;
    if (text.has(ext)) return 'text' as const;
    return 'file' as const;
  };
  const { getRootProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
    // accept: {
    //   'image/png': ['.png'],
    //   'text/html': ['.html', '.htm'],
    // },
    onDrop: (acceptedFiles: File[], fileRejections, event) => {
      console.log(acceptedFiles, fileRejections, event);

      if (acceptedFiles.length === 0) {
        return;
      }
      const fl: DroppedFileInfo[] = acceptedFiles.map((i) => {
        const ext = getExt(i.name || (i as any).path);
        const type = getTypeFromExt(ext);
        return {
          path: (i as any).path,
          name: i.name,
          size: i.size,
          extension: ext,
          type,
          file: i
        };
      });
      console.log(fl);
      onDrop?.(event as any);
      onDropFiles?.(fl);
    },
    onDragOver: (e) => {
      onDragOver?.(e);
    },
    onDragEnter: (e) => {
      console.log(e);
      console.log('enter');
      onDragEnter?.(e);
    },
    onDragLeave: (e) => {
      console.log('leave');
      onDragLeave?.(e);
    }
  });

  return (
    <>
      {!customDropzoneInside && (
        <div className="fixed left-0 top-0 bottom-0 right-0 overflow-hidden z-50 pointer-events-none">
          <AnimatePresence>
            {isDragActive && (
              <motion.div
                key={'dropzone1'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.1 }}
                exit={{ opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 20
                }}
                className="absolute left-0 right-0 top-0 bottom-0 bg-primary z-50"
              ></motion.div>
            )}
            {isDragActive && (
              <motion.div
                key={'dropzone2'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 20
                }}
                className="absolute top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center"
              >
                {customDropzone || (
                  <div className="px-40 py-10 border border-ring border-dashed bg-background flex justify-center items-center gap-2">
                    <TbFileDownload size={24} className="text-foreground" />
                    <div>{t('task.drop files')}</div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <div {...getRootProps({ className: `dropzone relative ${className || ''}` })}>
        {customDropzoneInside && (
          <div className="absolute left-0 top-0 bottom-0 right-0 overflow-hidden z-50 pointer-events-none">
            <AnimatePresence>
              {isDragActive && (
                <motion.div
                  key={'dropzone2'}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    type: 'spring',
                    stiffness: 260,
                    damping: 20
                  }}
                  className="absolute top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center"
                >
                  {customDropzoneInside}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export default Dropzone;
