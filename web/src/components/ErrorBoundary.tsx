import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

const isChunkError = (e: Error) => /dynamically imported module|Importing a module script failed|Loading chunk|MIME type/i.test(e.message);

/**
 * Catches render and page-load errors so a failure shows a message instead of a blank page.
 * A page chunk that can't be fetched (usually an old cached copy after a deploy) reloads once.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CourtSync page error:', error, info.componentStack);
    if (isChunkError(error)) {
      try {
        if (!sessionStorage.getItem('courtsync-chunk-reload')) {
          sessionStorage.setItem('courtsync-chunk-reload', '1');
          window.location.reload();
        }
      } catch {
        /* storage unavailable: show the message below */
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto mt-24 max-w-lg px-4 text-center" role="alert">
        <h1 className="text-lg font-semibold text-slate-900">This page didn't load</h1>
        <p className="mt-2 text-sm text-slate-600">
          {isChunkError(error) ? 'A newer version of CourtSync is available. Reload to get it.' : 'Something went wrong while showing this page.'}
        </p>
        <pre className="mt-4 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-700">{error.message}</pre>
        <button
          type="button"
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            try {
              sessionStorage.removeItem('courtsync-chunk-reload');
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
