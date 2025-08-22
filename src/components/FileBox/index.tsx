import React, { useEffect, useState } from 'react'
import './style.css'

interface FileItem { name: string; path: string; isDirectory: boolean }

export const FileBox: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([])

  useEffect(() => {
    const handler = (_: any, list: FileItem[]) => {
      setFiles(list)
    }
    window.ipcRenderer?.on('update-file-list', handler)
    return () => {
      window.ipcRenderer?.off('update-file-list', handler as any)
    }
  }, [])

  return (
    <div className="filebox-container">
      <div className="filebox-title">📁 我的文件</div>
      {files.length === 0 && <div className="filebox-empty">拖拽文件到助手上来查看</div>}
      <ul className="filebox-list">
        {files.map((f, i) => (
          <li key={i} className="filebox-item">
            <span className="icon">{f.isDirectory ? '🗂️' : '📄'}</span>
            <span className="name" title={f.path}>{f.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default FileBox
