import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
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
      let errorDetails = this.state.error?.message;
      try {
        const parsed = JSON.parse(this.state.error?.message || '{}');
        if (parsed.error) {
          errorDetails = parsed.error;
        }
      } catch (e) {
        // Not JSON
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-transparent text-stone-100 p-6">
          <div className="max-w-md w-full bg-stone-900/80 backdrop-blur-md border border-red-900/50 rounded-xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-red-500 mb-4 font-cinzel">Something went wrong</h2>
            <p className="text-stone-300 mb-4 text-sm">
              An error occurred while communicating with the database or rendering the page.
            </p>
            <div className="bg-black/50 p-3 rounded-lg overflow-auto text-xs font-mono text-red-400 mb-6">
              {errorDetails || 'Unknown error'}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full py-2 px-4 bg-stone-800 hover:bg-stone-700 text-white rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
