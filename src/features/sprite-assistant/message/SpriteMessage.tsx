/**
 * SpriteMessage - 统一消息组件
 *
 * 职责：
 * - 根据当前消息类型渲染对应的渲染器
 * - 管理消息显示/隐藏动画
 * - 统一定位和布局
 */

import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { useMessage } from './MessageContext';
import { BusyRenderer, NoticeRenderer, ToastRenderer } from './renderers';
import type { BusyMessage, NoticeMessage, ToastMessage } from './types';

interface SpriteMessageProps {
  className?: string;
}

export function SpriteMessage({ className }: SpriteMessageProps): JSX.Element | null {
  const { current, dismiss, handleButtonClick } = useMessage();
  const [visible, setVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState(current);

  // 处理消息切换动画
  useEffect(() => {
    if (current) {
      // 有新消息，先隐藏再显示（如果之前有消息）
      if (displayMessage && displayMessage.id !== current.id) {
        setVisible(false);
        const timer = setTimeout(() => {
          setDisplayMessage(current);
          setVisible(true);
        }, 150); // 等待淡出动画完成
        return () => clearTimeout(timer);
      } else {
        setDisplayMessage(current);
        // 使用 requestAnimationFrame 确保 DOM 更新后再设置可见
        requestAnimationFrame(() => {
          setVisible(true);
        });
      }
    } else {
      // 没有消息，淡出
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayMessage(null);
      }, 200); // 等待淡出动画完成后清除消息
      return () => clearTimeout(timer);
    }
  }, [current]);

  // 如果没有消息要显示，返回 null
  if (!displayMessage) return null;

  // 根据消息类型选择渲染器
  const renderMessage = (): JSX.Element | null => {
    switch (displayMessage.type) {
      case 'toast':
        return <ToastRenderer message={displayMessage as ToastMessage} />;
      case 'notice':
        return <NoticeRenderer message={displayMessage as NoticeMessage} onClose={() => dismiss(displayMessage.id)} onButtonClick={handleButtonClick} />;
      case 'busy':
        return <BusyRenderer message={displayMessage as BusyMessage} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={clsx(
        // 定位
        'absolute -top-[32px] left-1/2 -translate-x-1/2 z-10',
        // 动画
        'transition-all duration-200 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        className
      )}
    >
      {renderMessage()}
    </div>
  );
}

export default SpriteMessage;
