import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#1E293B] border border-red-500/30 p-8 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ⚠️
            </div>
            <h1 className="text-xl font-bold mb-2">Aplikace zaznamenala drobnou chybu</h1>
            <p className="text-gray-400 text-sm mb-6">
              {this.state.error?.message || 'Došlo k nečekané události v rozhraní.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-red-500/20"
            >
              Obnovit aplikaci
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
