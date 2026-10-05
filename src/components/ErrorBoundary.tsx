import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children?: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DnDocs] Uncaught render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // A new deploy can make old lazy chunks disappear – a reload fixes that.
    const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(this.state.error.message);
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="card w-full max-w-md p-6">
          <h2 className="mb-2 font-display text-xl font-semibold text-rose-300">Something went wrong</h2>
          <p className="mb-4 text-sm text-stone-300">
            {isChunkError ? 'A new version of DnDocs is available.' : 'The page hit an unexpected error. Your data is safe.'}
          </p>
          {!isChunkError && (
            <pre className="mb-5 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs whitespace-pre-wrap text-rose-300">{this.state.error.message}</pre>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => window.location.reload()}>
              Reload
            </button>
            {!isChunkError && (
              <button className="btn btn-secondary flex-1" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
