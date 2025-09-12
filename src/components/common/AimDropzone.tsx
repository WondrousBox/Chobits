import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { TbFileDownload } from "react-icons/tb";

import { SelectedResourceFileType } from "@/types";

interface AimDropzoneProps {
  children?: ReactNode;
  className?: string;
  customDropzone?: ReactNode;
  onDropFiles?: (files: SelectedResourceFileType[]) => void;
}

function AimDropzone({ children, customDropzone, className, onDropFiles }: AimDropzoneProps) {
  const [isActive, setIsActive] = useState(false);
  const { t } = useTranslation();
  const { getRootProps } = useDropzone({
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
    // accept: {
    //   'image/png': ['.png'],
    //   'text/html': ['.html', '.htm'],
    // },
    onDrop: (list: File[]) => {
      setIsActive(false);
      if (list.length === 0) { return; }
      const fl: SelectedResourceFileType[] = list.map(i => ({
        path: i.path,
        isUrl: false,
        name: i.name,
        size: i.size,
      }));
      console.log(fl);
      onDropFiles && onDropFiles(fl);
    },
    onDragEnter: (e) => {
      console.log(e);
      console.log("enter");
      setIsActive(true);
    },
    onDragLeave: () => {
      console.log("leave");
      setIsActive(false);
    }
  });

  return <>
    <div className='fixed left-0 top-0 bottom-0 right-0 overflow-hidden z-50 pointer-events-none'>
      <AnimatePresence>
        {
          isActive && <motion.div
            key={"dropzone1"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            exit={{ opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            className='absolute left-0 right-0 top-0 bottom-0 bg-primary z-50'></motion.div>
        }
        {
          isActive && <motion.div
            key={"dropzone2"}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            className='absolute top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center'
          >
            {
              customDropzone || <div className='px-40 py-10 border border-ring border-dashed bg-background flex justify-center items-center gap-2'>
                <TbFileDownload size={24} className='text-foreground' />
                <div>{t("task.drop files")}</div>
              </div>
            }
          </motion.div>
        }
      </AnimatePresence>
    </div>
    <div {...getRootProps({ className: `dropzone relative ${className || ""}` })}>
      {children}
    </div>
  </>;
}

export default AimDropzone;
