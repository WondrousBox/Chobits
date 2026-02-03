/**
 * RichTextEditor - 向后兼容的包装组件
 *
 * 此组件现在基于 UnifiedEditor 实现，提供与原有 API 完全兼容的接口。
 * 建议新代码直接使用 UnifiedEditor 组件。
 *
 * @deprecated 请使用 @/components/Editor/UnifiedEditor 代替
 */
import { ReactNode } from 'react';

import { UnifiedEditor } from '@/components/Editor';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  toolbarRight?: ReactNode;
  editable?: boolean;
  style?: React.CSSProperties;
}

export const RichTextEditor = ({ value, onChange, placeholder, className, toolbarRight, editable = true, style }: RichTextEditorProps): JSX.Element => {
  return (
    <UnifiedEditor
      content={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      toolbarRight={toolbarRight}
      editable={editable}
      style={style}
      mode={editable ? 'simple' : 'readonly'}
      toolbarPosition="floating"
      markdown={true}
    />
  );
};
