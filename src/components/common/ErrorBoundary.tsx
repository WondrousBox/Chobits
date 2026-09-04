import React, { Component, ReactNode } from 'react';
import { TbCheck, TbChevronDown, TbChevronUp, TbCopy } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, errorInfo: React.ErrorInfo) => ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  isExpanded: boolean;
  isCopied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isExpanded: false,
      isCopied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });

    // 调用外部错误处理函数
    this.props.onError?.(error, errorInfo);

    // 输出错误到控制台
    console.error('ErrorBoundary 捕获到错误:', error, errorInfo);
  }

  private copyWithTextarea(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);

    try {
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  private copyText = async (text: string): Promise<void> => {
    try {
      let copySucceeded = false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copySucceeded = true;
        } catch (err) {
          console.warn('Clipboard API copy failed, falling back to textarea copy:', err);
        }
      }

      if (!copySucceeded) {
        copySucceeded = this.copyWithTextarea(text);
      }

      if (!copySucceeded) {
        throw new Error('copy command returned false');
      }

      this.setState({ isCopied: true });
      setTimeout(() => {
        this.setState({ isCopied: false });
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error!, this.state.errorInfo!);
        }
        return this.props.fallback;
      }

      // 默认错误 UI
      const errorMessage = this.state.error?.message || '未知错误';
      const errorStack = this.state.error?.stack || '';
      const componentStack = this.state.errorInfo?.componentStack || '';

      const errorText = [`错误信息: ${errorMessage}`, errorStack && `\n堆栈信息:\n${errorStack}`, componentStack && `\n组件堆栈:\n${componentStack}`].filter(Boolean).join('\n');

      const handleToggleExpand = (): void => {
        this.setState((prev) => ({ isExpanded: !prev.isExpanded }));
      };

      const errorTitle = this.props.title || '应用出错';

      return (
        <div className="no-drag w-full h-full flex items-center justify-center p-4 select-text" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10 max-w-2xl w-full">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-destructive mb-1">{errorTitle}</div>
                <div className="text-xs text-muted-foreground break-words">{errorMessage}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => void this.copyText(errorText)} className="h-8 px-2 no-drag" title={this.state.isCopied ? '已复制' : '复制错误信息'}>
                  {this.state.isCopied ? <TbCheck /> : <TbCopy />}
                  <span className="ml-1 hidden sm:inline">{this.state.isCopied ? '已复制' : '复制'}</span>
                </Button>
                {(errorStack || componentStack) && (
                  <Button variant="ghost" size="sm" onClick={handleToggleExpand} className="h-8 px-2 no-drag" title={this.state.isExpanded ? '收起详情' : '展开详情'}>
                    {this.state.isExpanded ? <TbChevronUp /> : <TbChevronDown />}
                    <span className="ml-1 hidden sm:inline">{this.state.isExpanded ? '收起' : '详情'}</span>
                  </Button>
                )}
              </div>
            </div>

            {this.state.isExpanded && (errorStack || componentStack) && (
              <div className="mt-3 p-3 bg-background/50 rounded border border-border/50">
                <div className="space-y-3 text-xs font-mono">
                  {errorStack && (
                    <div>
                      <div className="text-muted-foreground mb-1 font-semibold">堆栈信息:</div>
                      <pre className="whitespace-pre-wrap break-words text-muted-foreground overflow-auto max-h-64 select-text">{errorStack}</pre>
                    </div>
                  )}
                  {componentStack && (
                    <div>
                      <div className="text-muted-foreground mb-1 font-semibold">组件堆栈:</div>
                      <pre className="whitespace-pre-wrap break-words text-muted-foreground overflow-auto max-h-64 select-text">{componentStack}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="no-drag"
                onClick={() => {
                  this.setState({
                    hasError: false,
                    error: null,
                    errorInfo: null,
                    isExpanded: false,
                    isCopied: false
                  });
                }}
              >
                重试
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
