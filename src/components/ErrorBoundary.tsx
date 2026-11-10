import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'An unexpected runtime issue occurred.';
    try {
      const parsed = JSON.parse(readable);
      if (parsed && typeof parsed.error === 'string') {
        readable = `Cloud Sync Notice (${parsed.operationType || 'db'}): ${parsed.error}`;
      }
    } catch {
      // Plain error string
    }
    return {
      hasError: true,
      errorMessage: readable,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Jarvis ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-black text-neutral-100 flex items-center justify-center p-6 font-sans">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-display font-semibold text-white">
              Jarvis Recovery Console
            </h2>
            <p className="text-sm text-neutral-400 break-words leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black text-sm font-semibold transition"
            >
              Resume Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
