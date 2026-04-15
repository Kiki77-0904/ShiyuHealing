import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-cream p-4 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md">
            <h2 className="text-2xl font-bold text-brand-ink mb-4">哎呀，出错了</h2>
            <p className="text-brand-ink/70 mb-6">
              抱歉，应用遇到了一个意外错误。你可以尝试刷新页面。
            </p>
            <div className="text-left bg-red-50 p-4 rounded-xl mb-6 overflow-auto max-h-40">
              <code className="text-xs text-red-600">
                {this.state.error?.toString()}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-olive text-white px-6 py-2 rounded-full font-bold hover:scale-105 transition-transform"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
