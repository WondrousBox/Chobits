import React from 'react';

import { UnifiedChatInput } from '@/components/chat';
import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';

import { useChatSelection } from '../context/ChatSelectionContext';

export interface ChatInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  onStart: (content: string) => void | Promise<void>;
  onStop?: () => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
  footerLeft?: React.ReactNode;
  footerRightExtra?: React.ReactNode;
  autoClear?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string) => void;
  onInstanceMenuOpenChange?: (open: boolean) => void;
}

export default function ChatInput({
  value,
  defaultValue,
  onChange,
  onStart,
  onStop,
  loading,
  placeholder,
  className,
  footerLeft,
  footerRightExtra,
  autoClear = true,
  disabled = false,
  autoFocus = false,
  onKeyDown,
  onInstanceMenuOpenChange
}: ChatInputProps): JSX.Element {
  const { providerId, modelId, presetId, setProviderId, setModelId } = useChatSelection();

  return (
    <UnifiedChatInput
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      onSend={onStart}
      onStop={onStop}
      loading={loading}
      placeholders={[placeholder || '输入消息']}
      className={className}
      autoClear={autoClear}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      showSaveButton={false}
      footerLeft={
        <>
          <div className="shrink-0">
            <ProviderModelSelect
              providerId={providerId}
              presetId={presetId || undefined}
              modelId={modelId || undefined}
              onChange={(nextProviderId, nextModelId) => {
                setProviderId(nextProviderId);
                setModelId(nextModelId);
              }}
              placeholder="选择服务商 · 模型"
              buttonVariant="outline"
              buttonSize="sm"
              onOpenChange={onInstanceMenuOpenChange}
            />
          </div>
          {footerLeft}
        </>
      }
      footerRightExtra={footerRightExtra}
    />
  );
}
