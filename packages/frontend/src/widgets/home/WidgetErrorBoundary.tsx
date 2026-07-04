import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-4 text-center">
          <div className="text-red-600 dark:text-red-400 text-sm font-medium mb-2">
            ⚠️ Ошибка загрузки виджета
          </div>
          <div className="text-red-500 dark:text-red-500 text-xs mb-3 max-h-20 overflow-hidden">
            {this.state.error?.message || "Неизвестная ошибка"}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry?.();
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
          >
            🔄 Повторить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
