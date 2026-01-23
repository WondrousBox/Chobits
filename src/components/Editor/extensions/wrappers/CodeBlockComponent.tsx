import { NodeViewContent, NodeViewProps, NodeViewWrapper } from '@tiptap/react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CodeBlockComponent = ({
  node: {
    attrs: { language: defaultLanguage }
  },
  updateAttributes,
  extension
}: NodeViewProps): JSX.Element => (
  <NodeViewWrapper className="relative">
    <div className="bg-secondary">
      <Select onValueChange={(value) => updateAttributes({ language: value })} defaultValue={defaultLanguage}>
        <SelectTrigger className="w-[100px] h-8 outline-none border-0 focus:ring-0">
          <SelectValue placeholder="设置语言" />
        </SelectTrigger>
        <SelectContent className="h-[200px]">
          <SelectItem value="null">自动</SelectItem>
          {extension.options.lowlight.listLanguages().map((lang: string, index: number) => (
            <SelectItem key={index} value={lang}>
              {lang}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <pre className="bg-secondary text-secondary-foreground">
      {/* @ts-ignore */}
      <NodeViewContent as="code" />
    </pre>
  </NodeViewWrapper>
);

export default CodeBlockComponent;
