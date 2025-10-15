/**
 * useFileDrop
 * - 负责：Dropzone 的文件拖拽状态（进入/离开/落下）并调用资源服务入库；可回调停止行走与关闭穿透。
 * - 返回：{ isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles }
 */
import { useRef, useState } from 'react'
import type { SelectedResourceFileType } from '@/types'
import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../services/resourceService'

export function useFileDrop(onStopWalking?: () => void, onClickThrough?: (enable: boolean) => void) {
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const isFilesDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    setIsFileDragOver(true)
    onStopWalking?.()
    onClickThrough?.(false)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsFileDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setIsFileDragOver(false)
    onClickThrough?.(false)
    onStopWalking?.()
    await addResourcesFromDataTransfer(e.dataTransfer!)
  }

  const handleDropFiles = async (files: SelectedResourceFileType[]) => {
    dragCounterRef.current = 0
    setIsFileDragOver(false)
    onClickThrough?.(false)
    onStopWalking?.()
    await addResourcesFromSelectedFiles(files)
  }

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles }
}

export default useFileDrop
